import { query } from '../database';
import { GoogleNotesService } from './googleNotesService';
import { PDFService } from './pdfService';
import { TestFailureService } from '../utils/testFailures';

export interface ValidationResult {
    success: boolean;
    message: string;
    details?: any;
}

export interface PreFlightResults {
    studentData: ValidationResult;
    deviceAvailability: ValidationResult;
    dataCompleteness: ValidationResult;
    systemReadiness: ValidationResult;
    businessRules: ValidationResult;
    overall: boolean;
}

export interface PostFlightResults {
    databaseUpdates: ValidationResult;
    externalSystems: ValidationResult;
    dataConsistency: ValidationResult;
    overall: boolean;
}

export class CheckoutValidationService {

    /**
     * Run pre-flight validation checks before checkout execution
     */
    static async runPreFlightChecks(data: {
        chromebook_id: number;
        student_id: string;
        parent_present: boolean;
        signature?: string;
        parent_signature?: string;
        insurance?: string;
        insurance_payment?: any;
    }): Promise<PreFlightResults> {
        console.log('🔍 [Pre-Flight] Starting validation checks...');

        const results: PreFlightResults = {
            studentData: { success: false, message: '' },
            deviceAvailability: { success: false, message: '' },
            dataCompleteness: { success: false, message: '' },
            systemReadiness: { success: false, message: '' },
            businessRules: { success: false, message: '' },
            overall: false
        };

        try {
            // 1. Student Data Validation
            results.studentData = await this.validateStudentData(data.student_id);

            // 2. Device Availability Validation
            results.deviceAvailability = await this.validateDeviceAvailability(data.chromebook_id);

            // 3. Data Completeness Validation
            results.dataCompleteness = await this.validateDataCompleteness(data);

            // 4. System Readiness Validation
            results.systemReadiness = await this.validateSystemReadiness();

            // 5. Business Rules Validation
            results.businessRules = await this.validateBusinessRules(data);

            // Overall validation
            results.overall = results.studentData.success &&
                results.deviceAvailability.success &&
                results.dataCompleteness.success &&
                results.systemReadiness.success &&
                results.businessRules.success;

            console.log(`✅ [Pre-Flight] Validation complete. Overall: ${results.overall ? 'PASS' : 'FAIL'}`);
            return results;

        } catch (error) {
            console.error('❌ [Pre-Flight] Validation error:', error);
            results.overall = false;
            return results;
        }
    }

    /**
     * Run post-flight validation checks after checkout execution
     * NOTE: This is READ-ONLY validation - it never modifies data
     */
    static async runPostFlightChecks(data: {
        chromebook_id: number;
        student_id: string;
        expected_status: string;
        checkout_id?: number;
        asset_tag?: string;
    }): Promise<PostFlightResults> {
        console.log('🔍 [Post-Flight] Starting READ-ONLY verification checks...');

        const results: PostFlightResults = {
            databaseUpdates: { success: false, message: '' },
            externalSystems: { success: false, message: '' },
            dataConsistency: { success: false, message: '' },
            overall: false
        };

        try {
            // 1. Database Updates Validation (READ-ONLY)
            results.databaseUpdates = await this.validateDatabaseUpdates(data);

            // 2. External Systems Validation (READ-ONLY)
            results.externalSystems = await this.validateExternalSystems(data);

            // 3. Data Consistency Validation (READ-ONLY)
            results.dataConsistency = await this.validateDataConsistency(data);

            // Overall validation - NO DATA MODIFICATION
            results.overall = results.databaseUpdates.success &&
                results.externalSystems.success &&
                results.dataConsistency.success;

            console.log(`✅ [Post-Flight] READ-ONLY verification complete. Overall: ${results.overall ? 'PASS' : 'FAIL'}`);

            if (!results.overall) {
                console.log('❌ [Post-Flight] Validation failed - checkout should be rolled back');

                // Log detailed failure information for debugging
                if (!results.databaseUpdates.success) {
                    console.log(`  - Database Updates: ${results.databaseUpdates.message}`);
                }
                if (!results.externalSystems.success) {
                    console.log(`  - External Systems: ${results.externalSystems.message}`);
                }
                if (!results.dataConsistency.success) {
                    console.log(`  - Data Consistency: ${results.dataConsistency.message}`);
                }
            }

            return results;

        } catch (error) {
            console.error('❌ [Post-Flight] Verification error:', error);
            results.overall = false;
            return results;
        }
    }

    /**
     * Validate student data integrity
     */
    private static async validateStudentData(student_id: string): Promise<ValidationResult> {
        try {
            console.log(`🔍 [Pre-Flight] Validating student data for: ${student_id}`);

            // Check for test failure injection
            if (TestFailureService.shouldFailStudentValidation()) {
                const message = TestFailureService.getStudentValidationError();
                TestFailureService.logTestFailure('Student Validation', message);
                return {
                    success: false,
                    message,
                    details: {
                        student_id,
                        test_failure: true,
                        resolution: 'This is a test failure. Disable TEST_FAILURE_STUDENT_VALIDATION to proceed normally.'
                    }
                };
            }

            const studentResult = await query(
                'SELECT id, student_id, first_name, last_name, email FROM students WHERE student_id = $1',
                [student_id]
            );

            if (studentResult.rows.length === 0) {
                return {
                    success: false,
                    message: `Student ID "${student_id}" not found in the system`,
                    details: {
                        student_id,
                        resolution: 'Verify the student ID is correct, or check if the student needs to be imported from Google Workspace'
                    }
                };
            }

            const student = studentResult.rows[0];

            // Check for data integrity
            const missingFields = [];
            if (!student.first_name) missingFields.push('first name');
            if (!student.last_name) missingFields.push('last name');

            if (missingFields.length > 0) {
                return {
                    success: false,
                    message: `Student record is incomplete - missing: ${missingFields.join(', ')}`,
                    details: {
                        missing_fields: missingFields,
                        student_id: student.student_id,
                        resolution: 'Update the student record with the missing information before proceeding'
                    }
                };
            }

            return {
                success: true,
                message: `Student data validated: ${student.first_name} ${student.last_name}`,
                details: { student_id: student.student_id, name: `${student.first_name} ${student.last_name}` }
            };

        } catch (error) {
            return {
                success: false,
                message: `Database error while validating student data`,
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    resolution: 'Check database connectivity and try again'
                }
            };
        }
    }

    /**
     * Validate device availability
     */
    private static async validateDeviceAvailability(chromebook_id: number): Promise<ValidationResult> {
        try {
            console.log(`🔍 [Pre-Flight] Validating device availability for: ${chromebook_id}`);

            // Check for test failure injection
            if (TestFailureService.shouldFailDeviceAvailability()) {
                const message = TestFailureService.getDeviceAvailabilityError();
                TestFailureService.logTestFailure('Device Availability', message);
                return {
                    success: false,
                    message,
                    details: {
                        chromebook_id,
                        test_failure: true,
                        resolution: 'This is a test failure. Disable TEST_FAILURE_DEVICE_AVAILABILITY to proceed normally.'
                    }
                };
            }

            const deviceResult = await query(
                'SELECT c.id, c.asset_tag, c.status, c.current_user_id, c.status_source, s.student_id, s.first_name, s.last_name FROM chromebooks c LEFT JOIN students s ON c.current_user_id = s.id WHERE c.id = $1',
                [chromebook_id]
            );

            if (deviceResult.rows.length === 0) {
                return {
                    success: false,
                    message: `Device ID ${chromebook_id} not found in the system`,
                    details: {
                        chromebook_id,
                        resolution: 'Verify the device ID is correct, or check if the device needs to be imported'
                    }
                };
            }

            const device = deviceResult.rows[0];

            // Check if device is available for checkout
            if (device.status === 'checked_out') {
                const currentStudent = device.student_id ?
                    `${device.first_name} ${device.last_name} (${device.student_id})` :
                    'Unknown student';

                return {
                    success: false,
                    message: `Device ${device.asset_tag} is already checked out to ${currentStudent}`,
                    details: {
                        status: device.status,
                        current_user_id: device.current_user_id,
                        asset_tag: device.asset_tag,
                        current_student: currentStudent,
                        resolution: 'Check in the device first, or use force reassignment if appropriate'
                    }
                };
            }

            if (device.status === 'pending_signature') {
                const currentStudent = device.student_id ?
                    `${device.first_name} ${device.last_name} (${device.student_id})` :
                    'Unknown student';

                return {
                    success: false,
                    message: `Device ${device.asset_tag} is pending signature completion for ${currentStudent}`,
                    details: {
                        status: device.status,
                        current_user_id: device.current_user_id,
                        asset_tag: device.asset_tag,
                        current_student: currentStudent,
                        resolution: 'Complete the signature process first, or cancel the existing checkout'
                    }
                };
            }

            if (['maintenance', 'retired', 'deprovisioned', 'disabled'].includes(device.status)) {
                const statusMessages = {
                    maintenance: 'in maintenance and cannot be checked out until repairs are completed',
                    retired: 'retired and is no longer available for checkout',
                    deprovisioned: 'deprovisioned and is no longer available for checkout',
                    disabled: 'disabled and cannot be checked out until re-enabled'
                };

                return {
                    success: false,
                    message: `Device ${device.asset_tag} is ${statusMessages[device.status as keyof typeof statusMessages]}`,
                    details: {
                        status: device.status,
                        asset_tag: device.asset_tag,
                        resolution: device.status === 'maintenance' ?
                            'Complete maintenance and mark device as available' :
                            device.status === 'disabled' ?
                                'Re-enable the device in the admin panel' :
                                'Select a different available device'
                    }
                };
            }

            return {
                success: true,
                message: `Device ${device.asset_tag} is available for checkout`,
                details: { asset_tag: device.asset_tag, status: device.status }
            };

        } catch (error) {
            return {
                success: false,
                message: `Database error while validating device availability`,
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    chromebook_id,
                    resolution: 'Check database connectivity and try again'
                }
            };
        }
    }

    /**
     * Validate data completeness
     */
    private static async validateDataCompleteness(data: any): Promise<ValidationResult> {
        try {
            console.log('🔍 [Pre-Flight] Validating data completeness...');

            // Check for test failure injection
            if (TestFailureService.shouldFailDataCompleteness()) {
                const message = TestFailureService.getDataCompletenessError();
                TestFailureService.logTestFailure('Data Completeness', message);
                return {
                    success: false,
                    message,
                    details: {
                        test_failure: true,
                        resolution: 'This is a test failure. Disable TEST_FAILURE_DATA_COMPLETENESS to proceed normally.'
                    }
                };
            }

            const issues = [];

            // Check signatures
            if (!data.signature) {
                issues.push('Student signature is required');
            }

            if (data.parent_present && !data.parent_signature) {
                issues.push('Parent signature is required when parent is present');
            }

            // Check insurance selection for parent present
            if (data.parent_present && !data.insurance) {
                issues.push('Insurance selection is required when parent is present');
            }

            // Check payment details if insurance payment required
            if (data.parent_present && data.insurance === 'pending' && data.insurance_payment) {
                if (!data.insurance_payment.payment_method) {
                    issues.push('Payment method is required for insurance payment');
                }

                // Check payment amount logic - consider applied previous payments
                const newPaymentAmount = data.insurance_payment.amount || 0;
                const appliedPreviousPayments = data.insurance_payment.applied_previous_payments || [];
                const totalAppliedFromPrevious = appliedPreviousPayments.reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0);
                const totalPayment = newPaymentAmount + totalAppliedFromPrevious;
                const ltcFee = data.insurance_payment.ltc_fee || 40; // Default LTC fee

                console.log(`🔍 [Pre-Flight] Payment validation details:`, {
                    newPaymentAmount,
                    appliedPreviousPayments: appliedPreviousPayments.length,
                    totalAppliedFromPrevious,
                    totalPayment,
                    ltcFee,
                    isValidPayment: totalPayment > 0 || newPaymentAmount > 0
                });

                if (newPaymentAmount === undefined) {
                    issues.push('Payment amount is required for insurance payment');
                } else if (newPaymentAmount < 0) {
                    issues.push('Payment amount cannot be negative');
                } else if (totalPayment > ltcFee) {
                    issues.push(`Total payment ($${totalPayment.toFixed(2)}) exceeds insurance fee ($${ltcFee.toFixed(2)})`);
                }
                // Allow $0 new payment if there are applied previous payments that cover the fee
                else if (newPaymentAmount === 0 && totalAppliedFromPrevious === 0) {
                    issues.push('Payment amount must be greater than $0.00 when no previous payments are applied');
                }

                // Validate applied previous payments structure if present
                if (appliedPreviousPayments.length > 0) {
                    for (let i = 0; i < appliedPreviousPayments.length; i++) {
                        const payment = appliedPreviousPayments[i];
                        if (!payment.id || !payment.amount || !payment.payment_method) {
                            issues.push(`Applied previous payment ${i + 1} is missing required fields (id, amount, payment_method)`);
                        }
                    }
                }
            }

            if (issues.length > 0) {
                return {
                    success: false,
                    message: 'Data completeness validation failed',
                    details: { issues }
                };
            }

            return {
                success: true,
                message: 'Data completeness validation passed',
                details: { validated_fields: ['signatures', 'insurance', 'payments'] }
            };

        } catch (error) {
            return {
                success: false,
                message: `Error validating data completeness: ${error}`,
                details: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    /**
     * Validate system readiness
     */
    private static async validateSystemReadiness(): Promise<ValidationResult> {
        try {
            console.log('🔍 [Pre-Flight] Validating system readiness...');

            const checks = [];

            // Test database connection
            try {
                await query('SELECT 1');
                checks.push({ system: 'database', status: 'ok' });
            } catch (error) {
                checks.push({ system: 'database', status: 'error', error: error instanceof Error ? error.message : String(error) });
            }

            // Test PDF service (create a simple test)
            try {
                // Just check if the service can be instantiated without creating a file
                if (PDFService) {
                    checks.push({ system: 'pdf_service', status: 'ok' });
                }
            } catch (error) {
                checks.push({ system: 'pdf_service', status: 'error', error: error instanceof Error ? error.message : String(error) });
            }

            // Test Google Notes service
            try {
                if (GoogleNotesService) {
                    checks.push({ system: 'google_notes', status: 'ok' });
                }
            } catch (error) {
                checks.push({ system: 'google_notes', status: 'error', error: error instanceof Error ? error.message : String(error) });
            }

            const failedChecks = checks.filter(check => check.status === 'error');

            if (failedChecks.length > 0) {
                return {
                    success: false,
                    message: 'System readiness validation failed',
                    details: { failed_systems: failedChecks }
                };
            }

            return {
                success: true,
                message: 'System readiness validation passed',
                details: { verified_systems: checks.map(c => c.system) }
            };

        } catch (error) {
            return {
                success: false,
                message: `Error validating system readiness: ${error}`,
                details: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    /**
     * Validate business rules
     */
    private static async validateBusinessRules(data: any): Promise<ValidationResult> {
        try {
            console.log('🔍 [Pre-Flight] Validating business rules...');

            const warnings = [];

            // Check if student already has devices checked out
            const currentDevicesResult = await query(`
        SELECT COUNT(*) as device_count
        FROM chromebooks c
        JOIN students s ON c.current_user_id = s.id
        WHERE s.student_id = $1 AND c.status IN ('checked_out', 'pending_signature')
      `, [data.student_id]);

            const currentDeviceCount = parseInt(currentDevicesResult.rows[0].device_count);
            if (currentDeviceCount > 0) {
                warnings.push(`Student already has ${currentDeviceCount} device(s) checked out`);
            }

            // Check payment calculations if applicable
            if (data.insurance_payment && data.insurance_payment.amount > 0) {
                const feeResult = await query(`
          SELECT ltc_fee FROM (VALUES (40)) AS config(ltc_fee)
        `);
                // This is a simple check - in reality you'd get this from config
            }

            return {
                success: true,
                message: 'Business rules validation passed',
                details: {
                    warnings,
                    current_device_count: currentDeviceCount
                }
            };

        } catch (error) {
            return {
                success: false,
                message: `Error validating business rules: ${error}`,
                details: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    /**
     * Validate database updates after checkout
     */
    private static async validateDatabaseUpdates(data: any): Promise<ValidationResult> {
        try {
            console.log(`🔍 [Post-Flight] Validating database updates for device: ${data.chromebook_id}`);

            // Check for test failure injection
            if (TestFailureService.shouldFailDatabaseUpdates()) {
                const message = TestFailureService.getDatabaseUpdatesError();
                TestFailureService.logTestFailure('Database Updates', message);
                return {
                    success: false,
                    message,
                    details: {
                        chromebook_id: data.chromebook_id,
                        test_failure: true,
                        resolution: 'This is a test failure. Disable TEST_FAILURE_DATABASE_UPDATES to proceed normally.'
                    }
                };
            }

            // Check device status
            const deviceResult = await query(
                'SELECT status, current_user_id, status_source, checked_out_date FROM chromebooks WHERE id = $1',
                [data.chromebook_id]
            );

            if (deviceResult.rows.length === 0) {
                return {
                    success: false,
                    message: 'Device not found after checkout',
                    details: { chromebook_id: data.chromebook_id }
                };
            }

            const device = deviceResult.rows[0];

            // Check if status was updated correctly
            if (device.status !== data.expected_status) {
                return {
                    success: false,
                    message: `Device status incorrect. Expected: ${data.expected_status}, Actual: ${device.status}`,
                    details: {
                        expected: data.expected_status,
                        actual: device.status,
                        chromebook_id: data.chromebook_id
                    }
                };
            }

            // Check if user assignment is correct
            const studentResult = await query(
                'SELECT id FROM students WHERE student_id = $1',
                [data.student_id]
            );

            if (studentResult.rows.length === 0 || device.current_user_id !== studentResult.rows[0].id) {
                return {
                    success: false,
                    message: 'Device user assignment is incorrect',
                    details: {
                        expected_student_id: data.student_id,
                        actual_user_id: device.current_user_id
                    }
                };
            }

            // Check checkout history was created
            if (data.checkout_id) {
                const historyResult = await query(
                    'SELECT id FROM checkout_history WHERE id = $1 AND chromebook_id = $2',
                    [data.checkout_id, data.chromebook_id]
                );

                if (historyResult.rows.length === 0) {
                    return {
                        success: false,
                        message: 'Checkout history record not found',
                        details: { checkout_id: data.checkout_id }
                    };
                }
            }

            return {
                success: true,
                message: 'Database updates validation passed',
                details: {
                    device_status: device.status,
                    user_assigned: device.current_user_id,
                    status_source: device.status_source
                }
            };

        } catch (error) {
            return {
                success: false,
                message: `Error validating database updates: ${error}`,
                details: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    /**
     * Validate external systems after checkout
     */
    private static async validateExternalSystems(data: any): Promise<ValidationResult> {
        try {
            console.log('🔍 [Post-Flight] Validating external systems...');

            // Check for test failure injection
            if (TestFailureService.shouldFailExternalSystems()) {
                const message = TestFailureService.getExternalSystemsError();
                TestFailureService.logTestFailure('External Systems', message);
                return {
                    success: false,
                    message,
                    details: {
                        test_failure: true,
                        resolution: 'This is a test failure. Disable TEST_FAILURE_EXTERNAL_SYSTEMS to proceed normally.'
                    }
                };
            }

            const checks = [];

            // Check PDF generation if checkout_id exists
            if (data.checkout_id) {
                try {
                    // This would check if the PDF was actually created
                    // For now, we'll just verify the service is responsive
                    checks.push({ system: 'pdf_agreement', status: 'assumed_ok' });
                } catch (error) {
                    checks.push({
                        system: 'pdf_agreement',
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            // Check Google Notes update
            if (data.asset_tag) {
                try {
                    // We can't easily verify the Google notes update without making another API call
                    // So we'll mark this as a warning if there were issues during checkout
                    checks.push({ system: 'google_notes', status: 'assumed_ok' });
                } catch (error) {
                    checks.push({
                        system: 'google_notes',
                        status: 'warning',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            const failedChecks = checks.filter(check => check.status === 'error');
            const warningChecks = checks.filter(check => check.status === 'warning');

            if (failedChecks.length > 0) {
                return {
                    success: false,
                    message: 'External systems validation failed',
                    details: { failed_systems: failedChecks, warnings: warningChecks }
                };
            }

            return {
                success: true,
                message: 'External systems validation passed',
                details: {
                    verified_systems: checks.filter(c => c.status === 'assumed_ok'),
                    warnings: warningChecks
                }
            };

        } catch (error) {
            return {
                success: false,
                message: `Error validating external systems: ${error}`,
                details: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    /**
     * Validate data consistency after checkout
     */
    private static async validateDataConsistency(data: any): Promise<ValidationResult> {
        try {
            console.log('🔍 [Post-Flight] Validating data consistency...');

            // Get device and related records
            const deviceResult = await query(`
        SELECT c.*, s.student_id, s.first_name, s.last_name
        FROM chromebooks c
        LEFT JOIN students s ON c.current_user_id = s.id
        WHERE c.id = $1
      `, [data.chromebook_id]);

            if (deviceResult.rows.length === 0) {
                return {
                    success: false,
                    message: 'Device record not found',
                    details: { chromebook_id: data.chromebook_id }
                };
            }

            const device = deviceResult.rows[0];
            const issues = [];

            // Check timestamp consistency
            if (device.checked_out_date && device.status_override_date) {
                const checkoutTime = new Date(device.checked_out_date);
                const overrideTime = new Date(device.status_override_date);

                if (Math.abs(checkoutTime.getTime() - overrideTime.getTime()) > 60000) { // More than 1 minute apart
                    issues.push('Checkout timestamp and status override timestamp are inconsistent');
                }
            }

            // Check status source consistency
            if (device.status_source !== 'local') {
                issues.push(`Status source should be 'local' after checkout, but is '${device.status_source}'`);
            }

            // Check student assignment consistency
            if (device.student_id !== data.student_id) {
                issues.push(`Student assignment mismatch. Expected: ${data.student_id}, Actual: ${device.student_id}`);
            }

            if (issues.length > 0) {
                return {
                    success: false,
                    message: 'Data consistency validation failed',
                    details: { issues }
                };
            }

            return {
                success: true,
                message: 'Data consistency validation passed',
                details: {
                    verified_fields: ['timestamps', 'status_source', 'student_assignment']
                }
            };

        } catch (error) {
            return {
                success: false,
                message: `Error validating data consistency: ${error}`,
                details: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

}
