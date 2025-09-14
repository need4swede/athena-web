import { query } from '../database';
import { PDFService } from './pdfService';
import { GoogleNotesService } from './googleNotesService';
import { CheckoutValidationService } from './checkoutValidationService';
import { TestFailureService } from '../utils/testFailures';
import { googleNotesConfig, feeAndCostConfig } from '../config';
import crypto from 'crypto';

export interface CheckoutSessionData {
    chromebook_id: number;
    student_id: string;
    user_id: number;
    notes?: string;
    signature?: string;
    parent_signature?: string;
    parent_present: boolean;
    insurance?: string;
    insurance_payment?: any;
    agreement_type?: string;
    force_reassign?: boolean;
}

export interface StepResult {
    success: boolean;
    data?: any;
    error?: string;
    alreadyCompleted?: boolean;
}

export interface SessionStatus {
    sessionId: string;
    overallStatus: string;
    currentStep: string;
    steps: Array<{
        name: string;
        status: string;
        error?: string;
        retryCount: number;
        canRetry: boolean;
    }>;
    checkoutId?: number;
    paymentTransactionId?: string;
}

export class GranularCheckoutService {

    // Define all checkout steps in order
    private static readonly CHECKOUT_STEPS = [
        'validate_student_info',
        'validate_device_availability',
        'validate_data_completeness',
        'create_or_validate_student',
        'update_device_status',
        'create_checkout_history',
        'process_insurance_fee',
        'process_insurance_payment',
        'create_device_history',
        'generate_pdf_agreement',
        'update_google_notes'
    ];

    /**
     * Start a new checkout session with granular step tracking
     */
    static async startCheckoutSession(sessionData: CheckoutSessionData): Promise<{ sessionId: string }> {
        const sessionId = this.generateSessionId(sessionData);

        console.log(`🚀 [Granular Checkout] Starting session: ${sessionId}`);

        // Create checkout session record
        await query(
            `INSERT INTO checkout_sessions (id, chromebook_id, student_id, user_id, checkout_data, overall_status, current_step)
             VALUES ($1, $2, $3, $4, $5, 'in_progress', 'validate_student_info')
             ON CONFLICT (id) DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP,
                overall_status = 'in_progress',
                current_step = 'validate_student_info'`,
            [sessionId, sessionData.chromebook_id, sessionData.student_id, sessionData.user_id, JSON.stringify(sessionData)]
        );

        // Initialize all steps as pending
        for (const stepName of this.CHECKOUT_STEPS) {
            const stepIdempotencyKey = this.generateStepIdempotencyKey(sessionId, stepName, sessionData);

            await query(
                `INSERT INTO checkout_step_tracking (checkout_session_id, step_name, step_idempotency_key, status, step_data)
                 VALUES ($1, $2, $3, 'pending', $4)
                 ON CONFLICT (step_idempotency_key) DO NOTHING`,
                [sessionId, stepName, stepIdempotencyKey, JSON.stringify(sessionData)]
            );
        }

        return { sessionId };
    }

    /**
     * Execute next step in the checkout process
     */
    static async executeNextStep(sessionId: string): Promise<StepResult> {
        console.log(`🔄 [Granular Checkout] Executing next step for session: ${sessionId}`);

        // Get session data
        const sessionResult = await query(
            'SELECT * FROM checkout_sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return { success: false, error: 'Checkout session not found' };
        }

        const session = sessionResult.rows[0];
        const sessionData = typeof session.checkout_data === 'string'
            ? JSON.parse(session.checkout_data)
            : session.checkout_data;

        // Find next pending step
        const nextStep = await this.getNextPendingStep(sessionId);
        if (!nextStep) {
            // All steps completed
            await this.completeSession(sessionId);
            return { success: true, data: { completed: true } };
        }

        // Execute the step
        const result = await this.executeStep(sessionId, nextStep, sessionData);

        // Update session current step
        if (result.success) {
            await query(
                `UPDATE checkout_sessions SET current_step = $1 WHERE id = $2`,
                [nextStep, sessionId]
            );
        }

        return result;
    }

    /**
     * Retry a specific failed step
     */
    static async retryStep(sessionId: string, stepName: string): Promise<StepResult> {
        console.log(`🔄 [Granular Checkout] Retrying step ${stepName} for session: ${sessionId}`);

        // Get session data
        const sessionResult = await query(
            'SELECT checkout_data FROM checkout_sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return { success: false, error: 'Checkout session not found' };
        }

        const sessionData = typeof sessionResult.rows[0].checkout_data === 'string'
            ? JSON.parse(sessionResult.rows[0].checkout_data)
            : sessionResult.rows[0].checkout_data;

        // Reset step to pending
        await query(
            `UPDATE checkout_step_tracking
             SET status = 'pending', error_message = NULL, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
             WHERE checkout_session_id = $1 AND step_name = $2`,
            [sessionId, stepName]
        );

        // Execute the step
        return await this.executeStep(sessionId, stepName, sessionData);
    }

    /**
     * Get current session status with all step details
     */
    static async getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
        // Get session info
        const sessionResult = await query(
            'SELECT * FROM checkout_sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return null;
        }

        const session = sessionResult.rows[0];

        // Get all step statuses
        const stepsResult = await query(
            `SELECT step_name, status, error_message, retry_count, completed_at
             FROM checkout_step_tracking
             WHERE checkout_session_id = $1
             ORDER BY created_at ASC`,
            [sessionId]
        );

        const steps = stepsResult.rows.map(row => ({
            name: row.step_name,
            status: row.status,
            error: row.error_message,
            retryCount: row.retry_count,
            canRetry: row.status === 'failed'
        }));

        // Get checkout ID if available
        let checkoutId = null;
        const checkoutResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'create_checkout_history' AND status = 'completed'`,
            [sessionId]
        );

        if (checkoutResult.rows.length > 0) {
            const resultData = typeof checkoutResult.rows[0].result_data === 'string'
                ? JSON.parse(checkoutResult.rows[0].result_data)
                : checkoutResult.rows[0].result_data;
            checkoutId = resultData.checkoutId;
        }

        // Get payment transaction ID if available
        let paymentTransactionId = null;
        const paymentResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'process_insurance_payment' AND status = 'completed'`,
            [sessionId]
        );

        if (paymentResult.rows.length > 0) {
            const resultData = typeof paymentResult.rows[0].result_data === 'string'
                ? JSON.parse(paymentResult.rows[0].result_data)
                : paymentResult.rows[0].result_data;
            paymentTransactionId = resultData.transactionId || null;
        }

        return {
            sessionId,
            overallStatus: session.overall_status,
            currentStep: session.current_step,
            steps,
            checkoutId,
            paymentTransactionId
        };
    }

    /**
     * Execute a specific step with idempotency and snapshot-based rollback on failure
     */
    private static async executeStep(sessionId: string, stepName: string, sessionData: CheckoutSessionData): Promise<StepResult> {
        const stepIdempotencyKey = this.generateStepIdempotencyKey(sessionId, stepName, sessionData);

        // Check if step was already completed
        const existingResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE step_idempotency_key = $1 AND status = 'completed'`,
            [stepIdempotencyKey]
        );

        if (existingResult.rows.length > 0) {
            console.log(`✅ [Granular Checkout] Step ${stepName} already completed`);
            return {
                success: true,
                data: JSON.parse(existingResult.rows[0].result_data),
                alreadyCompleted: true
            };
        }

        // Create snapshot before executing step (only for steps that modify data)
        const snapshotNeeded = this.stepRequiresSnapshot(stepName);
        if (snapshotNeeded) {
            await this.createSnapshot(sessionId, stepName, sessionData);
        }

        // Mark step as processing
        await query(
            `UPDATE checkout_step_tracking
             SET status = 'processing', updated_at = CURRENT_TIMESTAMP
             WHERE checkout_session_id = $1 AND step_name = $2`,
            [sessionId, stepName]
        );

        try {
            let result: any;

            switch (stepName) {
                case 'validate_student_info':
                    result = await this.validateStudentInfo(sessionData);
                    break;
                case 'validate_device_availability':
                    result = await this.validateDeviceAvailability(sessionData);
                    break;
                case 'validate_data_completeness':
                    result = await this.validateDataCompleteness(sessionData);
                    break;
                case 'create_or_validate_student':
                    result = await this.createOrValidateStudent(sessionData);
                    break;
                case 'update_device_status':
                    result = await this.updateDeviceStatus(sessionId, sessionData);
                    break;
                case 'create_checkout_history':
                    result = await this.createCheckoutHistory(sessionId, sessionData);
                    break;
                case 'process_insurance_fee':
                    result = await this.processInsuranceFee(sessionId, sessionData);
                    break;
                case 'process_insurance_payment':
                    result = await this.processInsurancePayment(sessionId, sessionData);
                    break;
                case 'create_device_history':
                    result = await this.createDeviceHistory(sessionId, sessionData);
                    break;
                case 'generate_pdf_agreement':
                    result = await this.generatePdfAgreement(sessionId, sessionData);
                    break;
                case 'update_google_notes':
                    result = await this.updateGoogleNotes(sessionId, sessionData);
                    break;
                default:
                    throw new Error(`Unknown step: ${stepName}`);
            }

            if (!result.success) {
                throw new Error(result.message || 'Step execution failed');
            }

            // Mark step as completed
            await query(
                `UPDATE checkout_step_tracking
                 SET status = 'completed', result_data = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE checkout_session_id = $2 AND step_name = $3`,
                [JSON.stringify(result.data || {}), sessionId, stepName]
            );

            console.log(`✅ [Granular Checkout] Step ${stepName} completed successfully`);
            return { success: true, data: result.data };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ [Granular Checkout] Step ${stepName} failed:`, errorMessage);

            // Mark step as failed
            await query(
                `UPDATE checkout_step_tracking
                 SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE checkout_session_id = $2 AND step_name = $3`,
                [errorMessage, sessionId, stepName]
            );

            // CRITICAL: Perform snapshot-based rollback for critical step failures
            await this.performSnapshotRollbackIfNeeded(sessionId, stepName, sessionData);

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Determine if a step requires a snapshot before execution
     */
    private static stepRequiresSnapshot(stepName: string): boolean {
        const stepsRequiringSnapshot = [
            'create_or_validate_student',  // Creates new student records
            'update_device_status',        // Modifies device status
            'create_checkout_history',     // Creates checkout records
            'process_insurance_fee',       // Creates fee records
            'process_insurance_payment',   // Creates payment records
            'create_device_history'        // Creates history records
        ];

        return stepsRequiringSnapshot.includes(stepName);
    }

    /**
     * Create snapshot of current database state before executing a step
     */
    private static async createSnapshot(sessionId: string, stepName: string, sessionData: CheckoutSessionData): Promise<void> {
        console.log(`📸 [Snapshot] Creating snapshot for step: ${stepName} in session: ${sessionId}`);

        const snapshotKey = `${sessionId}_${stepName}_snapshot`;
        const snapshotData: any = {
            sessionId,
            stepName,
            timestamp: new Date().toISOString(),
            snapshots: {}
        };

        try {
            // Helper function to safely convert database rows to plain objects
            const toPlainObject = (dbRow: any) => {
                if (!dbRow) return null;
                return JSON.parse(JSON.stringify(dbRow));
            };

            const toPlainObjectArray = (dbRows: any[]) => {
                return dbRows.map(row => JSON.parse(JSON.stringify(row)));
            };

            // Snapshot chromebook state (always needed)
            const chromebookSnapshot = await query(
                `SELECT id, status, current_user_id, checked_out_date, is_insured, insurance_status,
                        status_source, status_override_date, updated_at
                 FROM chromebooks WHERE id = $1`,
                [sessionData.chromebook_id]
            );

            if (chromebookSnapshot.rows.length > 0) {
                snapshotData.snapshots.chromebook = toPlainObject(chromebookSnapshot.rows[0]);
                console.log(`📸 [Snapshot] Captured chromebook state for device ${sessionData.chromebook_id}`);
            }

            // Snapshot student state (if creating/validating student)
            if (stepName === 'create_or_validate_student') {
                const studentSnapshot = await query(
                    'SELECT * FROM students WHERE student_id = $1',
                    [sessionData.student_id]
                );
                snapshotData.snapshots.student = studentSnapshot.rows[0] ? toPlainObject(studentSnapshot.rows[0]) : null;
                console.log(`📸 [Snapshot] Captured student state for ${sessionData.student_id}`);
            }

            // Snapshot checkout history state (if creating checkout history)
            if (stepName === 'create_checkout_history') {
                const historySnapshot = await query(
                    `SELECT * FROM checkout_history
                     WHERE chromebook_id = $1 AND student_id IN (SELECT id FROM students WHERE student_id = $2)
                     ORDER BY action_date DESC LIMIT 5`,
                    [sessionData.chromebook_id, sessionData.student_id]
                );
                snapshotData.snapshots.checkout_history = toPlainObjectArray(historySnapshot.rows);
                console.log(`📸 [Snapshot] Captured checkout history for device ${sessionData.chromebook_id}`);
            }

            // Snapshot fees state (if processing insurance fee)
            if (stepName === 'process_insurance_fee') {
                const feesSnapshot = await query(
                    `SELECT * FROM student_fees
                     WHERE student_id IN (SELECT id FROM students WHERE student_id = $1)
                     ORDER BY created_at DESC`,
                    [sessionData.student_id]
                );
                snapshotData.snapshots.student_fees = toPlainObjectArray(feesSnapshot.rows);
                console.log(`📸 [Snapshot] Captured student fees for ${sessionData.student_id}`);
            }

            // Snapshot payments state (if processing insurance payment)
            if (stepName === 'process_insurance_payment') {
                const paymentsSnapshot = await query(
                    `SELECT fp.* FROM fee_payments fp
                     JOIN student_fees sf ON fp.student_fee_id = sf.id
                     WHERE sf.student_id IN (SELECT id FROM students WHERE student_id = $1)
                     ORDER BY fp.created_at DESC`,
                    [sessionData.student_id]
                );
                snapshotData.snapshots.fee_payments = toPlainObjectArray(paymentsSnapshot.rows);
                console.log(`📸 [Snapshot] Captured fee payments for ${sessionData.student_id}`);
            }

            // Snapshot device history state (if creating device history)
            if (stepName === 'create_device_history') {
                const deviceHistorySnapshot = await query(
                    `SELECT * FROM device_history
                     WHERE chromebook_id = $1
                     ORDER BY event_date DESC LIMIT 10`,
                    [sessionData.chromebook_id]
                );
                snapshotData.snapshots.device_history = toPlainObjectArray(deviceHistorySnapshot.rows);
                console.log(`📸 [Snapshot] Captured device history for device ${sessionData.chromebook_id}`);
            }

            // Validate that we can serialize and parse the data
            const serializedData = JSON.stringify(snapshotData);
            const testParse = JSON.parse(serializedData);

            console.log(`📸 [Snapshot] Data validation successful - serialized ${serializedData.length} characters`);

            // Store snapshot in database
            await query(
                `INSERT INTO operation_idempotency (idempotency_key, operation_type, operation_result, status)
                 VALUES ($1, 'snapshot', $2, 'completed')
                 ON CONFLICT (idempotency_key) DO UPDATE SET
                    operation_result = $2,
                    status = 'completed',
                    created_at = CURRENT_TIMESTAMP`,
                [snapshotKey, serializedData]
            );

            console.log(`✅ [Snapshot] Snapshot created successfully for ${stepName}`);

        } catch (error) {
            console.error(`❌ [Snapshot] Failed to create snapshot for ${stepName}:`, error);
            console.error(`❌ [Snapshot] Snapshot data structure:`, JSON.stringify(snapshotData, null, 2));
            // Don't fail the step if snapshot creation fails - just log it
        }
    }

    /**
     * Perform snapshot-based rollback when critical steps fail
     */
    private static async performSnapshotRollbackIfNeeded(sessionId: string, failedStep: string, sessionData: CheckoutSessionData): Promise<void> {
        console.log(`🔄 [Granular Checkout] Evaluating snapshot rollback for failed step: ${failedStep}`);

        // Define critical steps that require rollback
        const criticalSteps = [
            'create_checkout_history',
            'process_insurance_fee',
            'process_insurance_payment',
            'create_device_history'
        ];

        if (!criticalSteps.includes(failedStep)) {
            console.log(`ℹ️ [Granular Checkout] Step ${failedStep} is not critical, no rollback needed`);
            return;
        }

        console.log(`🚨 [Granular Checkout] Critical step ${failedStep} failed, initiating snapshot-based rollback...`);

        try {
            // Get all completed steps that need rollback
            const completedSteps = await query(
                `SELECT step_name FROM checkout_step_tracking
                 WHERE checkout_session_id = $1 AND status = 'completed'
                 ORDER BY created_at DESC`,
                [sessionId]
            );

            // Rollback completed steps in reverse order
            for (const step of completedSteps.rows) {
                const stepName = step.step_name;
                if (this.stepRequiresSnapshot(stepName)) {
                    await this.restoreSnapshot(sessionId, stepName, sessionData);
                }
            }

            // Mark session as rollback completed
            await query(
                `UPDATE checkout_sessions
                 SET overall_status = 'rollback_completed', completed_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [sessionId]
            );

            console.log(`✅ [Granular Checkout] Snapshot-based rollback completed for session: ${sessionId}`);

        } catch (rollbackError) {
            console.error(`❌ [Granular Checkout] Snapshot rollback failed for session ${sessionId}:`, rollbackError);

            // Mark session as rollback failed
            await query(
                `UPDATE checkout_sessions
                 SET overall_status = 'rollback_failed', completed_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [sessionId]
            );

            // This is critical - we need to alert administrators
            console.error(`🚨 [CRITICAL] Manual intervention required for session ${sessionId} - snapshot rollback failed!`);
        }
    }

    /**
     * Restore database state from snapshot
     */
    private static async restoreSnapshot(sessionId: string, stepName: string, sessionData: CheckoutSessionData): Promise<void> {
        const snapshotKey = `${sessionId}_${stepName}_snapshot`;

        console.log(`🔄 [Rollback] Restoring snapshot for step: ${stepName}`);

        try {
            // Get snapshot data
            const snapshotResult = await query(
                `SELECT operation_result FROM operation_idempotency
                 WHERE idempotency_key = $1 AND operation_type = 'snapshot'`,
                [snapshotKey]
            );

            if (snapshotResult.rows.length === 0) {
                console.warn(`⚠️ [Rollback] No snapshot found for step ${stepName}, skipping restore`);
                return;
            }

            // PostgreSQL JSONB columns return parsed objects, not JSON strings
            const rawResult = snapshotResult.rows[0].operation_result;
            console.log(`🔄 [Rollback] Raw snapshot data type: ${typeof rawResult}`);

            let snapshotData;
            if (typeof rawResult === 'string') {
                // If it's a string, parse it
                snapshotData = JSON.parse(rawResult);
                console.log(`🔄 [Rollback] Parsed snapshot data from JSON string`);
            } else {
                // If it's already an object (JSONB column), use it directly
                snapshotData = rawResult;
                console.log(`🔄 [Rollback] Using snapshot data as object directly`);
            }

            const snapshots = snapshotData.snapshots;

            // Restore chromebook state
            if (snapshots.chromebook) {
                const chromebook = snapshots.chromebook;
                await query(
                    `UPDATE chromebooks
                     SET status = $1, current_user_id = $2, checked_out_date = $3,
                         is_insured = $4, insurance_status = $5, status_source = $6,
                         status_override_date = $7, updated_at = $8
                     WHERE id = $9`,
                    [
                        chromebook.status, chromebook.current_user_id, chromebook.checked_out_date,
                        chromebook.is_insured, chromebook.insurance_status, chromebook.status_source,
                        chromebook.status_override_date, chromebook.updated_at, chromebook.id
                    ]
                );
                console.log(`✅ [Rollback] Restored chromebook state for device ${chromebook.id}`);
            }

            // Handle student record restoration
            if (stepName === 'create_or_validate_student' && snapshots.student === null) {
                // Student was newly created, remove it
                await query(
                    'DELETE FROM students WHERE student_id = $1',
                    [sessionData.student_id]
                );
                console.log(`✅ [Rollback] Removed newly created student ${sessionData.student_id}`);
            }

            // Handle checkout history restoration
            if (stepName === 'create_checkout_history') {
                // Remove any checkout history records created in this session
                await query(
                    `DELETE FROM checkout_history
                     WHERE idempotency_key LIKE $1`,
                    [`${sessionId}_%`]
                );
                console.log(`✅ [Rollback] Removed checkout history created in session ${sessionId}`);
            }

            // Handle insurance fee restoration
            if (stepName === 'process_insurance_fee') {
                // Remove fees created in this session
                await query(
                    `DELETE FROM student_fees
                     WHERE idempotency_key LIKE $1`,
                    [`${sessionId}_%`]
                );
                console.log(`✅ [Rollback] Removed insurance fees created in session ${sessionId}`);
            }

            // Handle insurance payment restoration
            if (stepName === 'process_insurance_payment') {
                // Remove payments created in this session
                await query(
                    `DELETE FROM fee_payments
                     WHERE idempotency_key LIKE $1`,
                    [`${sessionId}_%`]
                );
                console.log(`✅ [Rollback] Removed fee payments created in session ${sessionId}`);
            }

            // Handle device history restoration
            if (stepName === 'create_device_history') {
                // Remove device history created in this session
                await query(
                    `DELETE FROM device_history
                     WHERE details->>'session_id' = $1`,
                    [sessionId]
                );
                console.log(`✅ [Rollback] Removed device history created in session ${sessionId}`);
            }

            // Mark the step as rolled back
            await query(
                `UPDATE checkout_step_tracking
                 SET status = 'rolled_back', error_message = 'Restored from snapshot due to subsequent step failure'
                 WHERE checkout_session_id = $1 AND step_name = $2`,
                [sessionId, stepName]
            );

            console.log(`✅ [Rollback] Successfully restored snapshot for step: ${stepName}`);

        } catch (error) {
            console.error(`❌ [Rollback] Failed to restore snapshot for step ${stepName}:`, error);
            throw error;
        }
    }

    /**
     * Legacy rollback operations (kept for backward compatibility)
     */
    private static async performRollbackIfNeeded(sessionId: string, failedStep: string, sessionData: CheckoutSessionData): Promise<void> {
        // Redirect to snapshot-based rollback
        return this.performSnapshotRollbackIfNeeded(sessionId, failedStep, sessionData);
    }

    /**
     * Rollback device status changes
     */
    private static async rollbackDeviceStatus(sessionId: string, sessionData: CheckoutSessionData): Promise<void> {
        // Check if device status was updated in this session
        const deviceUpdateResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'update_device_status' AND status = 'completed'`,
            [sessionId]
        );

        if (deviceUpdateResult.rows.length === 0) {
            console.log(`ℹ️ [Rollback] No device status changes to rollback for session: ${sessionId}`);
            return;
        }

        console.log(`🔄 [Rollback] Rolling back device status for session: ${sessionId}`);

        // Restore device to available status
        const rollbackResult = await query(
            `UPDATE chromebooks
             SET status = 'available',
                 current_user_id = NULL,
                 checked_out_date = NULL,
                 is_insured = false,
                 insurance_status = 'uninsured',
                 status_source = 'local',
                 status_override_date = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, status, current_user_id`,
            [sessionData.chromebook_id]
        );

        if (rollbackResult.rows.length > 0) {
            console.log(`✅ [Rollback] Device ${sessionData.chromebook_id} status rolled back to available`);

            // Mark the device update step as rolled back
            await query(
                `UPDATE checkout_step_tracking
                 SET status = 'rolled_back', error_message = 'Rolled back due to subsequent step failure'
                 WHERE checkout_session_id = $1 AND step_name = 'update_device_status'`,
                [sessionId]
            );
        } else {
            throw new Error(`Failed to rollback device status for device ${sessionData.chromebook_id}`);
        }
    }

    /**
     * Rollback insurance fee creation
     */
    private static async rollbackInsuranceFee(sessionId: string, sessionData: CheckoutSessionData): Promise<void> {
        // Check if insurance fee was created in this session
        const feeResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'process_insurance_fee' AND status = 'completed'`,
            [sessionId]
        );

        if (feeResult.rows.length === 0) {
            console.log(`ℹ️ [Rollback] No insurance fee to rollback for session: ${sessionId}`);
            return;
        }

        const feeData = typeof feeResult.rows[0].result_data === 'string'
            ? JSON.parse(feeResult.rows[0].result_data)
            : feeResult.rows[0].result_data;

        if (feeData.skipped || !feeData.feeId) {
            console.log(`ℹ️ [Rollback] Insurance fee was skipped or no feeId, nothing to rollback for session: ${sessionId}`);
            return;
        }

        console.log(`🔄 [Rollback] Rolling back insurance fee for session: ${sessionId}`);

        // Delete the insurance fee record
        const deleteResult = await query(
            `DELETE FROM student_fees
             WHERE id = $1 AND idempotency_key LIKE $2
             RETURNING id`,
            [feeData.feeId, `${sessionId}_insurance_fee`]
        );

        if (deleteResult.rows.length > 0) {
            console.log(`✅ [Rollback] Insurance fee ${feeData.feeId} deleted`);

            // Mark the fee step as rolled back
            await query(
                `UPDATE checkout_step_tracking
                 SET status = 'rolled_back', error_message = 'Rolled back due to subsequent step failure'
                 WHERE checkout_session_id = $1 AND step_name = 'process_insurance_fee'`,
                [sessionId]
            );
        } else {
            console.warn(`⚠️ [Rollback] Insurance fee ${feeData.feeId} was already deleted or not found`);
        }
    }

    /**
     * Rollback insurance payment processing
     */
    private static async rollbackInsurancePayment(sessionId: string, sessionData: CheckoutSessionData): Promise<void> {
        // Check if insurance payment was processed in this session
        const paymentResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'process_insurance_payment' AND status = 'completed'`,
            [sessionId]
        );

        if (paymentResult.rows.length === 0) {
            console.log(`ℹ️ [Rollback] No insurance payment to rollback for session: ${sessionId}`);
            return;
        }

        const paymentData = typeof paymentResult.rows[0].result_data === 'string'
            ? JSON.parse(paymentResult.rows[0].result_data)
            : paymentResult.rows[0].result_data;

        if (paymentData.skipped || !paymentData.paymentId) {
            console.log(`ℹ️ [Rollback] Insurance payment was skipped or no paymentId, nothing to rollback for session: ${sessionId}`);
            return;
        }

        console.log(`🔄 [Rollback] Rolling back insurance payment for session: ${sessionId}`);

        // Delete the payment record
        const deleteResult = await query(
            `DELETE FROM fee_payments
             WHERE id = $1 AND idempotency_key LIKE $2
             RETURNING id`,
            [paymentData.paymentId, `${sessionId}_insurance_payment`]
        );

        if (deleteResult.rows.length > 0) {
            console.log(`✅ [Rollback] Insurance payment ${paymentData.paymentId} deleted`);

            // Mark the payment step as rolled back
            await query(
                `UPDATE checkout_step_tracking
                 SET status = 'rolled_back', error_message = 'Rolled back due to subsequent step failure'
                 WHERE checkout_session_id = $1 AND step_name = 'process_insurance_payment'`,
                [sessionId]
            );
        } else {
            console.warn(`⚠️ [Rollback] Insurance payment ${paymentData.paymentId} was already deleted or not found`);
        }
    }

    /**
     * Individual step implementations with idempotency
     */

    private static async validateStudentInfo(sessionData: CheckoutSessionData): Promise<any> {
        const result = await CheckoutValidationService.runPreFlightChecks({
            chromebook_id: sessionData.chromebook_id,
            student_id: sessionData.student_id,
            parent_present: sessionData.parent_present,
            signature: sessionData.signature,
            parent_signature: sessionData.parent_signature,
            insurance: sessionData.insurance,
            insurance_payment: sessionData.insurance_payment
        });

        if (!result.studentData.success) {
            return { success: false, message: result.studentData.message };
        }

        return { success: true, data: result.studentData };
    }

    private static async validateDeviceAvailability(sessionData: CheckoutSessionData): Promise<any> {
        const result = await CheckoutValidationService.runPreFlightChecks({
            chromebook_id: sessionData.chromebook_id,
            student_id: sessionData.student_id,
            parent_present: sessionData.parent_present,
            signature: sessionData.signature,
            parent_signature: sessionData.parent_signature,
            insurance: sessionData.insurance,
            insurance_payment: sessionData.insurance_payment
        });

        if (!result.deviceAvailability.success) {
            return { success: false, message: result.deviceAvailability.message };
        }

        return { success: true, data: result.deviceAvailability };
    }

    private static async validateDataCompleteness(sessionData: CheckoutSessionData): Promise<any> {
        const result = await CheckoutValidationService.runPreFlightChecks({
            chromebook_id: sessionData.chromebook_id,
            student_id: sessionData.student_id,
            parent_present: sessionData.parent_present,
            signature: sessionData.signature,
            parent_signature: sessionData.parent_signature,
            insurance: sessionData.insurance,
            insurance_payment: sessionData.insurance_payment
        });

        if (!result.dataCompleteness.success) {
            return { success: false, message: result.dataCompleteness.message };
        }

        return { success: true, data: result.dataCompleteness };
    }

    private static async createOrValidateStudent(sessionData: CheckoutSessionData): Promise<any> {
        // Check if student already exists
        let studentResult = await query('SELECT * FROM students WHERE student_id = $1', [sessionData.student_id]);
        let student;

        if (studentResult.rows.length === 0) {
            // Try to find in Google Users
            const googleUserResult = await query(
                'SELECT * FROM google_users WHERE primary_email LIKE $1 OR google_id = $2',
                [`%${sessionData.student_id}%`, sessionData.student_id]
            );

            let firstName = 'Unknown';
            let lastName = 'Student';
            let email = null;

            if (googleUserResult.rows.length > 0) {
                const googleUser = googleUserResult.rows[0];
                firstName = googleUser.first_name || 'Unknown';
                lastName = googleUser.last_name || 'Student';
                email = googleUser.primary_email;
            }

            const insertStudentResult = await query(
                'INSERT INTO students (student_id, first_name, last_name, email) VALUES ($1, $2, $3, $4) RETURNING *',
                [sessionData.student_id, firstName, lastName, email]
            );
            student = insertStudentResult.rows[0];
        } else {
            student = studentResult.rows[0];
        }

        return { success: true, data: { student } };
    }

    private static async updateDeviceStatus(sessionId: string, sessionData: CheckoutSessionData): Promise<any> {
        // Check for test failure injection
        if (TestFailureService.shouldFailUpdatingStatus()) {
            const message = TestFailureService.getUpdatingStatusError();
            TestFailureService.logTestFailure('Updating Device Status', message);
            throw new Error(message);
        }

        // Get student from previous step
        const studentResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'create_or_validate_student' AND status = 'completed'`,
            [sessionId]
        );

        if (studentResult.rows.length === 0) {
            throw new Error('Student creation step not completed');
        }

        const studentResultData = typeof studentResult.rows[0].result_data === 'string'
            ? JSON.parse(studentResult.rows[0].result_data)
            : studentResult.rows[0].result_data;
        const { student } = studentResultData;

        // Determine insurance status and device status
        let insurance_status = 'uninsured';  // Default for all initial checkouts
        let newStatus = 'pending_signature';  // Default for all initial checkouts

        // Only for parent-present checkouts, we can determine final insurance status
        if (sessionData.parent_present) {
            newStatus = 'checked_out';

            if (sessionData.insurance === 'pending' || sessionData.insurance === 'insured') {
                insurance_status = 'pending';  // Set to pending so fee can be created and payment processed
            } else {
                insurance_status = 'uninsured';  // Parent explicitly declined insurance
            }
        }
        // For parent NOT present checkouts, device remains pending_signature with uninsured status
        // The insurance decision will be made later when parent visits /mydevice

        console.log(`📝 [Device Status Update] parent_present: ${sessionData.parent_present}, insurance: ${sessionData.insurance}, new_status: ${newStatus}, insurance_status: ${insurance_status}`);

        // Update device with idempotency (only if not already in expected state)
        const updateResult = await query(
            `UPDATE chromebooks
             SET status = $1,
                 current_user_id = $2,
                 checked_out_date = CURRENT_TIMESTAMP,
                 is_insured = $3,
                 insurance_status = $4,
                 status_source = 'local',
                 status_override_date = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
               AND (status != $1 OR current_user_id != $2 OR insurance_status != $4)
             RETURNING id, status, current_user_id, insurance_status`,
            [newStatus, student.id, insurance_status === 'insured', insurance_status, sessionData.chromebook_id]
        );

        if (updateResult.rows.length === 0) {
            // Check if device is already in correct state
            const checkResult = await query(
                'SELECT status, current_user_id, insurance_status FROM chromebooks WHERE id = $1',
                [sessionData.chromebook_id]
            );

            if (checkResult.rows.length > 0) {
                const device = checkResult.rows[0];
                if (device.status === newStatus && device.current_user_id === student.id) {
                    // Already in correct state, consider this successful
                    return { success: true, data: { device, alreadyUpdated: true } };
                }
            }

            throw new Error('Failed to update device status');
        }

        return { success: true, data: { device: updateResult.rows[0], student, insurance_status, newStatus } };
    }

    private static async createCheckoutHistory(sessionId: string, sessionData: CheckoutSessionData): Promise<any> {
        // Check for test failure injection
        if (TestFailureService.shouldFailProcessingCheckout()) {
            const message = TestFailureService.getProcessingCheckoutError();
            TestFailureService.logTestFailure('Processing Checkout', message);
            throw new Error(message);
        }

        // Get student and device data from previous steps
        const studentResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'create_or_validate_student' AND status = 'completed'`,
            [sessionId]
        );

        const deviceResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'update_device_status' AND status = 'completed'`,
            [sessionId]
        );

        if (studentResult.rows.length === 0 || deviceResult.rows.length === 0) {
            throw new Error('Required previous steps not completed');
        }

        const studentResultData = typeof studentResult.rows[0].result_data === 'string'
            ? JSON.parse(studentResult.rows[0].result_data)
            : studentResult.rows[0].result_data;
        const { student } = studentResultData;

        const deviceResultData = typeof deviceResult.rows[0].result_data === 'string'
            ? JSON.parse(deviceResult.rows[0].result_data)
            : deviceResult.rows[0].result_data;
        const { insurance_status } = deviceResultData;

        // Create idempotency key for checkout history
        const historyIdempotencyKey = `${sessionId}_checkout_history`;

        // Check if checkout history already exists
        const existingHistory = await query(
            'SELECT id FROM checkout_history WHERE idempotency_key = $1',
            [historyIdempotencyKey]
        );

        if (existingHistory.rows.length > 0) {
            return { success: true, data: { checkoutId: existingHistory.rows[0].id, alreadyCreated: true } };
        }

        // Create checkout history record
        const checkoutNotes = sessionData.notes || `Checked out with ${sessionData.agreement_type || 'standard'} agreement`;

        const historyResult = await query(
            `INSERT INTO checkout_history (
                chromebook_id, student_id, user_id, action, notes, signature, parent_signature,
                status, insurance, idempotency_key, checkout_state
            ) VALUES ($1, $2, $3, 'checkout', $4, $5, $6, $7, $8, $9, 'core_transaction_completed')
            RETURNING id`,
            [
                sessionData.chromebook_id, student.id, sessionData.user_id, checkoutNotes,
                sessionData.signature, sessionData.parent_signature,
                sessionData.parent_present ? 'completed' : 'pending',
                insurance_status, historyIdempotencyKey
            ]
        );

        const checkoutId = historyResult.rows[0].id;

        return { success: true, data: { checkoutId, student, insurance_status } };
    }

    private static async processInsuranceFee(sessionId: string, sessionData: CheckoutSessionData): Promise<any> {
        // Skip insurance fee processing for "parent not present" checkouts
        // The fee will be created later when parent visits /mydevice and accepts insurance
        if (!sessionData.parent_present) {
            console.log(`ℹ️ [Insurance Fee] Skipping fee creation for parent not present checkout`);
            return { success: true, data: { skipped: true, reason: 'Parent not present - fee will be created when parent accepts insurance' } };
        }

        // Get previous step data
        const historyResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'create_checkout_history' AND status = 'completed'`,
            [sessionId]
        );

        if (historyResult.rows.length === 0) {
            throw new Error('Checkout history step not completed');
        }

        const historyResultData = typeof historyResult.rows[0].result_data === 'string'
            ? JSON.parse(historyResult.rows[0].result_data)
            : historyResult.rows[0].result_data;
        const { checkoutId, student, insurance_status } = historyResultData;

        // Only process fee if insurance is pending or insured (parent present and wants insurance)
        if (insurance_status !== 'pending' && insurance_status !== 'insured') {
            console.log(`ℹ️ [Insurance Fee] Skipping fee creation - insurance status: ${insurance_status}`);
            return { success: true, data: { skipped: true, reason: 'No insurance selected' } };
        }

        const feeIdempotencyKey = `${sessionId}_insurance_fee`;

        // Check if fee already exists
        const existingFee = await query(
            'SELECT id FROM student_fees WHERE idempotency_key = $1',
            [feeIdempotencyKey]
        );

        if (existingFee.rows.length > 0) {
            return { success: true, data: { feeId: existingFee.rows[0].id, alreadyCreated: true } };
        }

        console.log(`💰 [Insurance Fee] Creating fee for parent-present checkout with insurance`);

        // Import the replacement function
        const { replaceInsuranceFee } = await import('./feeService');

        // Use the new replacement function to handle existing fees
        const feeResult = await replaceInsuranceFee(
            student.id,
            40, // Using hardcoded fee for now
            'Device Insurance Fee',
            sessionData.user_id,
            feeIdempotencyKey,
            checkoutId
        );

        const feeId = feeResult.fee.id;

        return { success: true, data: { feeId, amount: feeAndCostConfig.ltcFee } };
    }

    private static async processInsurancePayment(sessionId: string, sessionData: CheckoutSessionData): Promise<any> {
        // Skip insurance payment processing for "parent not present" checkouts
        // Payment will be processed later when parent visits /mydevice and pays the fee
        if (!sessionData.parent_present) {
            console.log(`ℹ️ [Insurance Payment] Skipping payment processing for parent not present checkout`);
            return { success: true, data: { skipped: true, reason: 'Parent not present - payment will be processed when parent pays fee' } };
        }

        // Skip if no payment provided (neither new payment nor applied previous payments)
        const hasNewPayment = sessionData.insurance_payment && sessionData.insurance_payment.amount > 0;
        const hasAppliedPayments = sessionData.insurance_payment &&
            sessionData.insurance_payment.applied_previous_payments &&
            sessionData.insurance_payment.applied_previous_payments.length > 0;

        if (!hasNewPayment && !hasAppliedPayments) {
            console.log(`ℹ️ [Insurance Payment] Skipping payment processing - no payment data provided`);
            return { success: true, data: { skipped: true, reason: 'No payment provided' } };
        }

        // Get fee data from previous step
        const feeResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'process_insurance_fee' AND status = 'completed'`,
            [sessionId]
        );

        if (feeResult.rows.length === 0) {
            throw new Error('Insurance fee step not completed');
        }

        const feeData = typeof feeResult.rows[0].result_data === 'string'
            ? JSON.parse(feeResult.rows[0].result_data)
            : feeResult.rows[0].result_data;

        if (feeData.skipped) {
            console.log(`ℹ️ [Insurance Payment] Skipping payment processing - no fee was created`);
            return { success: true, data: { skipped: true, reason: 'No fee to pay' } };
        }

        const paymentIdempotencyKey = `${sessionId}_insurance_payment`;

        // Check if payment already exists
        const existingPayment = await query(
            'SELECT id, transaction_id FROM fee_payments WHERE idempotency_key = $1',
            [paymentIdempotencyKey]
        );

        if (existingPayment.rows.length > 0) {
            return {
                success: true, data: {
                    paymentId: existingPayment.rows[0].id,
                    transactionId: existingPayment.rows[0].transaction_id,
                    alreadyProcessed: true
                }
            };
        }

        console.log(`💳 [Insurance Payment] Processing payment for parent-present checkout with insurance`);

        // Calculate total payment amount
        const newPaymentAmount = sessionData.insurance_payment.amount || 0;
        const appliedPreviousPayments = sessionData.insurance_payment.applied_previous_payments || [];
        const totalAppliedFromPrevious = appliedPreviousPayments.reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0);
        const totalPaymentAmount = newPaymentAmount + totalAppliedFromPrevious;

        console.log(`💰 [Insurance Payment] Payment breakdown:`, {
            newPaymentAmount,
            appliedPreviousPayments: appliedPreviousPayments.length,
            totalAppliedFromPrevious,
            totalPaymentAmount,
            ltcFee: feeAndCostConfig.ltcFee
        });

        // Process new payment if amount > 0
        let newPaymentId = null;
        let transactionId = null;

        if (newPaymentAmount > 0) {
            // Generate transaction ID for new insurance payment
            transactionId = await this.generatePaymentTransactionId('I');

            // Process new payment with transaction ID
            const paymentResult = await query(
                `INSERT INTO fee_payments (student_fee_id, amount, payment_method, notes, processed_by_user_id, idempotency_key, transaction_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, transaction_id`,
                [
                    feeData.feeId,
                    newPaymentAmount,
                    sessionData.insurance_payment.payment_method,
                    sessionData.insurance_payment.notes || null,
                    sessionData.user_id,
                    paymentIdempotencyKey,
                    transactionId
                ]
            );

            newPaymentId = paymentResult.rows[0].id;
            transactionId = paymentResult.rows[0].transaction_id;
            console.log(`✅ [Insurance Payment] New payment of $${newPaymentAmount} recorded with transaction ID: ${transactionId}`);
        }

        // Apply previous payments if any using proper credit transfer
        const appliedPaymentIds = [];
        if (appliedPreviousPayments.length > 0) {
            const { transferCreditToFee, getAvailableCredits } = await import('./feeService');

            for (const prevPayment of appliedPreviousPayments) {
                // Use transaction_id for unique idempotency key to avoid duplicates
                const appliedPaymentIdempotencyKey = `${sessionId}_applied_${prevPayment.transaction_id}`;

                // Check if this payment was already applied to avoid duplicates
                const existingAppliedPayment = await query(
                    'SELECT id, transaction_id FROM fee_payments WHERE transaction_id = $1 AND student_fee_id = $2',
                    [prevPayment.transaction_id, feeData.feeId]
                );

                if (existingAppliedPayment.rows.length > 0) {
                    // Payment already applied, add to result set
                    appliedPaymentIds.push({
                        id: existingAppliedPayment.rows[0].id,
                        transaction_id: existingAppliedPayment.rows[0].transaction_id,
                        amount: Number(prevPayment.amount),
                        original_transaction_id: prevPayment.transaction_id,
                        alreadyApplied: true
                    });
                    console.log(`ℹ️ [Insurance Payment] Previous payment ${prevPayment.transaction_id} already applied, skipping`);
                    continue;
                }

                // Get student ID from previous step
                const studentResult = await query(
                    `SELECT result_data FROM checkout_step_tracking
                     WHERE checkout_session_id = $1 AND step_name = 'create_or_validate_student' AND status = 'completed'`,
                    [sessionId]
                );

                const studentResultData = typeof studentResult.rows[0].result_data === 'string'
                    ? JSON.parse(studentResult.rows[0].result_data)
                    : studentResult.rows[0].result_data;
                const studentId = studentResultData.student.id;

                // Find the credit in archived_fee_payments to get the credit ID
                const availableCredits = await getAvailableCredits(studentId);
                const creditToTransfer = availableCredits.find(credit => credit.transaction_id === prevPayment.transaction_id);

                if (!creditToTransfer) {
                    console.error(`❌ [Insurance Payment] Credit not found for transaction ${prevPayment.transaction_id}`);
                    continue;
                }

                // Use the proper credit transfer function to preserve original transaction ID
                const transferResult = await transferCreditToFee(
                    creditToTransfer.id,
                    feeData.feeId,
                    sessionData.user_id
                );

                appliedPaymentIds.push({
                    id: transferResult.id,
                    transaction_id: transferResult.transaction_id, // This will be the original transaction ID
                    amount: Number(prevPayment.amount),
                    original_transaction_id: prevPayment.transaction_id
                });

                console.log(`✅ [Insurance Payment] Applied previous payment of $${prevPayment.amount} with ORIGINAL transaction ID: ${transferResult.transaction_id}`);
            }
        }
        // Invalidate any unused credits if new payment was made
        if (newPaymentAmount > 0) {
            const { invalidateUnusedCredits } = await import('./feeService');

            // Get student ID from previous step
            const studentResult = await query(
                `SELECT result_data FROM checkout_step_tracking
                 WHERE checkout_session_id = $1 AND step_name = 'create_or_validate_student' AND status = 'completed'`,
                [sessionId]
            );

            const studentResultData = typeof studentResult.rows[0].result_data === 'string'
                ? JSON.parse(studentResult.rows[0].result_data)
                : studentResult.rows[0].result_data;
            const studentId = studentResultData.student.id;

            const invalidatedCount = await invalidateUnusedCredits(
                studentId,
                `New insurance payment made (Transaction: ${transactionId}) instead of using available credit`
            );

            if (invalidatedCount > 0) {
                console.log(`🚫 [Insurance Payment] Invalidated ${invalidatedCount} unused credits since new payment was made`);
            }
        }

        // Update insurance status if full payment
        const remainingBalance = feeAndCostConfig.ltcFee - totalPaymentAmount;
        if (remainingBalance <= 0) {
            await query(
                `UPDATE chromebooks SET insurance_status = 'insured', is_insured = true WHERE id = $1`,
                [sessionData.chromebook_id]
            );
            console.log(`✅ [Insurance Payment] Full payment received - device marked as insured`);
        } else {
            console.log(`⏳ [Insurance Payment] Partial payment received - remaining balance: $${remainingBalance}`);
        }

        return {
            success: true, data: {
                paymentId: newPaymentId,
                transactionId: transactionId,
                appliedPayments: appliedPaymentIds,
                totalPaymentAmount,
                remainingBalance: Math.max(0, remainingBalance)
            }
        };
    }

    private static async createDeviceHistory(sessionId: string, sessionData: CheckoutSessionData): Promise<any> {
        // Get student data
        const studentResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'create_or_validate_student' AND status = 'completed'`,
            [sessionId]
        );

        if (studentResult.rows.length === 0) {
            throw new Error('Student creation step not completed');
        }

        const studentResultData = typeof studentResult.rows[0].result_data === 'string'
            ? JSON.parse(studentResult.rows[0].result_data)
            : studentResult.rows[0].result_data;
        const { student } = studentResultData;

        // Create device history with idempotency
        const historyIdempotencyKey = `${sessionId}_device_history`;

        // Check if device history already exists
        const existingHistory = await query(
            `SELECT id FROM device_history
             WHERE chromebook_id = $1 AND student_id = $2 AND event_type = 'Check-Out'
             AND created_at > (CURRENT_TIMESTAMP - INTERVAL '1 hour')`,
            [sessionData.chromebook_id, student.id]
        );

        if (existingHistory.rows.length > 0) {
            return { success: true, data: { historyId: existingHistory.rows[0].id, alreadyCreated: true } };
        }

        // Create device history record
        const historyResult = await query(
            `INSERT INTO device_history (chromebook_id, user_id, student_id, event_type, details)
             VALUES ($1, $2, $3, 'Check-Out', $4) RETURNING id`,
            [
                sessionData.chromebook_id,
                sessionData.user_id,
                student.id,
                {
                    admin_name: 'System',
                    student_name: `${student.first_name} ${student.last_name}`,
                    student_email: student.email,
                    granular_checkout: true,
                    session_id: sessionId
                }
            ]
        );

        return { success: true, data: { historyId: historyResult.rows[0].id } };
    }

    private static async generatePdfAgreement(sessionId: string, sessionData: CheckoutSessionData): Promise<any> {
        // Get checkout and student data
        const checkoutResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'create_checkout_history' AND status = 'completed'`,
            [sessionId]
        );

        if (checkoutResult.rows.length === 0) {
            throw new Error('Checkout history step not completed');
        }

        const checkoutResultData = typeof checkoutResult.rows[0].result_data === 'string'
            ? JSON.parse(checkoutResult.rows[0].result_data)
            : checkoutResult.rows[0].result_data;
        const { checkoutId, student } = checkoutResultData;

        // Get device details
        const deviceResult = await query(
            'SELECT asset_tag, serial_number FROM chromebooks WHERE id = $1',
            [sessionData.chromebook_id]
        );

        if (deviceResult.rows.length === 0) {
            throw new Error('Device not found');
        }

        const device = deviceResult.rows[0];

        // Check if PDF already generated
        const pdfIdempotencyKey = `${sessionId}_pdf_generation`;
        const existingPdf = await query(
            `SELECT operation_result FROM operation_idempotency
             WHERE idempotency_key = $1 AND status = 'completed'`,
            [pdfIdempotencyKey]
        );

        if (existingPdf.rows.length > 0) {
            const result = JSON.parse(existingPdf.rows[0].operation_result);
            return { success: true, data: { filename: result.filename, alreadyGenerated: true } };
        }

        // Generate PDF
        const filename = await PDFService.generateCheckoutAgreement({
            studentName: `${student.first_name} ${student.last_name}`,
            studentId: student.student_id,
            deviceSerial: device.serial_number,
            deviceAssetTag: device.asset_tag,
            isInsured: sessionData.insurance === 'insured' || sessionData.insurance === 'pending',
            checkoutDate: new Date(),
            signature: sessionData.signature,
            parentSignature: sessionData.parent_signature,
            isPending: !sessionData.parent_present,
        });

        // Mark as completed with idempotency
        await query(
            `INSERT INTO operation_idempotency (idempotency_key, operation_type, operation_result, status)
             VALUES ($1, 'generate_pdf', $2, 'completed')`,
            [pdfIdempotencyKey, JSON.stringify({ filename, checkoutId })]
        );

        return { success: true, data: { filename } };
    }

    private static async updateGoogleNotes(sessionId: string, sessionData: CheckoutSessionData): Promise<any> {
        // Skip if Google Notes is disabled
        if (!googleNotesConfig.enabled) {
            return { success: true, data: { skipped: true, reason: 'Google Notes disabled' } };
        }

        // Get student and device data
        const studentResult = await query(
            `SELECT result_data FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND step_name = 'create_or_validate_student' AND status = 'completed'`,
            [sessionId]
        );

        if (studentResult.rows.length === 0) {
            throw new Error('Student creation step not completed');
        }

        const studentResultData = typeof studentResult.rows[0].result_data === 'string'
            ? JSON.parse(studentResult.rows[0].result_data)
            : studentResult.rows[0].result_data;
        const { student } = studentResultData;

        // Get device details
        const deviceResult = await query(
            'SELECT asset_tag FROM chromebooks WHERE id = $1',
            [sessionData.chromebook_id]
        );

        if (deviceResult.rows.length === 0) {
            throw new Error('Device not found');
        }

        const device = deviceResult.rows[0];

        if (!device.asset_tag) {
            return { success: true, data: { skipped: true, reason: 'No asset tag found' } };
        }

        // Check if notes already updated
        const notesIdempotencyKey = `${sessionId}_google_notes`;
        const existingNotes = await query(
            `SELECT operation_result FROM operation_idempotency
             WHERE idempotency_key = $1 AND status = 'completed'`,
            [notesIdempotencyKey]
        );

        if (existingNotes.rows.length > 0) {
            const result = JSON.parse(existingNotes.rows[0].operation_result);
            return { success: true, data: { asset_tag: result.asset_tag, alreadyUpdated: true } };
        }

        // Format notes content
        const notesContent = GoogleNotesService.formatCheckoutNote(
            `${student.first_name} ${student.last_name}`,
            student.email || student.student_id,
            'system@example.com', // Will be replaced with actual user email
            sessionData.insurance === 'insured'
        );

        // Update Google notes
        const notesResult = await GoogleNotesService.updateDeviceNotes(
            device.asset_tag,
            notesContent,
            '' // Auth token - in production this would be passed properly
        );

        if (!notesResult.success) {
            // Google Notes failures are not critical - log but don't fail the step
            console.warn(`⚠️ [Granular Checkout] Google notes update failed (non-critical):`, notesResult.error);
            return { success: true, data: { skipped: true, reason: notesResult.error } };
        }

        const result = { asset_tag: device.asset_tag, updated: true };

        // Mark as completed with idempotency
        await query(
            `INSERT INTO operation_idempotency (idempotency_key, operation_type, operation_result, status)
             VALUES ($1, 'update_google_notes', $2, 'completed')`,
            [notesIdempotencyKey, JSON.stringify(result)]
        );

        return { success: true, data: result };
    }

    /**
     * Helper methods
     */

    private static async generatePaymentTransactionId(feeType: 'I' | 'D'): Promise<string> {
        // Format date as YYMMDD in PST timezone
        const pstDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
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

    private static generateSessionId(sessionData: CheckoutSessionData): string {
        const baseData = `${sessionData.chromebook_id}_${sessionData.student_id}_${sessionData.user_id}_${Date.now()}`;
        return crypto.createHash('sha256').update(baseData).digest('hex').substring(0, 32);
    }

    private static generateStepIdempotencyKey(sessionId: string, stepName: string, sessionData: CheckoutSessionData): string {
        const baseData = `${sessionId}_${stepName}_${sessionData.chromebook_id}_${sessionData.student_id}`;
        return crypto.createHash('sha256').update(baseData).digest('hex').substring(0, 32);
    }

    private static async getNextPendingStep(sessionId: string): Promise<string | null> {
        const result = await query(
            `SELECT step_name FROM checkout_step_tracking
             WHERE checkout_session_id = $1 AND status = 'pending'
             ORDER BY created_at ASC
             LIMIT 1`,
            [sessionId]
        );

        return result.rows.length > 0 ? result.rows[0].step_name : null;
    }

    private static async completeSession(sessionId: string): Promise<void> {
        await query(
            `UPDATE checkout_sessions
             SET overall_status = 'completed', completed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [sessionId]
        );
        console.log(`✅ [Granular Checkout] Session completed: ${sessionId}`);
    }

    /**
     * Process all remaining steps for a session
     */
    static async processAllSteps(sessionId: string): Promise<SessionStatus | null> {
        console.log(`🔄 [Granular Checkout] Processing all steps for session: ${sessionId}`);

        while (true) {
            const result = await this.executeNextStep(sessionId);

            if (!result.success) {
                console.error(`❌ [Granular Checkout] Step failed for session ${sessionId}:`, result.error);
                break;
            }

            if (result.data?.completed) {
                console.log(`✅ [Granular Checkout] All steps completed for session: ${sessionId}`);
                break;
            }
        }

        return await this.getSessionStatus(sessionId);
    }

    /**
     * Cancel a checkout session
     */
    static async cancelSession(sessionId: string): Promise<void> {
        await query(
            `UPDATE checkout_sessions
             SET overall_status = 'cancelled', completed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [sessionId]
        );

        await query(
            `UPDATE checkout_step_tracking
             SET status = 'cancelled'
             WHERE checkout_session_id = $1 AND status IN ('pending', 'processing')`,
            [sessionId]
        );

        console.log(`🚫 [Granular Checkout] Session cancelled: ${sessionId}`);
    }

    /**
     * Get all active sessions
     */
    static async getActiveSessions(): Promise<any[]> {
        const result = await query(
            `SELECT cs.*,
                    COUNT(cst.id) as total_steps,
                    COUNT(CASE WHEN cst.status = 'completed' THEN 1 END) as completed_steps,
                    COUNT(CASE WHEN cst.status = 'failed' THEN 1 END) as failed_steps
             FROM checkout_sessions cs
             LEFT JOIN checkout_step_tracking cst ON cs.id = cst.checkout_session_id
             WHERE cs.overall_status = 'in_progress'
             GROUP BY cs.id, cs.chromebook_id, cs.student_id, cs.user_id, cs.checkout_data,
                      cs.overall_status, cs.current_step, cs.created_at, cs.updated_at, cs.completed_at
             ORDER BY cs.created_at DESC`
        );

        return result.rows.map(row => ({
            sessionId: row.id,
            chromebookId: row.chromebook_id,
            studentId: row.student_id,
            overallStatus: row.overall_status,
            currentStep: row.current_step,
            totalSteps: parseInt(row.total_steps),
            completedSteps: parseInt(row.completed_steps),
            failedSteps: parseInt(row.failed_steps),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }
}
