import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query } from '../database';
import { authenticateToken } from '../middleware/auth';
import { addFeePayment, applyPreviousPayment } from '../services/feeService';
import { SandboxStore } from '../services/sandboxStore';
import { SandboxOverlay } from '../services/sandboxOverlay';
import { query as db } from '../database';

const router = express.Router();

// Add a payment to a fee
router.post('/:feeId/payments', [
    param('feeId').isInt(),
    body('amount').isFloat({ gt: 0 }),
    body('payment_method').isString(),
    body('notes').optional().isString(),
    authenticateToken
], async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { feeId } = req.params;
    const { amount, payment_method, notes } = req.body;
    const processed_by_user_id = req.user.id;

    try {
        // Get fee with calculated balance for validation
        const feeResult = await query(`
            SELECT
                sf.*,
                (sf.amount - COALESCE(
                    (SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.student_fee_id = sf.id),
                    0
                )) as balance
            FROM student_fees sf
            WHERE sf.id = $1
        `, [feeId]);

        if (feeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Fee not found' });
        }

        const fee = feeResult.rows[0];
        const currentBalance = parseFloat(fee.balance);

        if (parseFloat(amount) > currentBalance) {
            return res.status(400).json({ error: 'Payment amount cannot exceed the fee balance.' });
        }

        let paymentResult;
        if (SandboxStore.isActive(req.user.id)) {
            // Simulate payment in sandbox without DB writes
            const feeType = fee.description.toLowerCase().includes('insurance') ? 'I' : 'D';
            const date = new Date();
            const datePart = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
            const transactionId = `SBX_T${feeType}${datePart}${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;
            paymentResult = SandboxOverlay.recordPayment(req.user.id, {
                student_fee_id: parseInt(feeId),
                amount: parseFloat(amount),
                payment_method,
                notes,
                processed_by_user_id,
                transaction_id: transactionId,
            });
        } else {
            // Use the service function which handles insurance status updates
            paymentResult = await addFeePayment({
                student_fee_id: parseInt(feeId),
                amount: parseFloat(amount),
                payment_method,
                notes,
                processed_by_user_id
            });
        }

        res.status(201).json(paymentResult);
    } catch (error) {
        console.error('Error adding payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Apply a previous payment to a fee
router.post('/:feeId/apply-previous-payment', [
    param('feeId').isInt(),
    body('transaction_id').isString(),
    body('amount').isFloat({ gt: 0 }),
    body('payment_method').isString(),
    body('notes').optional().isString(),
    body('processed_by_user_id').isInt(),
    body('created_at').isString(),
    authenticateToken
], async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { feeId } = req.params;
    const { transaction_id, amount, payment_method, notes, processed_by_user_id, created_at } = req.body;
    const current_user_id = req.user.id;

    try {
        console.log(`[Apply Previous Payment] Incoming request for feeId=${feeId}, transaction_id=${transaction_id}, amount=${amount}, payment_method=${payment_method}, processed_by_user_id=${processed_by_user_id}, created_at=${created_at}`);
        // Construct previous payment object
        const previousPayment = {
            transaction_id,
            amount: parseFloat(amount),
            payment_method,
            notes,
            processed_by_user_id: parseInt(processed_by_user_id),
            created_at: new Date(created_at),
            original_fee_description: 'Device Insurance Fee'
        };

        // Extra debug: Log previous payment object
        console.log('[Apply Previous Payment] Previous payment object:', previousPayment);

        // Apply the previous payment
        const paymentResult = await applyPreviousPayment(
            parseInt(feeId),
            previousPayment,
            current_user_id
        );

        console.log('[Apply Previous Payment] Payment result:', paymentResult);
        res.status(201).json(paymentResult);
    } catch (error) {
        console.error('Error applying previous payment:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';

        if (errorMessage.includes('already been applied') || errorMessage.includes('Fee not found')) {
            return res.status(400).json({ error: errorMessage });
        }

        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a fee
router.delete('/:feeId', [
    param('feeId').isInt(),
    authenticateToken
], async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { feeId } = req.params;

    try {
        const paymentResult = await query('SELECT id FROM fee_payments WHERE student_fee_id = $1', [feeId]);
        if (paymentResult.rows.length > 0) {
            return res.status(400).json({ error: 'Cannot delete a fee with existing payments.' });
        }

        if (SandboxStore.isActive(req.user.id)) {
            // Sandbox: mark as deleted in overlay
            SandboxOverlay.recordDeletedFee(req.user.id, parseInt(feeId));
            return res.status(200).json({ message: 'Fee deleted (sandbox)' });
        }
        const deleteResult = await db('DELETE FROM student_fees WHERE id = $1 RETURNING *', [feeId]);
        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ error: 'Fee not found' });
        }

        res.status(200).json({ message: 'Fee deleted successfully' });
    } catch (error) {
        console.error('Error deleting fee:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as feeRoutes };
