import express from 'express';
import { InsuranceOverrideService } from '../services/insuranceOverrideService';
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/insurance-override
 * Override insurance status for a chromebook (super admin only)
 */
router.post('/', authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        // User is already authenticated and verified as super admin by middleware
        const user = req.user!;

        // Validate request body
        const { chromebook_id, new_insurance_status, override_reason } = req.body;

        if (!chromebook_id || !new_insurance_status) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chromebook_id and new_insurance_status',
                error: 'MISSING_REQUIRED_FIELDS'
            });
        }

        if (!['insured', 'pending', 'uninsured'].includes(new_insurance_status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid insurance status. Must be: insured, pending, or uninsured',
                error: 'INVALID_INSURANCE_STATUS'
            });
        }

        // Execute the override
        const result = await InsuranceOverrideService.overrideInsuranceStatus({
            chromebook_id: parseInt(chromebook_id),
            new_insurance_status,
            override_reason,
            admin_user_id: user.id
        });

        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(400).json(result);
        }

    } catch (error) {
        console.error('Insurance override error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * GET /api/insurance-override/history/:chromebook_id
 * Get override history for a specific chromebook
 */
router.get('/history/:chromebook_id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        // Check if user is admin or super admin
        const user = req.user!;
        if (!user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.',
                error: 'INSUFFICIENT_PRIVILEGES'
            });
        }

        const chromebook_id = parseInt(req.params.chromebook_id);
        if (isNaN(chromebook_id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid chromebook ID',
                error: 'INVALID_CHROMEBOOK_ID'
            });
        }

        const history = await InsuranceOverrideService.getOverrideHistory(chromebook_id);

        return res.status(200).json({
            success: true,
            data: history
        });

    } catch (error) {
        console.error('Get override history error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * GET /api/insurance-override/all
 * Get all insurance overrides (for reporting/auditing)
 */
router.get('/all', authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
        // User is already authenticated and verified as super admin by middleware
        const user = req.user!;

        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await InsuranceOverrideService.getAllOverrides(limit, offset);

        return res.status(200).json({
            success: true,
            data: result.overrides,
            pagination: {
                limit,
                offset,
                total: result.total
            }
        });

    } catch (error) {
        console.error('Get all overrides error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router;
