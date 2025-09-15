import express, { Request, Response } from 'express';
import { body, validationResult, param } from 'express-validator';
import { query } from '../database';
import jwt from 'jsonwebtoken';
import path from 'path';
import { readFile } from 'fs/promises';
import { getJwtSecretUnsafe } from '../utils/jwt';

const router = express.Router();

const JWT_SECRET = getJwtSecretUnsafe();

// Portal Login
router.post('/login', [
    body('serial_number').isString().trim().notEmpty(),
    body('student_id').isString().trim().notEmpty()
], async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { serial_number, student_id } = req.body;

    try {
        const chromebookResult = await query(
            `SELECT c.id as chromebook_id, c.asset_tag, c.serial_number, c.status, c.model, c.checked_out_date,
                    s.id as student_db_id, s.student_id, s.first_name, s.last_name, s.email,
                    gu.org_unit_path
             FROM chromebooks c
             JOIN students s ON c.current_user_id = s.id
             LEFT JOIN google_users gu ON s.email = gu.primary_email
             WHERE c.serial_number = $1 AND s.student_id = $2 AND (c.status = 'checked_out' OR c.status = 'pending_signature')`,
            [serial_number, student_id]
        );

        if (chromebookResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials or device not checked out' });
        }

        const device = chromebookResult.rows[0];

        // Get checkout history to check for pending signatures
        const historyResult = await query(
            `SELECT id, status, parent_signature FROM checkout_history
             WHERE chromebook_id = $1 AND student_id = $2 AND action = 'checkout'
             ORDER BY action_date DESC LIMIT 1`,
            [device.chromebook_id, device.student_db_id]
        );

        const token = jwt.sign({
            chromebook_id: device.chromebook_id,
            student_id: device.student_id,
            student_db_id: device.student_db_id,
        }, JWT_SECRET, { expiresIn: '1h' });

        return res.json({
            token,
            device: {
                asset_tag: device.asset_tag,
                serial_number: device.serial_number,
                status: device.status,
                model: device.model,
                checkout_date: device.checked_out_date,
            },
            student: {
                first_name: device.first_name,
                last_name: device.last_name,
                student_id: device.student_id,
                email: device.email,
                org_unit_path: device.org_unit_path,
            },
            history: historyResult.rows
        });

    } catch (error) {
        console.error('Portal login error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

const authenticatePortalToken = (req: any, res: Response, next: any): void => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (token == null) {
        res.sendStatus(401);
        return;
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
            res.sendStatus(403);
            return;
        }
        req.user = user;
        next();
    });
};

// Get Agreement
router.get('/agreement', authenticatePortalToken, async (req: any, res: Response): Promise<any> => {
    try {
        const { chromebook_id } = req.user;

        const result = await query(
            `SELECT
                c.asset_tag, c.serial_number, c.status,
                s.first_name, s.last_name, s.student_id,
                ch.action_date, ch.status as checkout_status
             FROM chromebooks c
             JOIN students s ON c.current_user_id = s.id
             JOIN checkout_history ch ON c.id = ch.chromebook_id
             WHERE c.id = $1 AND ch.action = 'checkout'
             ORDER BY ch.action_date DESC
             LIMIT 1`,
            [chromebook_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Agreement not found' });
        }

        const data = result.rows[0];
        const date = new Date(data.action_date);
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        const studentName = `${data.first_name}_${data.last_name}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
        const filename = `${dateStr}_${data.asset_tag}_${data.serial_number}_${studentName}_${data.student_id}.pdf`;

        const basePath = process.cwd() === '/app' ? '/app' : process.cwd();

        // Check if it's a pending agreement first
        let filePath;
        if (data.status === 'pending_signature' || data.checkout_status === 'pending') {
            filePath = path.join(basePath, 'files/agreements/pending', filename);
        } else {
            filePath = path.join(basePath, 'files/agreements/active', filename);
        }

        const pdfBuffer = await readFile(filePath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(pdfBuffer);

    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            // Try the other directory if file not found
            try {
                const { chromebook_id } = req.user;
                const result = await query(
                    `SELECT c.asset_tag, c.serial_number, s.first_name, s.last_name, s.student_id, ch.action_date
                     FROM chromebooks c
                     JOIN students s ON c.current_user_id = s.id
                     JOIN checkout_history ch ON c.id = ch.chromebook_id
                     WHERE c.id = $1 AND ch.action = 'checkout'
                     ORDER BY ch.action_date DESC LIMIT 1`,
                    [chromebook_id]
                );

                if (result.rows.length > 0) {
                    const data = result.rows[0];
                    const date = new Date(data.action_date);
                    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
                    const studentName = `${data.first_name}_${data.last_name}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
                    const filename = `${dateStr}_${data.asset_tag}_${data.serial_number}_${studentName}_${data.student_id}.pdf`;

                    const basePath = process.cwd() === '/app' ? '/app' : process.cwd();
                    const alternateFilePath = path.join(basePath, 'files/agreements/active', filename);

                    const pdfBuffer = await readFile(alternateFilePath);
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
                    return res.send(pdfBuffer);
                }
            } catch (secondError) {
                return res.status(404).json({ error: 'Agreement file not found.' });
            }
        }
        console.error('Get agreement error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Agreement URL
router.get('/agreement-url', authenticatePortalToken, async (req: any, res: Response): Promise<any> => {
    try {
        const { chromebook_id } = req.user;

        const result = await query(
            `SELECT
                c.asset_tag, c.serial_number,
                s.first_name, s.last_name, s.student_id,
                ch.action_date, ch.status as checkout_status
             FROM chromebooks c
             JOIN students s ON c.current_user_id = s.id
             JOIN checkout_history ch ON c.id = ch.chromebook_id
             WHERE c.id = $1 AND ch.action = 'checkout' AND ch.status = 'pending'
             ORDER BY ch.action_date DESC
             LIMIT 1`,
            [chromebook_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pending agreement not found' });
        }

        const data = result.rows[0];
        const date = new Date(data.action_date);
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        const studentName = `${data.first_name}_${data.last_name}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
        const filename = `${dateStr}_${data.asset_tag}_${data.serial_number}_${studentName}_${data.student_id}.pdf`;

        const url = `/files/agreements/pending/${filename}`;
        return res.json({ url });

    } catch (error) {
        console.error('Get agreement URL error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});


// Get student fees
router.get('/fees', authenticatePortalToken, async (req: any, res: Response): Promise<void> => {
    try {
        const { student_db_id } = req.user;

        const feesResult = await query(
            'SELECT * FROM student_fees WHERE student_id = $1',
            [student_db_id]
        );

        res.json({ fees: feesResult.rows });
    } catch (error) {
        console.error('❌ [Portal Fees] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch student fees'
        });
    }
});

// Update insurance status
router.post('/update-insurance', [
    body('is_insured').isBoolean(),
    authenticatePortalToken
], async (req: any, res: Response): Promise<void> => {
    try {
        const { student_db_id } = req.user;
        const { is_insured } = req.body;

        await query('BEGIN');

        if (is_insured) {
            // This should be handled by the pay-insurance route
            await query('ROLLBACK');
            res.status(400).json({ error: 'Invalid request' });
            return;
        } else {
            // If the user declines insurance, update the status to uninsured
            await query(
                `UPDATE checkout_history SET insurance = 'uninsured' WHERE student_id = $1 AND insurance = 'pending'`,
                [student_db_id]
            );

            // And remove the fee
            await query(
                `DELETE FROM student_fees WHERE student_id = $1 AND description = 'Device Insurance Fee'`,
                [student_db_id]
            );
        }

        await query('COMMIT');

        res.status(200).json({ message: 'Insurance status updated' });
    } catch (error) {
        await query('ROLLBACK');
        console.error('❌ [Portal Update Insurance] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to update insurance status'
        });
    }
});

// Sign Agreement (Parent Signature)
router.post('/sign/:history_id', [
    param('history_id').isInt({ min: 1 }),
    body('parent_signature').isString(),
    body('is_insured').isBoolean(),
    authenticatePortalToken
], async (req: any, res: Response): Promise<void> => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
            return;
        }

        const { history_id } = req.params;
        const { parent_signature, is_insured } = req.body;
        const { chromebook_id, student_db_id } = req.user;

        await query('BEGIN');

        try {
            // Get the checkout history record and verify it belongs to this user
            const historyResult = await query(
                'SELECT * FROM checkout_history WHERE id = $1 AND chromebook_id = $2 AND student_id = $3',
                [history_id, chromebook_id, student_db_id]
            );

            if (historyResult.rows.length === 0) {
                res.status(404).json({ error: 'Checkout record not found or access denied' });
                return;
            }

            const history = historyResult.rows[0];

            // Check if already signed
            if (history.parent_signature) {
                res.status(400).json({ error: 'Agreement already signed by parent' });
                return;
            }

            // Update history with parent signature
            await query(
                'UPDATE checkout_history SET parent_signature = $1, status = $2, insurance = $3 WHERE id = $4',
                [parent_signature, 'completed', is_insured ? 'pending' : 'uninsured', history_id]
            );

            // Update chromebook status and insurance_status
            await query(
                'UPDATE chromebooks SET status = $1, insurance_status = $2 WHERE id = $3',
                ['checked_out', is_insured ? 'pending' : 'uninsured', chromebook_id]
            );

            if (is_insured) {
                // Add insurance fee using replacement function to handle existing fees
                const { feeAndCostConfig } = await import('../config');
                const { replaceInsuranceFee } = await import('../services/feeService');

                // Use system user "Athena" (ID 4) for portal transactions to avoid foreign key constraint
                const SYSTEM_USER_ID = 4; // Athena system user from users table

                await replaceInsuranceFee(
                    student_db_id,
                    feeAndCostConfig.ltcFee,
                    'Device Insurance Fee',
                    SYSTEM_USER_ID, // Use system user instead of student_db_id to satisfy foreign key constraint
                    `portal_${Date.now()}_${student_db_id}`, // Generate unique idempotency key
                    parseInt(history_id) // Use history_id as checkout_id
                );
            }

            // Get student and chromebook info for file operations
            const studentResult = await query('SELECT * FROM students WHERE id = $1', [student_db_id]);
            const chromebookResult = await query('SELECT * FROM chromebooks WHERE id = $1', [chromebook_id]);

            if (studentResult.rows.length === 0 || chromebookResult.rows.length === 0) {
                throw new Error('Student or chromebook not found');
            }

            const student = studentResult.rows[0];
            const chromebook = chromebookResult.rows[0];

            // Import PDFService to regenerate the PDF with both signatures
            const { PDFService } = await import('../services/pdfService');

            // Generate consistent filename using PDFService sanitization
            const dateStr = new Date(history.action_date).toISOString().split('T')[0];
            const sanitizedName = PDFService.sanitizeFilename(`${student.first_name} ${student.last_name}`);
            const filename = `${dateStr}_${chromebook.asset_tag}_${chromebook.serial_number}_${sanitizedName}_${student.student_id}.pdf`;

            // Remove the old pending file first
            try {
                const pendingPath = await PDFService.getAgreementPath(filename, true);
                const { rm } = await import('fs/promises');
                await rm(pendingPath);
                console.log(`✅ Removed pending agreement: ${filename}`);
            } catch (error) {
                console.warn('⚠️ Could not remove pending agreement file:', error);
            }

            // Regenerate the PDF with both student and parent signatures
            await PDFService.generateCheckoutAgreement({
                studentName: `${student.first_name} ${student.last_name}`,
                studentId: student.student_id,
                deviceSerial: chromebook.serial_number,
                deviceAssetTag: chromebook.asset_tag,
                isInsured: is_insured,
                checkoutDate: new Date(history.action_date),
                signature: history.signature,
                parentSignature: parent_signature,
                isPending: false, // Save to completed directory
            });

            console.log(`✅ Generated completed agreement with parent signature: ${filename}`);

            await query('COMMIT');
            res.status(200).json({
                message: 'Agreement signed successfully',
                status: 'completed'
            });

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ [Portal Sign] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process signature'
        });
    }
});

export { router as portalRoutes };
