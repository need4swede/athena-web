import { query } from '../database';
import { feeAndCostConfig } from '../config';

export interface InsuranceOverrideRequest {
    chromebook_id: number;
    new_insurance_status: 'insured' | 'pending' | 'uninsured';
    override_reason?: string;
    admin_user_id: number;
}

export interface InsuranceOverrideResult {
    success: boolean;
    message: string;
    data?: {
        override_id: number;
        chromebook_id: number;
        original_status: string;
        new_status: string;
        fee_created?: boolean;
        fee_id?: number;
        workflow_explanation?: string;
    };
    error?: string;
}

export class InsuranceOverrideService {

    /**
     * Override insurance status for a chromebook (super admin only)
     */
    static async overrideInsuranceStatus(request: InsuranceOverrideRequest): Promise<InsuranceOverrideResult> {
        console.log(`🔧 [Insurance Override] Starting override for chromebook ${request.chromebook_id} to status: ${request.new_insurance_status}`);

        // Start transaction
        await query('BEGIN');

        try {
            // 1. Get current chromebook status
            const chromebookResult = await query(
                `SELECT id, asset_tag, serial_number, status, insurance_status, current_user_id, checked_out_date
                 FROM chromebooks WHERE id = $1`,
                [request.chromebook_id]
            );

            if (chromebookResult.rows.length === 0) {
                await query('ROLLBACK');
                return {
                    success: false,
                    message: 'Chromebook not found',
                    error: 'CHROMEBOOK_NOT_FOUND'
                };
            }

            const chromebook = chromebookResult.rows[0];
            const originalStatus = chromebook.insurance_status || 'uninsured';

            // 2. Validate the override request
            if (originalStatus === request.new_insurance_status) {
                await query('ROLLBACK');
                return {
                    success: false,
                    message: `Chromebook is already ${request.new_insurance_status}`,
                    error: 'NO_CHANGE_NEEDED'
                };
            }

            // 3. Validate chromebook state
            if (chromebook.status !== 'checked_out' && chromebook.status !== 'pending_signature') {
                await query('ROLLBACK');
                return {
                    success: false,
                    message: 'Insurance status can only be overridden for checked out or pending signature devices',
                    error: 'INVALID_DEVICE_STATUS'
                };
            }

            // 4. Get student information if device is checked out
            let student = null;
            if (chromebook.current_user_id) {
                const studentResult = await query(
                    'SELECT * FROM students WHERE id = $1',
                    [chromebook.current_user_id]
                );
                if (studentResult.rows.length > 0) {
                    student = studentResult.rows[0];
                }
            }

            if (!student) {
                await query('ROLLBACK');
                return {
                    success: false,
                    message: 'Cannot override insurance status - no student associated with device',
                    error: 'NO_STUDENT_FOUND'
                };
            }

            // 5. Execute the appropriate override workflow
            let workflowResult;
            switch (request.new_insurance_status) {
                case 'insured':
                case 'pending':
                    workflowResult = await this.executeInsuredOverride(
                        chromebook, student, request, originalStatus
                    );
                    break;
                case 'uninsured':
                    workflowResult = await this.executeUninsuredOverride(
                        chromebook, student, request, originalStatus
                    );
                    break;
                default:
                    throw new Error(`Invalid insurance status: ${request.new_insurance_status}`);
            }

            if (!workflowResult.success) {
                await query('ROLLBACK');
                return workflowResult;
            }

            // 6. Record the override in insurance_overrides table
            const overrideResult = await query(
                `INSERT INTO insurance_overrides (chromebook_id, original_status, new_status, override_reason, admin_user_id)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [request.chromebook_id, originalStatus, request.new_insurance_status, request.override_reason, request.admin_user_id]
            );

            const overrideId = overrideResult.rows[0].id;

            // 7. Create device history entry
            await query(
                `INSERT INTO device_history (chromebook_id, user_id, student_id, event_type, details)
                 VALUES ($1, $2, $3, 'Insurance Override', $4::jsonb)`,
                [
                    chromebook.id,
                    request.admin_user_id,
                    student.id,
                    JSON.stringify({
                        original_status: originalStatus,
                        new_status: request.new_insurance_status,
                        override_reason: request.override_reason,
                        admin_override: true,
                        fee_created: workflowResult.data?.fee_created || false,
                        fee_id: workflowResult.data?.fee_id
                    })
                ]
            );

            // 8. Update checkout history to reflect new insurance status for future agreements
            // Update the most recent checkout record for this chromebook
            await query(
                `UPDATE checkout_history ch
                 SET insurance = $1
                 WHERE id = (
                     SELECT id
                     FROM checkout_history
                     WHERE chromebook_id = $2
                       AND action = 'checkout'
                       AND status IN ('pending', 'completed')
                     ORDER BY action_date DESC
                     LIMIT 1
                 )`,
                [request.new_insurance_status, chromebook.id]
            );

            await query('COMMIT');

            console.log(`✅ [Insurance Override] Successfully overridden insurance status for chromebook ${request.chromebook_id}`);

            return {
                success: true,
                message: `Insurance status successfully overridden from ${originalStatus} to ${request.new_insurance_status}`,
                data: {
                    override_id: overrideId,
                    chromebook_id: chromebook.id,
                    original_status: originalStatus,
                    new_status: request.new_insurance_status,
                    fee_created: workflowResult.data?.fee_created || false,
                    fee_id: workflowResult.data?.fee_id,
                    workflow_explanation: workflowResult.data?.workflow_explanation
                }
            };

        } catch (error) {
            await query('ROLLBACK');
            console.error(`❌ [Insurance Override] Error overriding insurance status:`, error);
            return {
                success: false,
                message: 'Failed to override insurance status',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Execute workflow for overriding to insured/pending status
     */
    private static async executeInsuredOverride(
        chromebook: any,
        student: any,
        request: InsuranceOverrideRequest,
        originalStatus: string
    ): Promise<{ success: boolean; message: string; data?: any; error?: string }> {
        console.log(`💰 [Insurance Override] Executing insured override workflow`);

        // 1. Create insurance fee using existing service first
        const { replaceInsuranceFee, getAvailableCredits, transferCreditToFee } = await import('./feeService');

        // Create unique idempotency key for this override
        const idempotencyKey = `override_${request.chromebook_id}_${Date.now()}`;

        // Get current asset tag for credit tracking
        const deviceResult = await query(
            'SELECT asset_tag FROM chromebooks WHERE id = $1',
            [chromebook.id]
        );
        const currentAssetTag = deviceResult.rows[0]?.asset_tag;

        // Create the new insurance fee
        const feeResult = await replaceInsuranceFee(
            student.id,
            feeAndCostConfig.ltcFee, // $40 insurance fee
            `Device Insurance Fee (Admin Override: ${originalStatus} → ${request.new_insurance_status})`,
            request.admin_user_id,
            idempotencyKey,
            undefined, // No checkout ID
            currentAssetTag
        );

        console.log(`✅ [Insurance Override] Created insurance fee ${feeResult.fee.id} for $${feeAndCostConfig.ltcFee}`);

        // 2. Check for available credits and apply them automatically (just like checkout process)
        let appliedCredits = [];
        let totalCreditApplied = 0;
        let workflowExplanation = '';

        try {
            const availableCredits = await getAvailableCredits(student.id);
            console.log(`💳 [Insurance Override] Found ${availableCredits.length} available credits for student ${student.id}`);

            if (availableCredits.length > 0) {
                // Apply credits in order until fee is fully paid or credits are exhausted
                const feeAmount = feeAndCostConfig.ltcFee;
                let remainingAmount = feeAmount;

                for (const credit of availableCredits) {
                    if (remainingAmount <= 0) break;
                    if (!credit.id) {
                        console.warn(`💳 [Insurance Override] Skipping credit with missing ID: ${credit.transaction_id}`);
                        continue;
                    }

                    console.log(`💳 [Insurance Override] Applying credit ${credit.transaction_id} ($${credit.amount}) from device ${credit.original_asset_tag || 'unknown'}`);

                    // Transfer the credit to the new fee
                    if (!feeResult.fee.id) {
                        console.error(`💳 [Insurance Override] Fee ID is missing, cannot apply credit ${credit.transaction_id}`);
                        continue;
                    }

                    const appliedPayment = await transferCreditToFee(
                        credit.id,
                        feeResult.fee.id,
                        request.admin_user_id
                    );

                    const creditAmount = Number(credit.amount) || 0;

                    appliedCredits.push({
                        transaction_id: credit.transaction_id,
                        amount: creditAmount,
                        original_asset_tag: credit.original_asset_tag,
                        payment_id: appliedPayment.id
                    });

                    totalCreditApplied += creditAmount;
                    remainingAmount -= creditAmount;

                    console.log(`✅ [Insurance Override] Applied credit ${credit.transaction_id} - remaining balance: $${Math.max(0, remainingAmount)}`);
                }
            }
        } catch (creditError) {
            console.error(`⚠️ [Insurance Override] Error applying credits (non-critical):`, creditError);
            // Continue with the override even if credit application fails
        }

        // 3. Update device status based on whether fee is fully paid
        const remainingBalance = feeAndCostConfig.ltcFee - totalCreditApplied;
        let finalInsuranceStatus = 'pending';
        let isInsured = false;

        if (remainingBalance <= 0) {
            // Fee is fully paid by credits
            finalInsuranceStatus = 'insured';
            isInsured = true;
            console.log(`✅ [Insurance Override] Fee fully paid by credits - marking device as insured`);
        } else {
            console.log(`⏳ [Insurance Override] Partial payment by credits - remaining balance: $${remainingBalance}`);
        }

        await query(
            `UPDATE chromebooks
             SET insurance_status = $1, is_insured = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [finalInsuranceStatus, isInsured, chromebook.id]
        );

        // 4. Build workflow explanation
        if (appliedCredits.length > 0) {
            const creditDetails = appliedCredits.map(credit =>
                `$${credit.amount} from ${credit.original_asset_tag || 'previous device'} (${credit.transaction_id})`
            ).join(', ');

            if (remainingBalance <= 0) {
                workflowExplanation = `Device status updated to 'Insured'. A $${feeAndCostConfig.ltcFee} insurance fee was created and automatically paid in full using available credits: ${creditDetails}. Future agreements will print with insurance coverage.`;
            } else {
                workflowExplanation = `Device status updated to 'Not Insured (Payment Pending)'. A $${feeAndCostConfig.ltcFee} insurance fee was created with $${totalCreditApplied} automatically applied from available credits: ${creditDetails}. Remaining balance: $${remainingBalance}. Once the remaining amount is paid, the device will be marked as 'Insured'.`;
            }
        } else {
            workflowExplanation = `Device status updated to 'Not Insured (Payment Pending)'. A $${feeAndCostConfig.ltcFee} insurance fee has been added to the student's account. Once payment is made, the device will be marked as 'Insured' and future agreements will print with insurance coverage.`;
        }

        return {
            success: true,
            message: 'Insurance override workflow completed successfully',
            data: {
                fee_created: true,
                fee_id: feeResult.fee.id,
                credits_applied: appliedCredits.length,
                total_credit_applied: totalCreditApplied,
                remaining_balance: Math.max(0, remainingBalance),
                applied_credits: appliedCredits,
                workflow_explanation: workflowExplanation
            }
        };
    }

    /**
     * Execute workflow for overriding to uninsured status
     */
    private static async executeUninsuredOverride(
        chromebook: any,
        student: any,
        request: InsuranceOverrideRequest,
        originalStatus: string
    ): Promise<{ success: boolean; message: string; data?: any; error?: string }> {
        console.log(`🚫 [Insurance Override] Executing uninsured override workflow`);

        // 1. Update device status to uninsured
        await query(
            `UPDATE chromebooks
             SET insurance_status = 'uninsured', is_insured = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [chromebook.id]
        );

        // 2. Archive any existing unpaid insurance fees for this student
        const existingFeesResult = await query(
            `SELECT sf.id, sf.amount, sf.description
             FROM student_fees sf
             LEFT JOIN fee_payments fp ON sf.id = fp.student_fee_id
             WHERE sf.student_id = $1
               AND sf.description LIKE '%Insurance%'
               AND sf.replaced_at IS NULL
               AND fp.id IS NULL`,
            [student.id]
        );

        let archivedFeesCount = 0;
        if (existingFeesResult.rows.length > 0) {
            // Archive fees by marking them as replaced (no archiveFee function exists)
            for (const fee of existingFeesResult.rows) {
                await query(
                    `UPDATE student_fees
                     SET replaced_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [fee.id]
                );
                archivedFeesCount++;
                console.log(`📦 [Insurance Override] Archived unpaid insurance fee ${fee.id}`);
            }
        }

        return {
            success: true,
            message: 'Insurance override workflow completed successfully',
            data: {
                fee_created: false,
                workflow_explanation: `Device status updated to 'Not Insured'. ${archivedFeesCount > 0 ? `${archivedFeesCount} unpaid insurance fee(s) have been archived. ` : ''}Future agreements will print without insurance coverage.`
            }
        };
    }

    /**
     * Get override history for a chromebook
     */
    static async getOverrideHistory(chromebook_id: number): Promise<any[]> {
        const result = await query(
            `SELECT io.*, u.name as admin_name, u.email as admin_email
             FROM insurance_overrides io
             JOIN users u ON io.admin_user_id = u.id
             WHERE io.chromebook_id = $1
             ORDER BY io.created_at DESC`,
            [chromebook_id]
        );

        return result.rows.map(row => ({
            id: row.id,
            original_status: row.original_status,
            new_status: row.new_status,
            override_reason: row.override_reason,
            admin_name: row.admin_name,
            admin_email: row.admin_email,
            created_at: row.created_at
        }));
    }

    /**
     * Get all insurance overrides (for reporting/auditing)
     */
    static async getAllOverrides(limit: number = 100, offset: number = 0): Promise<{
        overrides: any[];
        total: number;
    }> {
        // Get total count
        const countResult = await query(
            'SELECT COUNT(*) as total FROM insurance_overrides'
        );
        const total = parseInt(countResult.rows[0].total);

        // Get paginated results
        const result = await query(
            `SELECT io.*,
                    u.name as admin_name,
                    u.email as admin_email,
                    c.asset_tag,
                    c.serial_number,
                    s.first_name || ' ' || s.last_name as student_name,
                    s.student_id
             FROM insurance_overrides io
             JOIN users u ON io.admin_user_id = u.id
             JOIN chromebooks c ON io.chromebook_id = c.id
             LEFT JOIN students s ON c.current_user_id = s.id
             ORDER BY io.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        return {
            overrides: result.rows,
            total
        };
    }
}
