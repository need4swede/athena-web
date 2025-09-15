// Delete a payment (transaction) by its ID
export const deleteFeePayment = async (paymentId: number): Promise<void> => {
    await query('BEGIN');
    try {
        // Delete the payment
        const result = await query('DELETE FROM fee_payments WHERE id = $1 RETURNING *', [paymentId]);
        if (result.rows.length === 0) {
            throw new Error('Payment not found');
        }
        await query('COMMIT');
    } catch (error) {
        await query('ROLLBACK');
        throw error;
    }
};

// Archive a payment as credit (Super Admin function)
export const archivePaymentAsCredit = async (paymentId: number): Promise<AvailableCredit> => {
    console.log(`📦 [Archive Payment] Starting archive process for payment ID ${paymentId}`);

    await query('BEGIN');
    try {
        // Get the payment details
        const paymentResult = await query(
            `SELECT fp.*, sf.student_id, sf.description as fee_description
             FROM fee_payments fp
             JOIN student_fees sf ON fp.student_fee_id = sf.id
             WHERE fp.id = $1`,
            [paymentId]
        );

        if (paymentResult.rows.length === 0) {
            throw new Error('Payment not found');
        }

        const payment = paymentResult.rows[0];

        // Check if payment is already archived
        const existingArchive = await query(
            'SELECT id FROM archived_fee_payments WHERE original_payment_id = $1',
            [paymentId]
        );

        if (existingArchive.rows.length > 0) {
            throw new Error('Payment already archived');
        }

        // Additional duplicate safety: if the same transaction has already been archived for this student,
        // or has already been applied to another fee as a credit payment, block archiving.
        if (payment.transaction_id) {
            // Already archived for this student by transaction_id
            const archivedByTxn = await query(
                'SELECT 1 FROM archived_fee_payments WHERE student_id = $1 AND transaction_id = $2',
                [payment.student_id, payment.transaction_id]
            );
            if (archivedByTxn.rows.length > 0) {
                throw new Error('Payment already archived');
            }

            // Already applied elsewhere (a credit transfer preserves original transaction_id)
            const appliedElsewhere = await query(
                'SELECT 1 FROM fee_payments WHERE transaction_id = $1 AND id <> $2',
                [payment.transaction_id, paymentId]
            );
            if (appliedElsewhere.rows.length > 0) {
                throw new Error('Payment already applied');
            }
        }

        // Determine asset tag - try to find from student's current or recent checkout
        let assetTag = null;
        const assetTagResult = await query(
            `SELECT c.asset_tag
             FROM chromebooks c
             WHERE c.current_user_id = $1
             AND c.status = 'checked_out'
             LIMIT 1`,
            [payment.student_id]
        );

        if (assetTagResult.rows.length > 0) {
            assetTag = assetTagResult.rows[0].asset_tag;
        } else {
            // Try to find from recent checkout history
            const historyResult = await query(
                `SELECT c.asset_tag
                 FROM checkout_history ch
                 JOIN chromebooks c ON c.id = ch.chromebook_id
                 WHERE ch.student_id = $1
                 AND ch.action = 'checkout'
                 AND ch.action_date <= $2
                 AND ch.action_date >= ($2 - INTERVAL '30 days')
                 ORDER BY ch.action_date DESC
                 LIMIT 1`,
                [payment.student_id, payment.created_at]
            );

            if (historyResult.rows.length > 0) {
                assetTag = historyResult.rows[0].asset_tag;
            }
        }

        console.log(`📦 [Archive Payment] Found asset tag: ${assetTag || 'none'} for student ${payment.student_id}`);

        // Archive the payment
        const archiveResult = await query(
            `INSERT INTO archived_fee_payments (
                student_id, original_fee_id, original_payment_id, amount, 
                payment_method, notes, processed_by_user_id, created_at, 
                transaction_id, archived_at, original_asset_tag
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10) 
            RETURNING *`,
            [
                payment.student_id,
                payment.student_fee_id,
                paymentId,
                payment.amount,
                payment.payment_method,
                payment.notes,
                payment.processed_by_user_id,
                payment.created_at,
                payment.transaction_id,
                assetTag
            ]
        );

        const archivedCredit = archiveResult.rows[0];

        // Delete the original payment
        await query('DELETE FROM fee_payments WHERE id = $1', [paymentId]);

        // Check if the fee has any remaining payments
        const remainingPaymentsResult = await query(
            'SELECT COUNT(*) as payment_count FROM fee_payments WHERE student_fee_id = $1',
            [payment.student_fee_id]
        );

        const remainingPayments = parseInt(remainingPaymentsResult.rows[0].payment_count);
        console.log(`📦 [Archive Payment] Fee ${payment.student_fee_id} has ${remainingPayments} remaining payments`);

        // If no payments remain, delete the fee as well (since it was fully paid before archiving)
        if (remainingPayments === 0) {
            console.log(`📦 [Archive Payment] Deleting fee ${payment.student_fee_id} since all payments were archived`);
            await query('DELETE FROM student_fees WHERE id = $1', [payment.student_fee_id]);
        }

        // Commit transaction
        await query('COMMIT');

        console.log(`✅ [Archive Payment] Successfully archived payment ${paymentId} as credit ${archivedCredit.id}`);

        // Return the archived credit in the expected format
        return {
            id: archivedCredit.id,
            transaction_id: archivedCredit.transaction_id,
            amount: archivedCredit.amount,
            payment_method: archivedCredit.payment_method,
            notes: archivedCredit.notes,
            processed_by_user_id: archivedCredit.processed_by_user_id,
            created_at: archivedCredit.created_at,
            archived_at: archivedCredit.archived_at,
            original_asset_tag: archivedCredit.original_asset_tag,
            original_fee_description: payment.fee_description
        };

    } catch (error) {
        await query('ROLLBACK');
        console.error(`❌ [Archive Payment] Failed to archive payment ${paymentId}:`, error);
        throw error;
    }
};
import { query } from '../database';

// Helper function to format credit notes consistently
function formatCreditNotes(originalAssetTag?: string, originalNotes?: string): string {
    let notes = 'Credit from previous payment';
    if (originalAssetTag) {
        notes = `Credit from ${originalAssetTag}`;
    }
    // Only append the colon and original notes if they exist and are not empty
    if (originalNotes && originalNotes.trim() !== '') {
        notes += `: ${originalNotes.trim()}`;
    }
    return notes;
}

// Generate a unique transaction ID
export async function generateTransactionId(feeType: 'I' | 'D', paymentDate: Date = new Date()): Promise<string> {
    // Format date as YYMMDD in PST timezone
    const pstDate = new Date(paymentDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const year = pstDate.getFullYear().toString().slice(-2); // Get last digit of year
    const month = (pstDate.getMonth() + 1).toString().padStart(2, '0');
    const day = pstDate.getDate().toString().padStart(2, '0');
    const datePart = year + month + day;

    // Try up to 100 times to generate a unique ID
    for (let i = 0; i < 100; i++) {
        const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const transactionId = `T${feeType}${datePart}${randomPart}`;

        // Check if this ID already exists
        const existing = await query(
            'SELECT 1 FROM fee_payments WHERE transaction_id = $1',
            [transactionId]
        );

        if (existing.rows.length === 0) {
            return transactionId;
        }
    }

    throw new Error('Could not generate unique transaction ID after 100 attempts');
}

// Determine fee type from description
function determineFeeType(description: string): 'I' | 'D' {
    return description.toLowerCase().includes('insurance') ? 'I' : 'D';
}

export interface StudentFee {
    id?: number;
    student_id: number;
    maintenance_id?: number;
    amount: number;
    description: string;
    created_at?: Date;
    created_by_user_id: number;
    payments?: FeePayment[];
    balance?: number;
    device_asset_tag?: string;
}

export interface FeePayment {
    id?: number;
    student_fee_id: number;
    amount: number;
    payment_method?: string;
    notes?: string;
    processed_by_user_id: number;
    created_at?: Date;
    transaction_id?: string;
}

import { SandboxStore } from './sandboxStore';
import { SandboxOverlay } from './sandboxOverlay';

export const getStudentFees = async (studentId: number, opts: { sandboxUserId?: number } = {}): Promise<StudentFee[]> => {
    const result = await query(
        `SELECT
            sf.*,
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'id', fp.id,
                            'student_fee_id', fp.student_fee_id,
                            'amount', fp.amount,
                            'payment_method', fp.payment_method,
                            'notes', fp.notes,
                            'processed_by_user_id', fp.processed_by_user_id,
                            'created_at', fp.created_at,
                            'transaction_id', fp.transaction_id
                        )
                    )
                    FROM fee_payments fp
                    WHERE fp.student_fee_id = sf.id
                ),
                '[]'::json
            ) AS payments,
            -- First try to get currently checked out device
            COALESCE(
                c.asset_tag,
                -- Then try to get device from archived payments for this fee
                (
                    SELECT afp.original_asset_tag
                    FROM archived_fee_payments afp
                    INNER JOIN fee_payments fp ON fp.transaction_id = afp.transaction_id
                    WHERE fp.student_fee_id = sf.id
                    AND afp.original_asset_tag IS NOT NULL
                    LIMIT 1
                ),
                -- Finally try to get device from checkout history around the fee creation time
                (
                    SELECT chr.asset_tag
                    FROM checkout_history ch
                    JOIN chromebooks chr ON chr.id = ch.chromebook_id
                    WHERE ch.student_id = sf.student_id
                    AND ch.action = 'checkout'
                    AND ch.action_date <= sf.created_at
                    AND ch.action_date >= (sf.created_at - INTERVAL '30 days')
                    ORDER BY ch.action_date DESC
                    LIMIT 1
                )
            ) AS device_asset_tag
        FROM student_fees sf
        LEFT JOIN chromebooks c ON c.current_user_id = sf.student_id AND c.status = 'checked_out'
        WHERE sf.student_id = $1
        ORDER BY sf.created_at DESC`,
        [studentId]
    );

    let fees = result.rows.map((fee: any) => {
        const payments: FeePayment[] = fee.payments || [];
        const totalPaid = payments.reduce((sum: number, p: FeePayment) => sum + parseFloat(p.amount.toString()), 0);
        const balance = parseFloat(fee.amount) - totalPaid;

        // If we still don't have a device_asset_tag and this is an insurance fee, try to extract from description
        let deviceAssetTag = fee.device_asset_tag;
        if (!deviceAssetTag && fee.description) {
            // Try to extract device tag from description (e.g., "Device Insurance Fee - DCS1234")
            const deviceMatch = fee.description.match(/(?:DCS|NJESD)\d+/i);
            if (deviceMatch) {
                deviceAssetTag = deviceMatch[0];
            }
        }

        return { ...fee, payments, balance, device_asset_tag: deviceAssetTag };
    });

    if (opts.sandboxUserId && SandboxStore.isActive(opts.sandboxUserId)) {
        fees = SandboxOverlay.mergeFees(opts.sandboxUserId, fees);
    }
    return fees;
};

export const createStudentFee = async (fee: Omit<StudentFee, 'id'>): Promise<StudentFee> => {
    const { student_id, maintenance_id, amount, description, created_by_user_id } = fee;
    const result = await query(
        'INSERT INTO student_fees (student_id, maintenance_id, amount, description, created_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [student_id, maintenance_id, amount, description, created_by_user_id]
    );
    return result.rows[0];
};

export const addFeePayment = async (payment: Omit<FeePayment, 'id'>): Promise<FeePayment> => {
    const { student_fee_id, amount, payment_method, notes, processed_by_user_id } = payment;

    // Start transaction
    await query('BEGIN');

    try {
        // Get fee description to determine fee type
        const feeResult = await query(
            'SELECT description FROM student_fees WHERE id = $1',
            [student_fee_id]
        );

        if (feeResult.rows.length === 0) {
            throw new Error('Fee not found');
        }

        const feeType = determineFeeType(feeResult.rows[0].description);
        const transactionId = await generateTransactionId(feeType);

        // Add the payment with transaction ID
        const result = await query(
            'INSERT INTO fee_payments (student_fee_id, amount, payment_method, notes, processed_by_user_id, transaction_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [student_fee_id, amount, payment_method, notes, processed_by_user_id, transactionId]
        );

        const newPayment = result.rows[0];

        // Check if this is an insurance fee and if it's now fully paid
        const feeDetailsResult = await query(
            `SELECT sf.*, s.id as student_db_id
             FROM student_fees sf
             JOIN students s ON sf.student_id = s.id
             WHERE sf.id = $1`,
            [student_fee_id]
        );

        console.log(`🔍 [Fee Payment Debug] Fee lookup result:`, feeDetailsResult.rows);

        if (feeDetailsResult.rows.length > 0) {
            const fee = feeDetailsResult.rows[0];
            console.log(`🔍 [Fee Payment Debug] Fee details:`, fee);

            // Check if this is an insurance fee
            const isInsuranceFee = fee.description && fee.description.toLowerCase().includes('insurance');
            console.log(`🔍 [Fee Payment Debug] Is insurance fee: ${isInsuranceFee}, description: "${fee.description}"`);

            if (isInsuranceFee) {
                // Invalidate any existing credits since a new payment was made instead of using available credit
                console.log(`🚫 [Fee Payment] Invalidating existing credits for student ${fee.student_db_id} since new payment was made`);
                const invalidatedCount = await invalidateUnusedCredits(
                    fee.student_db_id,
                    `New insurance payment made (Transaction: ${transactionId}) instead of using available credit`
                );
                console.log(`🚫 [Fee Payment] Invalidated ${invalidatedCount} existing credits`);

                // Calculate total payments for this fee
                const paymentsResult = await query(
                    'SELECT COALESCE(SUM(amount), 0) as total_paid FROM fee_payments WHERE student_fee_id = $1',
                    [student_fee_id]
                );

                const totalPaid = parseFloat(paymentsResult.rows[0].total_paid);
                const feeAmount = parseFloat(fee.amount);

                console.log(`🔍 [Fee Payment Debug] Total paid: ${totalPaid}, Fee amount: ${feeAmount}, Is fully paid: ${totalPaid >= feeAmount}`);

                // If fee is fully paid, update chromebook insurance status
                if (totalPaid >= feeAmount) {
                    console.log(`🔍 [Fee Payment Debug] Attempting to update chromebook insurance status for student DB ID: ${fee.student_db_id}`);

                    // Be more permissive: if the student's device is currently checked out or pending signature,
                    // set insurance to insured regardless of previous insurance_status.
                    const updateResult = await query(
                        `UPDATE chromebooks
                         SET insurance_status = 'insured',
                             is_insured = true,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE current_user_id = $1
                           AND status IN ('checked_out','pending_signature')
                         RETURNING id, asset_tag, insurance_status, is_insured`,
                        [fee.student_db_id]
                    );

                    console.log(`🔍 [Fee Payment Debug] Update result:`, updateResult.rows);

                    if (updateResult.rows.length > 0) {
                        console.log(`✅ Insurance fee fully paid for student ${fee.student_db_id}, updated chromebook insurance status to 'insured'`);
                    } else {
                        console.log(`⚠️ No chromebooks were updated. Checking current chromebook status...`);

                        const checkResult = await query(
                            `SELECT id, asset_tag, current_user_id, insurance_status, is_insured
                             FROM chromebooks
                             WHERE current_user_id = $1`,
                            [fee.student_db_id]
                        );

                        console.log(`🔍 [Fee Payment Debug] Current chromebook status for student ${fee.student_db_id}:`, checkResult.rows);
                    }
                } else {
                    console.log(`🔍 [Fee Payment Debug] Insurance fee not fully paid yet. Still owed: ${feeAmount - totalPaid}`);
                }
            }
        }

        // Commit transaction
        await query('COMMIT');

        return newPayment;

    } catch (error) {
        // Rollback transaction on error
        await query('ROLLBACK');
        throw error;
    }
};

export interface PreviousInsurancePayment {
    transaction_id: string;
    amount: number;
    payment_method: string;
    notes?: string;
    processed_by_user_id: number;
    created_at: Date;
    original_fee_description: string;
    original_asset_tag?: string;
}

// Replace insurance fee and capture asset tag when archiving payments
export const replaceInsuranceFee = async (
    studentId: number,
    amount: number,
    description: string = 'Device Insurance Fee',
    createdByUserId: number,
    idempotencyKey?: string,
    checkoutId?: number,
    currentAssetTag?: string
): Promise<{ fee: StudentFee; previousPayments: PreviousInsurancePayment[] }> => {
    console.log(`🔄 [Insurance Replacement] Starting replacement for student ${studentId}, asset tag: ${currentAssetTag}`);

    // Start transaction
    await query('BEGIN');
    console.log(`[DEBUG] replaceInsuranceFee called for studentId=${studentId}, amount=${amount}, description=${description}, createdByUserId=${createdByUserId}, idempotencyKey=${idempotencyKey}, checkoutId=${checkoutId}, currentAssetTag=${currentAssetTag}`);

    try {
        // Find existing insurance fee for this student
        const existingFeeResult = await query(
            `SELECT sf.id, sf.description,
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'id', fp.id,
                                    'transaction_id', fp.transaction_id,
                                    'amount', fp.amount,
                                    'payment_method', fp.payment_method,
                                    'notes', fp.notes,
                                    'processed_by_user_id', fp.processed_by_user_id,
                                    'created_at', fp.created_at
                                )
                            )
                            FROM fee_payments fp
                            WHERE fp.student_fee_id = sf.id
                        ),
                        '[]'::json
                    ) AS payments
             FROM student_fees sf
             WHERE sf.student_id = $1 AND sf.description = 'Device Insurance Fee'
             ORDER BY sf.created_at DESC LIMIT 1`,
            [studentId]
        );

        let previousPayments: PreviousInsurancePayment[] = [];

        if (existingFeeResult.rows.length > 0) {
            const oldFee = existingFeeResult.rows[0];
            console.log(`🔄 [Insurance Replacement] Found existing insurance fee ${oldFee.id}, archiving payment history`);

            // Store previous payments for manual application
            const payments = oldFee.payments || [];
            previousPayments = payments.map((p: any) => ({
                ...p,
                original_fee_description: oldFee.description
            }));

            // Determine asset tag for archiving
            let assetTagForArchive = currentAssetTag;
            if (!assetTagForArchive) {
                // Try to find asset tag from checkout history around the fee creation time
                const assetTagResult = await query(
                    `SELECT c.asset_tag
                     FROM checkout_history ch
                     JOIN chromebooks c ON c.id = ch.chromebook_id
                     WHERE ch.student_id = $1
                     AND ch.action = 'checkout'
                     AND ch.insurance IN ('pending', 'insured')
                     AND ch.action_date <= $2
                     AND ch.action_date >= ($2 - INTERVAL '30 days')
                     ORDER BY ch.action_date DESC
                     LIMIT 1`,
                    [studentId, oldFee.created_at || new Date()]
                );

                if (assetTagResult.rows.length > 0) {
                    assetTagForArchive = assetTagResult.rows[0].asset_tag;
                    console.log(`🔍 [Archive] Found asset tag from checkout history: ${assetTagForArchive}`);
                }
            }

            // Archive payments before deleting fee
            for (const p of payments) {
                // Check if already archived
                const archivedCheck = await query(
                    `SELECT id, is_invalidated FROM archived_fee_payments WHERE transaction_id = $1 AND student_id = $2`,
                    [p.transaction_id, studentId]
                );
                if (archivedCheck.rows.length === 0) {
                    await query(
                        `INSERT INTO archived_fee_payments
                            (student_id, original_fee_id, original_payment_id, amount, payment_method, notes, processed_by_user_id, created_at, transaction_id, archived_at, original_asset_tag)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
                        [
                            studentId,
                            oldFee.id,
                            p.id || null,
                            p.amount,
                            p.payment_method,
                            p.notes,
                            p.processed_by_user_id,
                            p.created_at,
                            p.transaction_id,
                            assetTagForArchive
                        ]
                    );
                    console.log(`[Archive] Archived insurance payment transaction_id=${p.transaction_id} for student_id=${studentId} with asset_tag=${assetTagForArchive}`);
                } else {
                    // Reactivate previously used credit so it can be reused after swap
                    const creditId = archivedCheck.rows[0].id;
                    const wasInvalidated = !!archivedCheck.rows[0].is_invalidated;
                    await query(
                        `UPDATE archived_fee_payments
                         SET is_invalidated = FALSE,
                             invalidated_at = NULL,
                             invalidated_reason = NULL,
                             original_asset_tag = COALESCE($2, original_asset_tag),
                             archived_at = NOW()
                         WHERE id = $1`,
                        [creditId, assetTagForArchive]
                    );
                    console.log(`[Archive] Reactivated existing credit transaction_id=${p.transaction_id} for student_id=${studentId} (was_invalidated=${wasInvalidated})`);
                }
            }

            // Delete the old fee (cascade will delete payments)
            const deleteResult = await query(
                'DELETE FROM student_fees WHERE id = $1 RETURNING id',
                [oldFee.id]
            );

            if (deleteResult.rows.length > 0) {
                console.log(`✅ [Insurance Replacement] Deleted old fee ${oldFee.id} and ${payments.length} associated payments`);
            }

            // Retroactively archive any late payments made to the old fee after it was replaced
            const latePayments = await query(
                `SELECT fp.* FROM fee_payments fp
                 LEFT JOIN archived_fee_payments afp ON afp.transaction_id = fp.transaction_id
                 WHERE fp.student_fee_id = $1 AND afp.id IS NULL`,
                [oldFee.id]
            );
            for (const p of latePayments.rows) {
                const archivedCheck2 = await query(
                    `SELECT id, is_invalidated FROM archived_fee_payments WHERE transaction_id = $1 AND student_id = $2`,
                    [p.transaction_id, studentId]
                );
                if (archivedCheck2.rows.length === 0) {
                    await query(
                        `INSERT INTO archived_fee_payments
                            (student_id, original_fee_id, original_payment_id, amount, payment_method, notes, processed_by_user_id, created_at, transaction_id, archived_at, original_asset_tag)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
                        [
                            studentId,
                            oldFee.id,
                            p.id || null,
                            p.amount,
                            p.payment_method,
                            p.notes,
                            p.processed_by_user_id,
                            p.created_at,
                            p.transaction_id,
                            assetTagForArchive
                        ]
                    );
                    console.log(`[Archive] (Late) Archived insurance payment transaction_id=${p.transaction_id} for student_id=${studentId} with asset_tag=${assetTagForArchive}`);
                } else {
                    const creditId2 = archivedCheck2.rows[0].id;
                    const wasInvalidated2 = !!archivedCheck2.rows[0].is_invalidated;
                    await query(
                        `UPDATE archived_fee_payments
                         SET is_invalidated = FALSE,
                             invalidated_at = NULL,
                             invalidated_reason = NULL,
                             original_asset_tag = COALESCE($2, original_asset_tag),
                             archived_at = NOW()
                         WHERE id = $1`,
                        [creditId2, assetTagForArchive]
                    );
                    console.log(`[Archive] (Late) Reactivated existing credit transaction_id=${p.transaction_id} for student_id=${studentId} (was_invalidated=${wasInvalidated2})`);
                }
            }
        } else {
            console.log(`🔄 [Insurance Replacement] No existing insurance fee found`);
        }

        // Create new insurance fee (always full amount)
        const newFeeResult = await query(
            `INSERT INTO student_fees (student_id, amount, description, created_by_user_id, idempotency_key, checkout_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [studentId, amount, description, createdByUserId, idempotencyKey, checkoutId]
        );

        const newFee = newFeeResult.rows[0];

        // Commit transaction
        await query('COMMIT');

        console.log(`✅ [Insurance Replacement] Created new fee ${newFee.id} for full amount ${amount}`);
        return { fee: newFee, previousPayments };

    } catch (error) {
        // Rollback transaction on error
        await query('ROLLBACK');
        console.error(`❌ [Insurance Replacement] Failed for student ${studentId}:`, error);
        throw error;
    }
};

// Enhanced interface for available credits with asset tag info
export interface AvailableCredit extends PreviousInsurancePayment {
    id: number;
    original_asset_tag?: string;
    archived_at: Date;
}

// Get available credits for a student (non-invalidated only, with asset tag info)
export const getAvailableCredits = async (studentId: number): Promise<AvailableCredit[]> => {
    const result = await query(
        `SELECT id, amount, payment_method, notes, processed_by_user_id, created_at,
                transaction_id, archived_at, original_asset_tag
         FROM archived_fee_payments
         WHERE student_id = $1 AND is_invalidated = FALSE
         ORDER BY archived_at DESC`,
        [studentId]
    );
    console.log(`[Credit] Fetched ${result.rows.length} available credits for student_id=${studentId}`);
    return result.rows.map((row: any) => ({
        id: row.id,
        transaction_id: row.transaction_id,
        amount: row.amount,
        payment_method: row.payment_method,
        notes: row.notes,
        processed_by_user_id: row.processed_by_user_id,
        created_at: row.created_at,
        archived_at: row.archived_at,
        original_asset_tag: row.original_asset_tag,
        original_fee_description: 'Device Insurance Fee'
    }));
};

// Get available previous insurance payments for a student (legacy function for backward compatibility)
export const getPreviousInsurancePayments = async (studentId: number): Promise<PreviousInsurancePayment[]> => {
    const credits = await getAvailableCredits(studentId);
    return credits.map(credit => ({
        transaction_id: credit.transaction_id,
        amount: credit.amount,
        payment_method: credit.payment_method,
        notes: credit.notes,
        processed_by_user_id: credit.processed_by_user_id,
        created_at: credit.created_at,
        original_fee_description: credit.original_fee_description
    }));
};

// Invalidate unused credits when new payments are made instead of using available credits
export const invalidateUnusedCredits = async (
    studentId: number,
    reason: string = 'New payment made instead of using available credit'
): Promise<number> => {
    console.log(`🚫 [Credit Invalidation] Invalidating credits for student ${studentId}: ${reason}`);

    const result = await query(
        `UPDATE archived_fee_payments
         SET is_invalidated = TRUE,
             invalidated_at = CURRENT_TIMESTAMP,
             invalidated_reason = $2
         WHERE student_id = $1 AND is_invalidated = FALSE
         RETURNING id, transaction_id, amount, original_asset_tag`,
        [studentId, reason]
    );

    const invalidatedCount = result.rows.length;
    console.log(`🚫 [Credit Invalidation] Invalidated ${invalidatedCount} credits for student ${studentId}`);

    if (invalidatedCount > 0) {
        result.rows.forEach((row: any) => {
            console.log(`  - Invalidated: Transaction ${row.transaction_id} ($${row.amount}) from device ${row.original_asset_tag || 'unknown'}`);
        });
    }

    return invalidatedCount;
};

// Transfer credit to a new fee (preserve original transaction ID)
export const transferCreditToFee = async (
    creditId: number,
    targetFeeId: number,
    processedByUserId: number
): Promise<FeePayment> => {
    console.log(`🔄 [Credit Transfer] Transferring credit ${creditId} to fee ${targetFeeId}`);

    // Start transaction
    await query('BEGIN');

    try {
        // Get the credit details
        const creditResult = await query(
            `SELECT * FROM archived_fee_payments
             WHERE id = $1 AND is_invalidated = FALSE`,
            [creditId]
        );

        if (creditResult.rows.length === 0) {
            throw new Error('Credit not found or already invalidated');
        }

        const credit = creditResult.rows[0];

        // Verify the target fee exists
        const feeResult = await query(
            'SELECT * FROM student_fees WHERE id = $1',
            [targetFeeId]
        );

        if (feeResult.rows.length === 0) {
            throw new Error('Target fee not found');
        }

        const fee = feeResult.rows[0];

        // Apply the credit to the target fee with original transaction ID
        const paymentResult = await query(
            `INSERT INTO fee_payments (
                student_fee_id, amount, payment_method, notes,
                processed_by_user_id, transaction_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *`,
            [
                targetFeeId,
                credit.amount,
                credit.payment_method,
                formatCreditNotes(credit.original_asset_tag, credit.notes),
                processedByUserId,
                credit.transaction_id // Preserve original transaction ID
            ]
        );

        const newPayment = paymentResult.rows[0];

        // Mark the credit as used (invalidated)
        await query(
            `UPDATE archived_fee_payments
             SET is_invalidated = TRUE,
                 invalidated_at = CURRENT_TIMESTAMP,
                 invalidated_reason = $2
             WHERE id = $1`,
            [creditId, `Credit applied to fee ID ${targetFeeId}`]
        );

        // Check if insurance fee is now fully paid and update chromebook status
        const isInsuranceFee = fee.description && fee.description.toLowerCase().includes('insurance');

        if (isInsuranceFee) {
            // Calculate total payments for this fee
            const paymentsResult = await query(
                'SELECT COALESCE(SUM(amount), 0) as total_paid FROM fee_payments WHERE student_fee_id = $1',
                [targetFeeId]
            );

            const totalPaid = parseFloat(paymentsResult.rows[0].total_paid);
            const feeAmount = parseFloat(fee.amount);

            // If fee is fully paid, update chromebook insurance status
            if (totalPaid >= feeAmount) {
                const updateResult = await query(
                    `UPDATE chromebooks
                     SET insurance_status = 'insured',
                         is_insured = true,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE current_user_id = $1
                       AND status IN ('checked_out','pending_signature')
                     RETURNING id, asset_tag`,
                    [fee.student_id]
                );

                if (updateResult.rows.length > 0) {
                    console.log(`✅ [Credit Transfer] Insurance fee fully paid, updated chromebook insurance status to 'insured'`);
                }
            }
        }

        // Commit transaction
        await query('COMMIT');

        console.log(`✅ [Credit Transfer] Successfully transferred credit ${creditId} (Transaction: ${credit.transaction_id}) to fee ${targetFeeId}`);
        return newPayment;

    } catch (error) {
        // Rollback transaction on error
        await query('ROLLBACK');
        console.error(`❌ [Credit Transfer] Failed:`, error);
        throw error;
    }
};

// Apply a previous payment to a current fee
export const applyPreviousPayment = async (
    feeId: number,
    previousPayment: PreviousInsurancePayment,
    processedByUserId: number
): Promise<FeePayment> => {
    console.log(`🔄 [Apply Previous Payment] Applying payment ${previousPayment.transaction_id} to fee ${feeId}`);
    // Start transaction
    await query('BEGIN');

    try {
        // Verify the fee exists
        const feeResult = await query(
            'SELECT * FROM student_fees WHERE id = $1',
            [feeId]
        );
        console.log(`[Apply Previous Payment] Fee lookup result for feeId=${feeId}:`, feeResult.rows);

        if (feeResult.rows.length === 0) {
            console.warn(`[Apply Previous Payment] No fee found for feeId=${feeId}`);
            throw new Error('Fee not found');
        }

        // Check if this transaction ID is already applied to this fee
        const existingPayment = await query(
            'SELECT id FROM fee_payments WHERE student_fee_id = $1 AND transaction_id = $2',
            [feeId, previousPayment.transaction_id]
        );
        console.log(`[Apply Previous Payment] Existing payment check for transaction_id=${previousPayment.transaction_id}:`, existingPayment.rows);

        if (existingPayment.rows.length > 0) {
            console.warn(`[Apply Previous Payment] Payment with transaction_id=${previousPayment.transaction_id} already applied to feeId=${feeId}`);
            throw new Error('This payment has already been applied to this fee');
        }

        // Apply the previous payment with original transaction ID
        const result = await query(
            `INSERT INTO fee_payments (
                student_fee_id, amount, payment_method, notes,
                processed_by_user_id, transaction_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                feeId,
                previousPayment.amount,
                previousPayment.payment_method,
                formatCreditNotes(previousPayment.original_asset_tag, previousPayment.notes),
                processedByUserId, // Current user applying the payment
                previousPayment.transaction_id, // Preserve original transaction ID
                new Date() // New timestamp for this application
            ]
        );
        console.log(`[Apply Previous Payment] Inserted payment result:`, result.rows);

        const newPayment = result.rows[0];

        // Check if insurance fee is now fully paid and update chromebook status
        const fee = feeResult.rows[0];
        const isInsuranceFee = fee.description && fee.description.toLowerCase().includes('insurance');

        if (isInsuranceFee) {
            // Calculate total payments for this fee
            const paymentsResult = await query(
                'SELECT COALESCE(SUM(amount), 0) as total_paid FROM fee_payments WHERE student_fee_id = $1',
                [feeId]
            );
            console.log(`[Apply Previous Payment] Total paid for feeId=${feeId}:`, paymentsResult.rows);

            const totalPaid = parseFloat(paymentsResult.rows[0].total_paid);
            const feeAmount = parseFloat(fee.amount);

            // If fee is fully paid, update chromebook insurance status
            if (totalPaid >= feeAmount) {
                const updateResult = await query(
                    `UPDATE chromebooks
                     SET insurance_status = 'insured',
                         is_insured = true,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE current_user_id = $1
                       AND status IN ('checked_out','pending_signature')
                     RETURNING id, asset_tag`,
                    [fee.student_id]
                );
                console.log(`[Apply Previous Payment] Insurance status update result:`, updateResult.rows);
                if (updateResult.rows.length > 0) {
                    console.log(`✅ Insurance fee fully paid, updated chromebook insurance status to 'insured'`);
                }
            }
        }

        // Commit transaction
        await query('COMMIT');

        console.log(`✅ [Apply Previous Payment] Successfully applied payment ${previousPayment.transaction_id}`);
        return newPayment;

    } catch (error) {
        // Rollback transaction on error
        await query('ROLLBACK');
        console.error(`❌ [Apply Previous Payment] Failed:`, error);
        throw error;
    }
};

// Archive insurance payments without creating new fees (for simple check-ins)
export const archiveInsurancePayments = async (
    studentId: number,
    currentAssetTag: string,
    reason: string = 'Device returned - payments archived as credits'
): Promise<{ archivedCount: number; archivedPayments: PreviousInsurancePayment[] }> => {
    console.log(`📦 [Archive Only] Archiving insurance payments for student ${studentId}, device ${currentAssetTag}`);

    // Start transaction
    await query('BEGIN');

    try {
        // Find existing insurance fee for this student
        const existingFeeResult = await query(
            `SELECT sf.id, sf.description,
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'id', fp.id,
                                    'transaction_id', fp.transaction_id,
                                    'amount', fp.amount,
                                    'payment_method', fp.payment_method,
                                    'notes', fp.notes,
                                    'processed_by_user_id', fp.processed_by_user_id,
                                    'created_at', fp.created_at
                                )
                            )
                            FROM fee_payments fp
                            WHERE fp.student_fee_id = sf.id
                        ),
                        '[]'::json
                    ) AS payments
             FROM student_fees sf
             WHERE sf.student_id = $1 AND sf.description = 'Device Insurance Fee'
             ORDER BY sf.created_at DESC LIMIT 1`,
            [studentId]
        );

        let archivedPayments: PreviousInsurancePayment[] = [];
        let archivedCount = 0;

        if (existingFeeResult.rows.length > 0) {
            const oldFee = existingFeeResult.rows[0];
            console.log(`📦 [Archive Only] Found existing insurance fee ${oldFee.id}, archiving payments only`);

            // Store previous payments for return value
            const payments = oldFee.payments || [];
            archivedPayments = payments.map((p: any) => ({
                ...p,
                original_fee_description: oldFee.description
            }));

            // Archive payments
            for (const p of payments) {
                // Check if already archived
                const archivedCheck = await query(
                    `SELECT id, is_invalidated FROM archived_fee_payments WHERE transaction_id = $1 AND student_id = $2`,
                    [p.transaction_id, studentId]
                );
                if (archivedCheck.rows.length === 0) {
                    await query(
                        `INSERT INTO archived_fee_payments
                            (student_id, original_fee_id, original_payment_id, amount, payment_method, notes, processed_by_user_id, created_at, transaction_id, archived_at, original_asset_tag)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
                        [
                            studentId,
                            oldFee.id,
                            p.id || null,
                            p.amount,
                            p.payment_method,
                            p.notes,
                            p.processed_by_user_id,
                            p.created_at,
                            p.transaction_id,
                            currentAssetTag
                        ]
                    );
                    archivedCount++;
                    console.log(`📦 [Archive Only] Archived payment transaction_id=${p.transaction_id} for device ${currentAssetTag}`);
                } else {
                    // Reactivate credit if it exists (for subsequent device swaps)
                    const creditId = archivedCheck.rows[0].id;
                    const wasInvalidated = !!archivedCheck.rows[0].is_invalidated;
                    await query(
                        `UPDATE archived_fee_payments
                         SET is_invalidated = FALSE,
                             invalidated_at = NULL,
                             invalidated_reason = NULL,
                             original_asset_tag = COALESCE($2, original_asset_tag),
                             archived_at = NOW()
                         WHERE id = $1`,
                        [creditId, currentAssetTag]
                    );
                    console.log(`📦 [Archive Only] Reactivated existing credit transaction_id=${p.transaction_id} (was_invalidated=${wasInvalidated})`);
                }
            }

            // Delete the old fee and payments (they're now archived)
            const deleteResult = await query(
                'DELETE FROM student_fees WHERE id = $1 RETURNING id',
                [oldFee.id]
            );

            if (deleteResult.rows.length > 0) {
                console.log(`✅ [Archive Only] Deleted old fee ${oldFee.id} and ${payments.length} associated payments`);
            }
        } else {
            console.log(`📦 [Archive Only] No existing insurance fee found for student ${studentId}`);
        }

        // Commit transaction
        await query('COMMIT');

        console.log(`✅ [Archive Only] Archived ${archivedCount} payments for student ${studentId}, device ${currentAssetTag}`);
        return { archivedCount, archivedPayments };

    } catch (error) {
        // Rollback transaction on error
        await query('ROLLBACK');
        console.error(`❌ [Archive Only] Failed for student ${studentId}:`, error);
        throw error;
    }
};

// Legacy function for backward compatibility (will be removed after migration)
export const replaceInsuranceFeeWithPaymentTransfer = async (
    studentId: number,
    amount: number,
    description: string = 'Device Insurance Fee',
    createdByUserId: number,
    idempotencyKey?: string,
    checkoutId?: number
): Promise<StudentFee> => {
    console.warn('⚠️ Using deprecated replaceInsuranceFeeWithPaymentTransfer - use replaceInsuranceFee instead');
    const result = await replaceInsuranceFee(studentId, amount, description, createdByUserId, idempotencyKey, checkoutId);
    return result.fee;
};
