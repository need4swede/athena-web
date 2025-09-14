import express from 'express';
import { getDashboardStats, getRecentActivity } from '../database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req: any, res: any) => {
    try {
        const stats = await getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('❌ [Get Dashboard Stats] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch dashboard statistics'
        });
    }
});

// Get recent activity
router.get('/activity', authenticateToken, async (req: any, res: any) => {
    try {
        const activity = await getRecentActivity();
        res.json(activity);
    } catch (error) {
        console.error('❌ [Get Recent Activity] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch recent activity'
        });
    }
});

export { router as dashboardRoutes };
