import express from 'express';
import { param, validationResult } from 'express-validator';
import { query } from '../database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.get('/:studentId', [
    param('studentId').isInt({ min: 1 }),
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

        const historyResult = await query(
            `SELECT
                ch.id,
                ch.action as event_type,
                ch.action_date as event_date,
                ch.notes,
                ch.signature,
                c.asset_tag,
                c.model,
                u.name as admin_name,
                u.email as admin_email
            FROM checkout_history ch
            JOIN chromebooks c ON ch.chromebook_id = c.id
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE ch.student_id = $1
            ORDER BY ch.action_date DESC`,
            [studentId]
        );

        res.json(historyResult.rows);

    } catch (error) {
        console.error('❌ [User Device History] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch user device history'
        });
    }
});


export { router as userDeviceHistoryRoutes };
