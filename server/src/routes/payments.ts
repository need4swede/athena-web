import express from 'express';
import { param, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { SandboxStore } from '../services/sandboxStore';
import { deleteFeePayment, archivePaymentAsCredit } from '../services/feeService';

const router = express.Router();

// DELETE /:paymentId (Super Admin only)
router.delete('/:paymentId', [
    param('paymentId').isInt(),
    authenticateToken
], async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!req.user.isSuperAdmin) {
        return res.status(403).json({ error: 'Super Admin access required' });
    }
    const { paymentId } = req.params;
    try {
        if (SandboxStore.isActive(req.user.id)) {
            return res.status(200).json({ message: 'Payment deleted successfully (sandbox)' });
        }
        await deleteFeePayment(parseInt(paymentId));
        res.status(200).json({ message: 'Payment deleted successfully' });
    } catch (error: any) {
        if (error.message === 'Payment not found') {
            return res.status(404).json({ error: 'Payment not found' });
        }
        console.error('Error deleting payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /:paymentId/archive (Super Admin only) - Archive payment as credit
router.post('/:paymentId/archive', [
    param('paymentId').isInt(),
    authenticateToken
], async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!req.user.isSuperAdmin) {
        return res.status(403).json({ error: 'Super Admin access required' });
    }
    const { paymentId } = req.params;
    try {
        if (SandboxStore.isActive(req.user.id)) {
            return res.status(200).json({ 
                message: 'Payment archived as credit successfully (sandbox)',
                archivedCredit: {
                    id: `SBX_CRED_${Math.random().toString(36).slice(2,10)}`,
                    original_payment_id: paymentId,
                    amount: 0,
                }
            });
        }
        const result = await archivePaymentAsCredit(parseInt(paymentId));
        res.status(200).json({ 
            message: 'Payment archived as credit successfully',
            archivedCredit: result
        });
    } catch (error: any) {
        if (error.message === 'Payment not found') {
            return res.status(404).json({ error: 'Payment not found' });
        }
        if (error.message === 'Payment already archived') {
            return res.status(400).json({ error: 'Payment has already been archived' });
        }
        if (error.message === 'Payment already applied') {
            return res.status(400).json({ error: 'Payment has already been applied to another fee' });
        }
        console.error('Error archiving payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as paymentRoutes };
