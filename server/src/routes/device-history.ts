import express from 'express';
import { param, validationResult } from 'express-validator';
import { query } from '../database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.get('/:chromebookId', [
    param('chromebookId').isInt({ min: 1 }),
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

        const { chromebookId } = req.params;

        const historyResult = await query(
            `SELECT
                dh.id,
                dh.event_type,
                dh.event_date,
                dh.details,
                ch.notes,
                ch.signature,
                ch.id as checkout_id,
                u.name as admin_name,
                u.email as admin_email,
                s.first_name as student_first_name,
                s.last_name as student_last_name,
                s.email as student_email
            FROM device_history dh
            LEFT JOIN users u ON dh.user_id = u.id
            LEFT JOIN students s ON dh.student_id = s.id
            LEFT JOIN checkout_history ch ON dh.chromebook_id = ch.chromebook_id
                AND dh.student_id = ch.student_id
                AND dh.user_id = ch.user_id
                AND ABS(EXTRACT(EPOCH FROM (dh.event_date - ch.action_date))) < 60
                AND dh.event_type IN ('Check-In', 'Check-Out')
            WHERE dh.chromebook_id = $1
            ORDER BY dh.event_date DESC`,
            [chromebookId]
        );

        res.json(historyResult.rows);

    } catch (error) {
        console.error('❌ [Device History] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch device history'
        });
    }
});


export { router as deviceHistoryRoutes };
