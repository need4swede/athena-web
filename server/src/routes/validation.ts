import { Router } from 'express';
import { CheckoutValidationService } from '../services/checkoutValidationService';
import { authenticateToken } from '../middleware/auth';
import { TestFailureService } from '../utils/testFailures';
import { SandboxStore } from '../services/sandboxStore';

const router = Router();

/**
 * Pre-flight validation endpoint
 * Validates all requirements before checkout execution
 */
router.post('/checkout/pre-flight', authenticateToken, async (req, res) => {
    try {
        console.log('🔍 [API] Pre-flight validation requested');

        const { chromebook_id, student_id, parent_present, signature, parent_signature, insurance, insurance_payment } = req.body;

        // Validate required fields
        if (!chromebook_id || !student_id || parent_present === undefined) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: chromebook_id, student_id, parent_present'
            });
            return;
        }

        // Run pre-flight checks
        const results = await CheckoutValidationService.runPreFlightChecks({
            chromebook_id: parseInt(chromebook_id),
            student_id,
            parent_present,
            signature,
            parent_signature,
            insurance,
            insurance_payment
        });

        console.log(`📊 [API] Pre-flight validation ${results.overall ? 'PASSED' : 'FAILED'}`);

        return res.json({
            success: true,
            results,
            message: results.overall ? 'All pre-flight checks passed' : 'Some pre-flight checks failed'
        });

    } catch (error) {
        console.error('❌ [API] Pre-flight validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during pre-flight validation',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * Post-flight validation endpoint
 * Validates checkout results and corrects issues if needed
 */
router.post('/checkout/post-flight', authenticateToken, async (req: any, res) => {
    try {
        console.log('🔍 [API] Post-flight validation requested');

        const { chromebook_id, student_id, expected_status, checkout_id, asset_tag } = req.body;

        // Validate required fields
        if (!chromebook_id || !student_id || !expected_status) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: chromebook_id, student_id, expected_status'
            });
            return;
        }

        // Sandbox: short-circuit with simulated success
        const inSandbox = !!(req as any).sandbox || (req.user?.id && SandboxStore.isActive(req.user.id));
        if (inSandbox) {
            const results = {
                databaseUpdates: {
                    success: true,
                    message: 'Sandbox: Skipped DB write verification',
                    details: {
                        device_status: expected_status,
                        user_assigned: 'simulated',
                        status_source: 'local'
                    }
                },
                externalSystems: {
                    success: true,
                    message: 'Sandbox: External systems assumed OK',
                    details: {
                        verified_systems: [{ system: 'pdf_agreement', status: 'assumed_ok' }, { system: 'google_notes', status: 'assumed_ok' }],
                        warnings: []
                    }
                },
                dataConsistency: {
                    success: true,
                    message: 'Sandbox: Data consistency assumed',
                    details: { verified_fields: ['timestamps', 'status_source', 'student_assignment'] }
                },
                overall: true
            } as const;
            return res.json({ success: true, results, message: 'Sandbox validation passed' });
        }

        // Run post-flight checks
        const results = await CheckoutValidationService.runPostFlightChecks({
            chromebook_id: parseInt(chromebook_id),
            student_id,
            expected_status,
            checkout_id: checkout_id ? parseInt(checkout_id) : undefined,
            asset_tag
        });

        console.log(`📊 [API] Post-flight validation ${results.overall ? 'PASSED' : 'FAILED'}`);

        return res.json({
            success: true,
            results,
            message: results.overall ? 'All post-flight checks passed' : 'Some post-flight checks failed'
        });

    } catch (error) {
        console.error('❌ [API] Post-flight validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during post-flight validation',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * Combined validation endpoint for comprehensive checkout validation
 */
router.post('/checkout/validate-complete', authenticateToken, async (req: any, res) => {
    try {
        console.log('🔍 [API] Complete checkout validation requested');

        const {
            chromebook_id,
            student_id,
            parent_present,
            signature,
            parent_signature,
            insurance,
            insurance_payment,
            expected_status,
            checkout_id,
            asset_tag
        } = req.body;

        // Run pre-flight checks first
        const preFlightResults = await CheckoutValidationService.runPreFlightChecks({
            chromebook_id: parseInt(chromebook_id),
            student_id,
            parent_present,
            signature,
            parent_signature,
            insurance,
            insurance_payment
        });

        // If pre-flight fails, return early
        if (!preFlightResults.overall) {
            return res.json({
                success: false,
                phase: 'pre-flight',
                results: { preFlightResults },
                message: 'Pre-flight validation failed - checkout should not proceed'
            });
        }

        // Run post-flight checks if expected_status is provided
        let postFlightResults = null;
        if (expected_status) {
            const inSandbox2 = !!(req as any).sandbox || (req.user?.id && SandboxStore.isActive(req.user.id));
            if (inSandbox2) {
                postFlightResults = {
                    databaseUpdates: {
                        success: true,
                        message: 'Sandbox: Skipped DB write verification',
                        details: {
                            device_status: expected_status,
                            user_assigned: 'simulated',
                            status_source: 'local'
                        }
                    },
                    externalSystems: {
                        success: true,
                        message: 'Sandbox: External systems assumed OK',
                        details: {
                            verified_systems: [{ system: 'pdf_agreement', status: 'assumed_ok' }, { system: 'google_notes', status: 'assumed_ok' }],
                            warnings: []
                        }
                    },
                    dataConsistency: {
                        success: true,
                        message: 'Sandbox: Data consistency assumed',
                        details: { verified_fields: ['timestamps', 'status_source', 'student_assignment'] }
                    },
                    overall: true
                } as const;
            } else {
                postFlightResults = await CheckoutValidationService.runPostFlightChecks({
                    chromebook_id: parseInt(chromebook_id),
                    student_id,
                    expected_status,
                    checkout_id: checkout_id ? parseInt(checkout_id) : undefined,
                    asset_tag
                });
            }
        }

        const overallSuccess = preFlightResults.overall && (!postFlightResults || postFlightResults.overall);

        console.log(`📊 [API] Complete validation ${overallSuccess ? 'PASSED' : 'FAILED'}`);

        return res.json({
            success: overallSuccess,
            phase: postFlightResults ? 'complete' : 'pre-flight-only',
            results: {
                preFlightResults,
                postFlightResults
            },
            message: overallSuccess ? 'All validation checks passed' : 'Some validation checks failed'
        });

    } catch (error) {
        console.error('❌ [API] Complete validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during complete validation',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router;
