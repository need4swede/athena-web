/**
 * Test Failure Injection Utility
 *
 * This utility provides controlled failure injection for testing validation flows.
 * All failures are controlled via environment variables and only work when TEST_FAILURES_ENABLED=true.
 */

export interface TestFailureConfig {
    enabled: boolean;
    deviceAvailability: boolean;
    studentValidation: boolean;
    dataCompleteness: boolean;
    processingCheckout: boolean;
    updatingStatus: boolean;
    externalSystems: boolean;
    databaseUpdates: boolean;
    postFlight: boolean;
}

export class TestFailureService {
    private static config: TestFailureConfig;

    static initialize() {
        this.config = {
            enabled: process.env.TEST_FAILURES_ENABLED === 'true',
            deviceAvailability: process.env.TEST_FAILURE_DEVICE_AVAILABILITY === 'true',
            studentValidation: process.env.TEST_FAILURE_STUDENT_VALIDATION === 'true',
            dataCompleteness: process.env.TEST_FAILURE_DATA_COMPLETENESS === 'true',
            processingCheckout: process.env.TEST_FAILURE_PROCESSING_CHECKOUT === 'true',
            updatingStatus: process.env.TEST_FAILURE_UPDATING_STATUS === 'true',
            externalSystems: process.env.TEST_FAILURE_EXTERNAL_SYSTEMS === 'true',
            databaseUpdates: process.env.TEST_FAILURE_DATABASE_UPDATES === 'true',
            postFlight: process.env.TEST_FAILURE_POST_FLIGHT === 'true',
        };

        if (this.config.enabled) {
            console.log('🧪 [TEST] Test failure injection is ENABLED');
            console.log('🧪 [TEST] Active failure modes:', {
                deviceAvailability: this.config.deviceAvailability,
                studentValidation: this.config.studentValidation,
                dataCompleteness: this.config.dataCompleteness,
                processingCheckout: this.config.processingCheckout,
                updatingStatus: this.config.updatingStatus,
                externalSystems: this.config.externalSystems,
                databaseUpdates: this.config.databaseUpdates,
                postFlight: this.config.postFlight,
            });
        }
    }

    static shouldFailDeviceAvailability(): boolean {
        return this.config?.enabled && this.config.deviceAvailability;
    }

    static shouldFailStudentValidation(): boolean {
        return this.config?.enabled && this.config.studentValidation;
    }

    static shouldFailDataCompleteness(): boolean {
        return this.config?.enabled && this.config.dataCompleteness;
    }

    static shouldFailProcessingCheckout(): boolean {
        return this.config?.enabled && this.config.processingCheckout;
    }

    static shouldFailUpdatingStatus(): boolean {
        return this.config?.enabled && this.config.updatingStatus;
    }

    static shouldFailExternalSystems(): boolean {
        return this.config?.enabled && this.config.externalSystems;
    }

    static shouldFailDatabaseUpdates(): boolean {
        return this.config?.enabled && this.config.databaseUpdates;
    }

    static shouldFailPostFlight(): boolean {
        return this.config?.enabled && this.config.postFlight;
    }

    static getDeviceAvailabilityError(): string {
        return 'Test failure: Device availability check failed. The selected device appears to be unavailable due to a simulated system error.';
    }

    static getStudentValidationError(): string {
        return 'Test failure: Student validation failed. Student information could not be verified against external systems.';
    }

    static getDataCompletenessError(): string {
        return 'Test failure: Data completeness validation failed. Required signatures or data elements are missing or invalid.';
    }

    static getProcessingCheckoutError(): string {
        return 'Test failure: Checkout processing failed. The system encountered an error while creating the checkout record in the database.';
    }

    static getUpdatingStatusError(): string {
        return 'Test failure: Device status update failed. The device status could not be updated to reflect the checkout state.';
    }

    static getExternalSystemsError(): string {
        return 'Test failure: External system integration failed. Google Admin API or other external services are not responding properly.';
    }

    static getDatabaseUpdatesError(): string {
        return 'Test failure: Database update consistency check failed. The checkout was created but subsequent validation detected data inconsistencies.';
    }

    static getPostFlightError(): string {
        return 'Test failure: Post-flight validation failed. The checkout completed but verification checks detected issues with the final state.';
    }

    static createValidationError(type: string, message: string) {
        return {
            success: false,
            message,
            validation_results: {
                databaseUpdates: type === 'database' ? { success: false, message } : { success: true, message: 'Database updates successful' },
                externalSystems: type === 'external' ? { success: false, message } : { success: true, message: 'External systems responding' },
                dataConsistency: type === 'consistency' ? { success: false, message } : { success: true, message: 'Data consistency verified' },
            },
            failed_checks: [message],
        };
    }

    static logTestFailure(failureType: string, message: string) {
        console.log(`🧪 [TEST FAILURE] ${failureType}: ${message}`);
    }
}

// Initialize the service when the module is loaded
TestFailureService.initialize();
