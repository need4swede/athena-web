import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { GranularCheckoutService } from '../services/granularCheckoutService';
import { authenticateToken } from '../middleware/auth';
import { query } from '../database';
import { SandboxStore } from '../services/sandboxStore';
import { SandboxOverlay } from '../services/sandboxOverlay';
import { PDFService } from '../services/pdfService';
import path from 'path';
// (imports consolidated above)

const router = express.Router();

const SANDBOX_STEPS = [
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

// Start a new granular checkout session
router.post('/sessions', [
    body('chromebook_id').custom((value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
            throw new Error('chromebook_id must be a positive integer');
        }
        return true;
    }),
    body('student_id').isString().trim().isLength({ min: 1 }),
    body('notes').optional({ nullable: true }).isString(),
    body('insurance').optional({ nullable: true }).isString(),
    body('agreement_type').optional().isString(),
    body('force_reassign').optional().isBoolean(),
    body('signature').optional({ nullable: true }).isString(),
    body('parent_signature').optional({ nullable: true }).isString(),
    body('parent_present').isBoolean(),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [Granular Checkout] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        // Check if user has permission to checkout devices (only regular users are restricted)
        if (req.user.role === 'user') {
            return res.status(403).json({
                error: 'Checkout access denied',
                message: 'Only admins and super admins can check out devices'
            });
        }

        const sessionData = {
            chromebook_id: parseInt(req.body.chromebook_id),
            student_id: req.body.student_id,
            user_id: req.user.id,
            notes: req.body.notes,
            signature: req.body.signature,
            parent_signature: req.body.parent_signature,
            parent_present: req.body.parent_present || false,
            insurance: req.body.insurance,
            insurance_payment: req.body.insurance_payment,
            agreement_type: req.body.agreement_type,
            force_reassign: req.body.force_reassign || false
        };

        console.log(`🚀 [Granular Checkout API] Starting session for device ${sessionData.chromebook_id} and student ${sessionData.student_id}`);

        // Sandbox: simulate session without DB writes
        if (SandboxStore.isActive(req.user.id)) {
            const sessionId = `SBX_CO_${Math.random().toString(36).slice(2, 10)}`;
            SandboxOverlay.recordCheckoutStart(req.user.id, sessionId, sessionData);
            return res.status(201).json({ message: 'Checkout session started (sandbox)', sessionId, status: 'in_progress' });
        }

        const result = await GranularCheckoutService.startCheckoutSession(sessionData);

        res.status(201).json({
            message: 'Checkout session started',
            sessionId: result.sessionId,
            status: 'in_progress'
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error starting session:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to start checkout session'
        });
    }
});

// Get session status
router.get('/sessions/:sessionId/status', [
    param('sessionId').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const sessionId = req.params.sessionId;
        if (SandboxStore.isActive(req.user.id) && sessionId.startsWith('SBX_CO_')) {
            return res.json({
                sessionId,
                overallStatus: 'completed',
                currentStep: null,
                steps: SANDBOX_STEPS.map(name => ({ name, status: 'completed', retryCount: 0, canRetry: false })),
            });
        }
        const status = await GranularCheckoutService.getSessionStatus(sessionId);

        if (!status) {
            return res.status(404).json({
                error: 'Session not found',
                message: 'No checkout session found with the given ID'
            });
        }

        res.json(status);

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error getting session status:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to get session status'
        });
    }
});

// Execute next step in checkout
router.post('/sessions/:sessionId/next-step', [
    param('sessionId').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const sessionId = req.params.sessionId;
        console.log(`🔄 [Granular Checkout API] Executing next step for session: ${sessionId}`);

        if (SandboxStore.isActive(req.user.id)) {
            return res.json({
                success: true,
                stepResult: { success: true, step: 'simulated', message: 'Sandbox step executed' },
                sessionStatus: {
                    sessionId,
                    overallStatus: 'in_progress',
                    currentStep: 'simulated',
                    steps: SANDBOX_STEPS.map((name, idx) => ({ name, status: idx < 3 ? 'completed' : 'pending', retryCount: 0, canRetry: true })),
                }
            });
        }
        const result = await GranularCheckoutService.executeNextStep(sessionId);

        if (!result.success) {
            return res.status(400).json({
                error: 'Step execution failed',
                message: result.error,
                sessionId
            });
        }

        // Get updated status to return
        const status = await GranularCheckoutService.getSessionStatus(sessionId);

        res.json({
            success: true,
            stepResult: result,
            sessionStatus: status
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error executing next step:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to execute next step'
        });
    }
});

// Retry a specific step
router.post('/sessions/:sessionId/retry/:stepName', [
    param('sessionId').isString().trim().isLength({ min: 1 }),
    param('stepName').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { sessionId, stepName } = req.params;
        console.log(`🔄 [Granular Checkout API] Retrying step ${stepName} for session: ${sessionId}`);

        if (SandboxStore.isActive(req.user.id)) {
            return res.json({
                success: true,
                stepResult: { success: true, step: stepName, message: 'Sandbox retry executed' },
                sessionStatus: {
                    sessionId,
                    overallStatus: 'in_progress',
                    currentStep: stepName,
                    steps: SANDBOX_STEPS.map((name) => ({ name, status: name === stepName ? 'completed' : 'pending', retryCount: 0, canRetry: true })),
                }
            });
        }
        const result = await GranularCheckoutService.retryStep(sessionId, stepName);

        if (!result.success) {
            return res.status(400).json({
                error: 'Step retry failed',
                message: result.error,
                sessionId,
                stepName
            });
        }

        // Get updated status to return
        const status = await GranularCheckoutService.getSessionStatus(sessionId);

        res.json({
            success: true,
            stepResult: result,
            sessionStatus: status
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error retrying step:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retry step'
        });
    }
});

// Process all remaining steps
router.post('/sessions/:sessionId/process-all', [
    param('sessionId').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const sessionId = req.params.sessionId;
        console.log(`🔄 [Granular Checkout API] Processing all steps for session: ${sessionId}`);

        if (SandboxStore.isActive(req.user.id)) {
            const finalStatus = {
                sessionId,
                overallStatus: 'completed',
                currentStep: null,
                steps: SANDBOX_STEPS.map(name => ({ name, status: 'completed', retryCount: 0, canRetry: false })),
                checkoutId: Math.floor(Math.random() * 100000) // synthetic id so FE can proceed
            };
            SandboxOverlay.recordCheckoutComplete(req.user.id, sessionId, finalStatus);
            return res.json({ success: true, message: 'All steps processed (sandbox)', sessionStatus: finalStatus });
        }
        const finalStatus = await GranularCheckoutService.processAllSteps(sessionId);

        if (!finalStatus) {
            return res.status(404).json({
                error: 'Session not found',
                message: 'No checkout session found with the given ID'
            });
        }

        res.json({
            success: true,
            message: 'All steps processed',
            sessionStatus: finalStatus
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error processing all steps:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process all steps'
        });
    }
});

// Cancel a checkout session
router.post('/sessions/:sessionId/cancel', [
    param('sessionId').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const sessionId = req.params.sessionId;
        console.log(`🚫 [Granular Checkout API] Cancelling session: ${sessionId}`);

        if (SandboxStore.isActive(req.user.id)) {
            return res.json({ success: true, message: 'Checkout session cancelled (sandbox)', sessionId });
        }
        await GranularCheckoutService.cancelSession(sessionId);

        res.json({
            success: true,
            message: 'Checkout session cancelled',
            sessionId
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error cancelling session:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to cancel session'
        });
    }
});

// Get all active sessions
router.get('/sessions/active', [
    authenticateToken
], async (req: any, res: any) => {
    try {
        const activeSessions = await GranularCheckoutService.getActiveSessions();

        res.json({
            activeSessions,
            totalCount: activeSessions.length
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error getting active sessions:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to get active sessions'
        });
    }
});

// Get PDF for a completed checkout (from session)
router.get('/sessions/:sessionId/agreement', [
    param('sessionId').isString().trim().isLength({ min: 1 }),
    // Custom middleware to handle token from query parameter or header
    (req: any, res: any, next: any) => {
        // Check if token is in query parameter
        if (req.query.token && !req.headers.authorization) {
            req.headers.authorization = `Bearer ${req.query.token}`;
        }
        authenticateToken(req, res, next);
    }
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const sessionId = req.params.sessionId;
        // Sandbox: generate agreement from overlay session data
        if ((req as any).sandbox || (req.user?.id && SandboxStore.isActive(req.user.id))) {
            const snap = SandboxOverlay.getCheckoutSession(req.user.id, sessionId);
            if (!snap || !snap.sessionData) {
                return res.status(404).json({ error: 'Agreement not available', message: 'Sandbox session not found' });
            }
            const sess = snap.sessionData;
            // Look up details (reads allowed in sandbox)
            const deviceResult = await query('SELECT asset_tag, serial_number FROM chromebooks WHERE id = $1', [sess.chromebook_id]);
            const studentResult = await query('SELECT first_name, last_name, student_id FROM students WHERE student_id = $1', [sess.student_id]);
            if (deviceResult.rows.length === 0 || studentResult.rows.length === 0) {
                return res.status(404).json({ error: 'Not Found', message: 'Device or student not found for sandbox session' });
            }
            const device = deviceResult.rows[0];
            const student = studentResult.rows[0];
            const agreementData = {
                studentName: `${student.first_name} ${student.last_name}`,
                studentId: student.student_id,
                deviceSerial: device.serial_number,
                deviceAssetTag: device.asset_tag,
                isInsured: (sess.insurance === 'insured'),
                checkoutDate: new Date(),
                signature: sess.signature,
                parentSignature: sess.parent_signature,
            };
            const pdfBuffer = await PDFService.generateCheckoutAgreementBuffer(agreementData, { sandbox: true });
            const baseFilename = PDFService.generateFilename(agreementData).replace('.pdf', '_SBX.pdf');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}"`);
            return res.send(pdfBuffer);
        }

        // Get session status to find checkout ID (non-sandbox)
        const status = await GranularCheckoutService.getSessionStatus(sessionId);
        if (!status || !status.checkoutId) {
            return res.status(404).json({
                error: 'Agreement not available',
                message: 'Checkout session not found or agreement not yet generated'
            });
        }
        return res.redirect(`/api/checkouts/${status.checkoutId}/agreement${req.query.token ? `?token=${req.query.token}` : ''}`);

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error getting session agreement:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to get agreement PDF'
        });
    }
});

// Dashboard routes for modals

// Get all active checkouts
router.get('/active', authenticateToken, async (req: any, res: any) => {
    try {
        const activeCheckoutsResult = await query(`
            SELECT
                c.id as chromebook_id,
                c.asset_tag,
                c.serial_number,
                c.model,
                c.checked_out_date,
                c.is_insured,
                c.insurance_status,
                ch.insurance,
                s.student_id,
                s.first_name,
                s.last_name,
                s.email as student_email,
                u.name as checked_out_by_name,
                u.email as checked_out_by_email,
                ch.id as checkout_id
            FROM chromebooks c
            JOIN students s ON c.current_user_id = s.id
            LEFT JOIN checkout_history ch ON ch.chromebook_id = c.id AND ch.action = 'checkout' AND ch.action_date = (
                SELECT MAX(action_date) FROM checkout_history WHERE chromebook_id = c.id AND action = 'checkout'
            )
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE c.status = 'checked_out'
            ORDER BY c.checked_out_date DESC
        `);

        const activeCheckouts = activeCheckoutsResult.rows.map(row => ({
            id: row.checkout_id,
            chromebook: {
                id: row.chromebook_id,
                assetTag: row.asset_tag,
                serialNumber: row.serial_number,
                model: row.model,
                checkedOutDate: row.checked_out_date,
                isInsured: row.is_insured,
                insurance: row.insurance_status || row.insurance
            },
            student: {
                studentId: row.student_id,
                firstName: row.first_name,
                lastName: row.last_name,
                email: row.student_email
            },
            checkedOutBy: {
                name: row.checked_out_by_name,
                email: row.checked_out_by_email
            }
        }));

        res.json({ activeCheckouts });

    } catch (error) {
        console.error('❌ [Get Active Checkouts] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch active checkouts'
        });
    }
});

// Get all insured devices
router.get('/insured', authenticateToken, async (req: any, res: any) => {
    try {
        const insuredDevicesResult = await query(`
            SELECT
                c.id as chromebook_id,
                c.asset_tag,
                c.serial_number,
                c.model,
                c.checked_out_date,
                c.is_insured,
                c.insurance_status,
                ch.insurance,
                s.student_id,
                s.first_name,
                s.last_name,
                s.email as student_email,
                u.name as checked_out_by_name,
                u.email as checked_out_by_email,
                ch.id as checkout_id
            FROM chromebooks c
            JOIN students s ON c.current_user_id = s.id
            LEFT JOIN checkout_history ch ON ch.chromebook_id = c.id AND ch.action = 'checkout' AND ch.action_date = (
                SELECT MAX(action_date) FROM checkout_history WHERE chromebook_id = c.id AND action = 'checkout'
            )
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE c.status IN ('checked_out', 'pending_signature')
            AND (c.insurance_status = 'insured' OR c.insurance_status = 'pending' OR ch.insurance = 'insured' OR ch.insurance = 'pending')
            ORDER BY c.checked_out_date DESC
        `);

        const insuredDevices = insuredDevicesResult.rows.map(row => ({
            id: row.checkout_id,
            chromebook: {
                id: row.chromebook_id,
                assetTag: row.asset_tag,
                serialNumber: row.serial_number,
                model: row.model,
                checkedOutDate: row.checked_out_date,
                isInsured: row.is_insured,
                insurance: row.insurance_status || row.insurance
            },
            student: {
                studentId: row.student_id,
                firstName: row.first_name,
                lastName: row.last_name,
                email: row.student_email
            },
            checkedOutBy: {
                name: row.checked_out_by_name,
                email: row.checked_out_by_email
            }
        }));

        res.json({ insuredDevices });

    } catch (error) {
        console.error('❌ [Get Insured Devices] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch insured devices'
        });
    }
});

// Get all pending checkouts
router.get('/pending', authenticateToken, async (req: any, res: any) => {
    try {
        const pendingCheckoutsResult = await query(`
            SELECT
                c.id as chromebook_id,
                c.asset_tag,
                c.serial_number,
                c.model,
                c.checked_out_date,
                ch.insurance,
                s.student_id,
                s.first_name,
                s.last_name,
                s.email as student_email,
                u.name as checked_out_by_name,
                u.email as checked_out_by_email,
                ch.id as checkout_id
            FROM chromebooks c
            JOIN students s ON c.current_user_id = s.id
            LEFT JOIN checkout_history ch ON ch.chromebook_id = c.id AND ch.action = 'checkout' AND ch.action_date = (
                SELECT MAX(action_date) FROM checkout_history WHERE chromebook_id = c.id AND action = 'checkout'
            )
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE c.status = 'pending_signature'
            ORDER BY c.checked_out_date DESC
        `);

        const pendingCheckouts = pendingCheckoutsResult.rows.map(row => ({
            id: row.checkout_id,
            chromebook: {
                id: row.chromebook_id,
                assetTag: row.asset_tag,
                serialNumber: row.serial_number,
                model: row.model,
                checkedOutDate: row.checked_out_date,
                insurance: row.insurance
            },
            student: {
                studentId: row.student_id,
                firstName: row.first_name,
                lastName: row.last_name,
                email: row.student_email
            },
            checkedOutBy: {
                name: row.checked_out_by_name,
                email: row.checked_out_by_email
            }
        }));

        res.json({ pendingCheckouts });

    } catch (error) {
        console.error('❌ [Get Pending Checkouts] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch pending checkouts'
        });
    }
});

// Legacy compatibility routes

// Get fees configuration
router.get('/config/fees', [
    authenticateToken
], async (req: any, res: any) => {
    try {
        // Return the LTC fee configuration
        const ltcFee = process.env.LTC_FEE ? parseInt(process.env.LTC_FEE) : 40;

        res.json({
            ltcFee: ltcFee
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error getting fees config:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to get fees configuration'
        });
    }
});

// Get student's current devices
router.get('/student/:studentId/current-devices', [
    param('studentId').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { studentId } = req.params;

        // Get student's current checked out devices
        const result = await query(`
            SELECT
                c.id,
                c.asset_tag as "assetTag",
                c.serial_number as "serialNumber",
                c.model,
                c.status,
                ch.action_date as "checkedOutDate",
                ch.insurance as "insuranceStatus",
                c.is_insured,
                c.insurance_status
            FROM chromebooks c
            INNER JOIN checkout_history ch ON c.id = ch.chromebook_id
            INNER JOIN students s ON ch.student_id = s.id
            WHERE s.student_id = $1
            AND c.status IN ('checked_out', 'pending_signature')
            AND ch.action = 'checkout'
            AND NOT EXISTS (
                SELECT 1 FROM checkout_history ch2
                WHERE ch2.chromebook_id = ch.chromebook_id
                AND ch2.action = 'checkin'
                AND ch2.action_date > ch.action_date
            )
            ORDER BY ch.action_date DESC
        `, [studentId]);

        res.json({
            devices: result.rows || []
        });

    } catch (error) {
        console.error('❌ [Granular Checkout API] Error getting student current devices:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to get student current devices'
        });
    }
});

// Get agreement PDF for a checkout ID (legacy compatibility)
router.get('/:checkoutId/agreement', [
    param('checkoutId').isNumeric(),
    // Custom middleware to handle token from query parameter or header
    (req: any, res: any, next: any) => {
        // Check if token is in query parameter
        if (req.query.token && !req.headers.authorization) {
            req.headers.authorization = `Bearer ${req.query.token}`;
        }
        authenticateToken(req, res, next);
    }
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const checkoutId = parseInt(req.params.checkoutId);

        // If sandbox: try to fetch data and generate buffer with watermark
        if ((req as any).sandbox || (req.user?.id && SandboxStore.isActive(req.user.id))) {
            const checkoutResult = await query(`
                SELECT
                    ch.signature,
                    ch.parent_signature,
                    ch.action_date as checked_out_date,
                    ch.insurance,
                    c.asset_tag,
                    c.serial_number,
                    s.student_id,
                    s.first_name,
                    s.last_name
                FROM checkout_history ch
                JOIN chromebooks c ON ch.chromebook_id = c.id
                JOIN students s ON ch.student_id = s.id
                WHERE ch.id = $1 AND ch.action = 'checkout'
            `, [checkoutId]);
            if (checkoutResult.rows.length === 0) {
                // If no DB record (likely sandbox-only flow), fall back to 404
                return res.status(404).json({ error: 'Agreement not available', message: 'Checkout not found (sandbox)' });
            }
            const checkout = checkoutResult.rows[0];
            const agreementData = {
                studentName: `${checkout.first_name} ${checkout.last_name}`,
                studentId: checkout.student_id,
                deviceSerial: checkout.serial_number,
                deviceAssetTag: checkout.asset_tag,
                isInsured: checkout.insurance === 'insured',
                checkoutDate: new Date(checkout.checked_out_date),
                signature: checkout.signature,
                parentSignature: checkout.parent_signature,
            };
            const pdfBuffer = await PDFService.generateCheckoutAgreementBuffer(agreementData, { sandbox: true });
            const baseFilename = PDFService.generateFilename(agreementData).replace('.pdf', '_SBX.pdf');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${baseFilename}"`);
            return res.send(pdfBuffer);
        }

        // Get checkout details
        const checkoutResult = await query(`
            SELECT
                ch.id,
                ch.signature,
                ch.parent_signature,
                ch.action_date as checked_out_date,
                ch.insurance,
                c.asset_tag,
                c.serial_number,
                s.student_id,
                s.first_name,
                s.last_name
            FROM checkout_history ch
            JOIN chromebooks c ON ch.chromebook_id = c.id
            JOIN students s ON ch.student_id = s.id
            WHERE ch.id = $1 AND ch.action = 'checkout'
        `, [checkoutId]);

        if (checkoutResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Checkout not found',
                message: 'No checkout record found for the given ID.'
            });
        }

        const checkout = checkoutResult.rows[0];

        const agreementData = {
            studentName: `${checkout.first_name} ${checkout.last_name}`,
            studentId: checkout.student_id,
            deviceSerial: checkout.serial_number,
            deviceAssetTag: checkout.asset_tag,
            isInsured: checkout.insurance === 'insured',
            checkoutDate: new Date(checkout.checked_out_date),
            signature: checkout.signature,
            parentSignature: checkout.parent_signature,
        };

        // Check if PDF already exists
        const existingPath = await PDFService.findExistingAgreement(agreementData);
        let filename: string;

        if (existingPath) {
            // Use existing PDF
            filename = path.basename(existingPath);
            console.log(`📄 [Agreement] Using existing PDF: ${filename}`);
        } else {
            // Generate new PDF (for legacy support or if file was deleted)
            filename = await PDFService.generateCheckoutAgreement(agreementData);
            console.log(`📄 [Agreement] Generated new PDF: ${filename}`);
        }

        // Read the PDF
        const pdfBuffer = await PDFService.readAgreement(filename);

        // Set response headers for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        // Send the PDF
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ [Generate Agreement] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to generate agreement PDF'
        });
    }
});

export { router as checkoutRoutes };
