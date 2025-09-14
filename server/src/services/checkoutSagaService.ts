import { query } from '../database';
import { PDFService } from './pdfService';
import { GoogleNotesService } from './googleNotesService';
import { googleNotesConfig } from '../config';
import crypto from 'crypto';

export interface CheckoutSagaData {
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

export interface SagaStepResult {
    success: boolean;
    data?: any;
    error?: string;
    compensationData?: any;
}

export type CheckoutState =
    | 'pending'
    | 'core_transaction_completed'
    | 'pdf_generating'
    | 'google_notes_updating'
    | 'completed'
    | 'failed'
    | 'compensating'
    | 'cancelled';

export class CheckoutSagaService {

    /**
     * Generate a unique idempotency key for the checkout operation
     */
    static generateIdempotencyKey(sagaData: CheckoutSagaData): string {
        const baseData = `${sagaData.chromebook_id}_${sagaData.student_id}_${sagaData.user_id}_${Date.now()}`;
        return crypto.createHash('sha256').update(baseData).digest('hex').substring(0, 32);
    }

    /**
     * Generate a unique transaction ID for payments
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

    /**
     * Start a new checkout saga
     */
    static async startCheckoutSaga(sagaData: CheckoutSagaData): Promise<{ checkoutId: number; idempotencyKey: string }> {
        const idempotencyKey = this.generateIdempotencyKey(sagaData);

        console.log(`🔄 [Checkout Saga] Starting saga with idempotency key: ${idempotencyKey}`);

        // Check if this exact operation was already completed
        const existingOperation = await this.checkIdempotency(idempotencyKey, 'start_checkout');
        if (existingOperation) {
            console.log(`✅ [Checkout Saga] Operation already completed: ${idempotencyKey}`);
            return { checkoutId: existingOperation.operation_result.checkoutId, idempotencyKey };
        }

        // Step 1: Execute core database transaction
        const coreResult = await this.executeCoreTransaction(sagaData, idempotencyKey);

        if (!coreResult.success) {
            const errorMessage = coreResult.error || 'Unknown error occurred';
            await this.markOperationFailed(idempotencyKey, 'start_checkout', errorMessage);
            throw new Error(`Core transaction failed: ${errorMessage}`);
        }

        const checkoutId = coreResult.data.checkoutId;

        // Step 2: Queue async operations in outbox
        await this.queueAsyncOperations(checkoutId, sagaData, idempotencyKey);

        // Mark operation as completed
        await this.markOperationCompleted(idempotencyKey, 'start_checkout', { checkoutId });

        console.log(`✅ [Checkout Saga] Core transaction completed for checkout: ${checkoutId}`);

        // Step 3: Process async operations (non-blocking)
        this.processAsyncOperations(checkoutId).catch(error => {
            console.error(`❌ [Checkout Saga] Async processing failed for checkout ${checkoutId}:`, error);
        });

        return { checkoutId, idempotencyKey };
    }

    /**
     * Execute the core database transaction (synchronous part)
     */
    private static async executeCoreTransaction(sagaData: CheckoutSagaData, idempotencyKey: string): Promise<SagaStepResult> {
        const client = await query('SELECT 1').then(() => null).catch(() => null); // Get client for transaction

        try {
            await query('BEGIN');

            // Get chromebook details
            const chromebookResult = await query(
                'SELECT c.*, s.student_id as current_student_id, s.first_name as current_first_name, s.last_name as current_last_name FROM chromebooks c LEFT JOIN students s ON c.current_user_id = s.id WHERE c.id = $1',
                [sagaData.chromebook_id]
            );

            if (chromebookResult.rows.length === 0) {
                throw new Error('Chromebook not found');
            }

            const chromebook = chromebookResult.rows[0];

            // Get or create student
            let studentResult = await query('SELECT * FROM students WHERE student_id = $1', [sagaData.student_id]);
            let student;

            if (studentResult.rows.length === 0) {
                // Try to find in Google Users
                const googleUserResult = await query(
                    'SELECT * FROM google_users WHERE primary_email LIKE $1 OR google_id = $2',
                    [`%${sagaData.student_id}%`, sagaData.student_id]
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
                    [sagaData.student_id, firstName, lastName, email]
                );
                student = insertStudentResult.rows[0];
            } else {
                student = studentResult.rows[0];
            }

            // Handle force reassignment
            if (chromebook.status === 'checked_out' && sagaData.force_reassign && chromebook.current_user_id) {
                await query(
                    `INSERT INTO checkout_history (chromebook_id, student_id, user_id, action, notes)
                     VALUES ($1, $2, $3, 'checkin', $4)`,
                    [sagaData.chromebook_id, chromebook.current_user_id, sagaData.user_id, 'Device reassigned to another student']
                );
            }

            // Determine insurance status
            let insurance_status = 'uninsured';
            if (sagaData.parent_present) {
                if (sagaData.insurance === 'pending') {
                    insurance_status = 'pending';
                } else if (sagaData.insurance === 'insured') {
                    insurance_status = 'insured';
                }
            }

            const newStatus = sagaData.parent_present ? 'checked_out' : 'pending_signature';

            // Update chromebook status
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
                 RETURNING id, status, current_user_id, status_source`,
                [newStatus, student.id, insurance_status === 'insured', insurance_status, sagaData.chromebook_id]
            );

            if (updateResult.rows.length === 0) {
                throw new Error(`Failed to update chromebook ${sagaData.chromebook_id} - no rows affected`);
            }

            // Create checkout history record with saga tracking
            const checkoutNotes = sagaData.force_reassign && chromebook.status === 'checked_out'
                ? `Reassigned from ${chromebook.current_student_id || 'previous student'}. ${sagaData.notes || `Checked out with ${sagaData.agreement_type || 'standard'} agreement`}`
                : sagaData.notes || `Checked out with ${sagaData.agreement_type || 'standard'} agreement`;

            const historyResult = await query(
                `INSERT INTO checkout_history (
                    chromebook_id, student_id, user_id, action, notes, signature, parent_signature,
                    status, insurance, idempotency_key, checkout_state
                ) VALUES ($1, $2, $3, 'checkout', $4, $5, $6, $7, $8, $9, 'core_transaction_completed')
                RETURNING id`,
                [
                    sagaData.chromebook_id, student.id, sagaData.user_id, checkoutNotes,
                    sagaData.signature, sagaData.parent_signature,
                    sagaData.parent_present ? 'completed' : 'pending',
                    insurance_status, idempotencyKey
                ]
            );
            const checkoutId = historyResult.rows[0].id;

            // Handle insurance fees with idempotency
            if (insurance_status === 'pending' || insurance_status === 'insured') {
                const feeIdempotencyKey = `${idempotencyKey}_fee`;

                // Check if fee was already created
                const existingFee = await query(
                    'SELECT id FROM student_fees WHERE idempotency_key = $1',
                    [feeIdempotencyKey]
                );

                if (existingFee.rows.length === 0) {
                    // Import the replacement function
                    const { replaceInsuranceFee } = await import('./feeService');

                    // Use the new replacement function to handle existing fees
                    const feeResult = await replaceInsuranceFee(
                        student.id,
                        40, // Using hardcoded fee for now
                        'Device Insurance Fee',
                        sagaData.user_id,
                        feeIdempotencyKey,
                        checkoutId
                    );
                    const feeId = feeResult.fee.id;

                    // Handle payment if provided
                    if (sagaData.insurance_payment && sagaData.insurance_payment.amount > 0) {
                        const paymentIdempotencyKey = `${idempotencyKey}_payment`;

                        const existingPayment = await query(
                            'SELECT id FROM fee_payments WHERE idempotency_key = $1',
                            [paymentIdempotencyKey]
                        );

                        if (existingPayment.rows.length === 0) {
                            // Generate transaction ID for insurance payment
                            const transactionId = await this.generatePaymentTransactionId('I');

                            await query(
                                `INSERT INTO fee_payments (student_fee_id, amount, payment_method, notes, processed_by_user_id, idempotency_key, transaction_id)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                                [feeId, sagaData.insurance_payment.amount, sagaData.insurance_payment.payment_method,
                                    sagaData.insurance_payment.notes || null, sagaData.user_id, paymentIdempotencyKey, transactionId]
                            );

                            // Update insurance status if full payment
                            const remainingBalance = 40 - sagaData.insurance_payment.amount;
                            if (remainingBalance <= 0) {
                                insurance_status = 'insured';
                                await query(
                                    `UPDATE chromebooks SET insurance_status = 'insured', is_insured = true WHERE id = $1`,
                                    [sagaData.chromebook_id]
                                );
                            }
                        }
                    }
                }
            }

            // Create device history record
            await query(
                `INSERT INTO device_history (chromebook_id, user_id, student_id, event_type, details)
                 VALUES ($1, $2, $3, 'Check-Out', $4)`,
                [
                    sagaData.chromebook_id,
                    sagaData.user_id,
                    student.id,
                    {
                        admin_name: 'System', // Will be updated with actual user data
                        student_name: `${student.first_name} ${student.last_name}`,
                        student_email: student.email,
                        saga_transaction: true
                    }
                ]
            );

            await query('COMMIT');

            return {
                success: true,
                data: {
                    checkoutId,
                    chromebook,
                    student,
                    insurance_status,
                    newStatus
                },
                compensationData: {
                    chromebook_id: sagaData.chromebook_id,
                    previous_status: chromebook.status,
                    previous_user_id: chromebook.current_user_id,
                    student_id: student.id
                }
            };

        } catch (error) {
            await query('ROLLBACK');
            console.error('❌ [Checkout Saga] Core transaction failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Queue async operations in outbox pattern
     */
    private static async queueAsyncOperations(checkoutId: number, sagaData: CheckoutSagaData, idempotencyKey: string): Promise<void> {
        // Queue PDF generation
        await query(
            `INSERT INTO checkout_outbox (checkout_id, operation_type, operation_data, idempotency_key)
             VALUES ($1, 'generate_pdf', $2, $3)`,
            [
                checkoutId,
                JSON.stringify({
                    sagaData,
                    checkoutId
                }),
                `${idempotencyKey}_pdf`
            ]
        );

        // Queue Google Notes update if enabled
        if (googleNotesConfig.enabled) {
            await query(
                `INSERT INTO checkout_outbox (checkout_id, operation_type, operation_data, idempotency_key)
                 VALUES ($1, 'update_google_notes', $2, $3)`,
                [
                    checkoutId,
                    JSON.stringify({
                        sagaData,
                        checkoutId
                    }),
                    `${idempotencyKey}_google_notes`
                ]
            );
        }
    }

    /**
     * Process async operations with retry logic
     */
    private static async processAsyncOperations(checkoutId: number): Promise<void> {
        console.log(`🔄 [Checkout Saga] Processing async operations for checkout: ${checkoutId}`);

        // Get pending operations for this checkout
        const operations = await query(
            `SELECT * FROM checkout_outbox
             WHERE checkout_id = $1 AND status = 'pending'
             ORDER BY created_at ASC`,
            [checkoutId]
        );

        for (const operation of operations.rows) {
            await this.processOperation(operation);
        }

        // Check if all operations completed successfully
        const remainingOps = await query(
            `SELECT COUNT(*) as count FROM checkout_outbox
             WHERE checkout_id = $1 AND status != 'completed'`,
            [checkoutId]
        );

        if (parseInt(remainingOps.rows[0].count) === 0) {
            // All operations completed, mark checkout as completed
            await query(
                `UPDATE checkout_history
                 SET checkout_state = 'completed', updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [checkoutId]
            );
            console.log(`✅ [Checkout Saga] All operations completed for checkout: ${checkoutId}`);
        }
    }

    /**
     * Process individual operation with retry logic
     */
    private static async processOperation(operation: any): Promise<void> {
        const { id, operation_type, operation_data, retry_count, max_retries } = operation;

        try {
            // Mark as processing
            await query(
                `UPDATE checkout_outbox
                 SET status = 'processing', last_attempt_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [id]
            );

            const data = JSON.parse(operation_data);
            let result: SagaStepResult;

            switch (operation_type) {
                case 'generate_pdf':
                    result = await this.processPdfGeneration(data);
                    break;
                case 'update_google_notes':
                    result = await this.processGoogleNotesUpdate(data);
                    break;
                default:
                    throw new Error(`Unknown operation type: ${operation_type}`);
            }

            if (result.success) {
                // Mark as completed
                await query(
                    `UPDATE checkout_outbox
                     SET status = 'completed', updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [id]
                );
                console.log(`✅ [Checkout Saga] Operation ${operation_type} completed for operation ID: ${id}`);
            } else {
                throw new Error(result.error || 'Operation failed');
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ [Checkout Saga] Operation ${operation_type} failed (attempt ${retry_count + 1}):`, errorMessage);

            if (retry_count >= max_retries) {
                // Max retries exceeded, mark as failed
                await query(
                    `UPDATE checkout_outbox
                     SET status = 'failed', last_error = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [errorMessage, id]
                );

                // Trigger compensation for critical failures
                if (operation_type === 'generate_pdf') {
                    console.log(`🔄 [Checkout Saga] Critical operation failed, triggering compensation for checkout`);
                    // Note: For PDF generation failures, we might want to continue without compensation
                    // since the core transaction succeeded and the PDF can be regenerated later
                }
            } else {
                // Increment retry count and schedule for retry
                const nextRetryDelay = Math.pow(2, retry_count) * 1000; // Exponential backoff
                await query(
                    `UPDATE checkout_outbox
                     SET retry_count = retry_count + 1, last_error = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [errorMessage, id]
                );

                // Schedule retry (in production, this would use a job queue)
                setTimeout(() => {
                    this.processOperation({ ...operation, retry_count: retry_count + 1 })
                        .catch(retryError => {
                            console.error(`❌ [Checkout Saga] Retry failed for operation ${id}:`, retryError);
                        });
                }, nextRetryDelay);
            }
        }
    }

    /**
     * Process PDF generation with idempotency
     */
    private static async processPdfGeneration(data: any): Promise<SagaStepResult> {
        const { sagaData, checkoutId } = data;

        try {
            // Check if PDF was already generated
            const idempotencyKey = `pdf_${checkoutId}`;
            const existing = await this.checkIdempotency(idempotencyKey, 'generate_pdf');

            if (existing) {
                console.log(`✅ [Checkout Saga] PDF already generated for checkout: ${checkoutId}`);
                return { success: true, data: existing.operation_result };
            }

            // Get checkout details from database
            const checkoutResult = await query(
                `SELECT
                    ch.id, ch.signature, ch.parent_signature,
                    c.asset_tag, c.serial_number,
                    s.student_id, s.first_name, s.last_name
                FROM checkout_history ch
                JOIN chromebooks c ON ch.chromebook_id = c.id
                JOIN students s ON ch.student_id = s.id
                WHERE ch.id = $1`,
                [checkoutId]
            );

            if (checkoutResult.rows.length === 0) {
                throw new Error(`Checkout record not found: ${checkoutId}`);
            }

            const checkout = checkoutResult.rows[0];

            // Generate PDF
            const filename = await PDFService.generateCheckoutAgreement({
                studentName: `${checkout.first_name} ${checkout.last_name}`,
                studentId: checkout.student_id,
                deviceSerial: checkout.serial_number,
                deviceAssetTag: checkout.asset_tag,
                isInsured: sagaData.insurance === 'insured' || sagaData.insurance === 'pending',
                checkoutDate: new Date(),
                signature: checkout.signature,
                parentSignature: checkout.parent_signature,
                isPending: !sagaData.parent_present,
            });

            const result = { filename, checkoutId };

            // Mark operation as completed in idempotency table
            await this.markOperationCompleted(idempotencyKey, 'generate_pdf', result);

            return { success: true, data: result };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Process Google Notes update with idempotency
     */
    private static async processGoogleNotesUpdate(data: any): Promise<SagaStepResult> {
        const { sagaData, checkoutId } = data;

        try {
            // Check if notes were already updated
            const idempotencyKey = `google_notes_${checkoutId}`;
            const existing = await this.checkIdempotency(idempotencyKey, 'update_google_notes');

            if (existing) {
                console.log(`✅ [Checkout Saga] Google notes already updated for checkout: ${checkoutId}`);
                return { success: true, data: existing.operation_result };
            }

            // Get chromebook and student details
            const checkoutResult = await query(
                `SELECT
                    c.asset_tag,
                    s.first_name, s.last_name, s.email, s.student_id
                FROM checkout_history ch
                JOIN chromebooks c ON ch.chromebook_id = c.id
                JOIN students s ON ch.student_id = s.id
                WHERE ch.id = $1`,
                [checkoutId]
            );

            if (checkoutResult.rows.length === 0) {
                throw new Error(`Checkout record not found: ${checkoutId}`);
            }

            const checkout = checkoutResult.rows[0];

            if (!checkout.asset_tag) {
                throw new Error(`No asset tag found for checkout: ${checkoutId}`);
            }

            // Format notes content
            const notesContent = GoogleNotesService.formatCheckoutNote(
                `${checkout.first_name} ${checkout.last_name}`,
                checkout.email || checkout.student_id,
                'system@example.com', // Will be replaced with actual user email
                sagaData.insurance === 'insured'
            );

            // Update Google notes
            const notesResult = await GoogleNotesService.updateDeviceNotes(
                checkout.asset_tag,
                notesContent,
                '' // Auth token - in production this would be passed properly
            );

            if (!notesResult.success) {
                throw new Error(notesResult.error || 'Google notes update failed');
            }

            const result = { asset_tag: checkout.asset_tag, updated: true };

            // Mark operation as completed
            await this.markOperationCompleted(idempotencyKey, 'update_google_notes', result);

            return { success: true, data: result };

        } catch (error) {
            // Google Notes failures are not critical - log but don't fail the saga
            console.warn(`⚠️ [Checkout Saga] Google notes update failed (non-critical):`, error);
            return { success: true, data: { skipped: true, reason: error instanceof Error ? error.message : String(error) } };
        }
    }

    /**
     * Check if operation was already completed (idempotency)
     */
    private static async checkIdempotency(idempotencyKey: string, operationType: string): Promise<any | null> {
        const result = await query(
            `SELECT * FROM operation_idempotency
             WHERE idempotency_key = $1 AND operation_type = $2 AND status = 'completed'
             AND expires_at > CURRENT_TIMESTAMP`,
            [idempotencyKey, operationType]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Mark operation as completed
     */
    private static async markOperationCompleted(idempotencyKey: string, operationType: string, result: any): Promise<void> {
        await query(
            `INSERT INTO operation_idempotency (idempotency_key, operation_type, operation_result, status)
             VALUES ($1, $2, $3, 'completed')
             ON CONFLICT (idempotency_key)
             DO UPDATE SET operation_result = $3, status = 'completed', created_at = CURRENT_TIMESTAMP`,
            [idempotencyKey, operationType, JSON.stringify(result)]
        );
    }

    /**
     * Mark operation as failed
     */
    private static async markOperationFailed(idempotencyKey: string, operationType: string, error: string): Promise<void> {
        await query(
            `INSERT INTO operation_idempotency (idempotency_key, operation_type, operation_result, status)
             VALUES ($1, $2, $3, 'failed')
             ON CONFLICT (idempotency_key)
             DO UPDATE SET operation_result = $3, status = 'failed', created_at = CURRENT_TIMESTAMP`,
            [idempotencyKey, operationType, JSON.stringify({ error })]
        );
    }

    /**
     * Get checkout status with detailed saga information
     */
    static async getCheckoutStatus(checkoutId: number): Promise<any> {
        const checkoutResult = await query(
            `SELECT
                ch.*,
                c.asset_tag, c.status as device_status,
                s.student_id, s.first_name, s.last_name
             FROM checkout_history ch
             JOIN chromebooks c ON ch.chromebook_id = c.id
             JOIN students s ON ch.student_id = s.id
             WHERE ch.id = $1`,
            [checkoutId]
        );

        if (checkoutResult.rows.length === 0) {
            return null;
        }

        const checkout = checkoutResult.rows[0];

        // Get outbox operations status
        const operationsResult = await query(
            `SELECT operation_type, status, retry_count, last_error, last_attempt_at
             FROM checkout_outbox
             WHERE checkout_id = $1
             ORDER BY created_at ASC`,
            [checkoutId]
        );

        return {
            checkout: checkout,
            operations: operationsResult.rows,
            overall_status: checkout.checkout_state
        };
    }

    /**
     * Retry failed operations for a checkout
     */
    static async retryFailedOperations(checkoutId: number): Promise<void> {
        console.log(`🔄 [Checkout Saga] Retrying failed operations for checkout: ${checkoutId}`);

        // Reset failed operations to pending
        await query(
            `UPDATE checkout_outbox
             SET status = 'pending', retry_count = 0, last_error = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE checkout_id = $1 AND status = 'failed'`,
            [checkoutId]
        );

        // Process operations
        await this.processAsyncOperations(checkoutId);
    }
}
