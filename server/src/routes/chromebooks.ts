import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { getAllChromebooks, getChromebookById, createChromebook, updateChromebook, upsertChromebook } from '../database';
import { authenticateToken } from '../middleware/auth';
import { SandboxStore } from '../services/sandboxStore';

const router = express.Router();

// Get all chromebooks
router.get('/', authenticateToken, async (req: any, res: any) => {
    try {
        const chromebooks = await getAllChromebooks();
        res.json(chromebooks);
    } catch (error) {
        console.error('❌ [Get Chromebooks] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch chromebooks'
        });
    }
});

// Get chromebook by ID
router.get('/:id', [
    param('id').isInt({ min: 1 }),
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

        const chromebook = await getChromebookById(parseInt(req.params.id));

        if (!chromebook) {
            return res.status(404).json({ error: 'Chromebook not found' });
        }

        res.json(chromebook);
    } catch (error) {
        console.error('❌ [Get Chromebook] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch chromebook'
        });
    }
});

// Create new chromebook (admin only)
router.post('/', [
    body('asset_tag').trim().isLength({ min: 1 }),
    body('serial_number').trim().isLength({ min: 1 }),
    body('model').trim().isLength({ min: 1 }),
    body('status').isIn(['available', 'checked_out', 'maintenance', 'deprovisioned', 'disabled', 'retired']),
    body('condition').isIn(['excellent', 'good', 'fair', 'poor']),
    body('is_insured').isBoolean(),
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

        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        if (SandboxStore.isActive(req.user.id)) {
            const body = req.body;
            const simulated = {
                id: `SBX_DEV_${Math.random().toString(36).slice(2, 10)}`,
                ...body,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            return res.status(201).json(simulated);
        }
        const chromebook = await createChromebook(req.body);
        res.status(201).json(chromebook);
    } catch (error) {
        console.error('❌ [Create Chromebook] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to create chromebook'
        });
    }
});

// Update chromebook (admin only)
router.put('/:id', [
    param('id').isInt({ min: 1 }),
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

        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        if (SandboxStore.isActive(req.user.id)) {
            const simulated = {
                id: req.params.id,
                ...req.body,
                updated_at: new Date().toISOString(),
            };
            return res.json(simulated);
        }
        const chromebook = await updateChromebook(parseInt(req.params.id), req.body);

        if (!chromebook) {
            return res.status(404).json({ error: 'Chromebook not found' });
        }

        res.json(chromebook);
    } catch (error) {
        console.error('❌ [Update Chromebook] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to update chromebook'
        });
    }
});

// Upsert chromebook (insert or update) - for Google API sync (admin only)
router.post('/upsert', [
    body('asset_tag').trim().isLength({ min: 1 }),
    body('serial_number').trim().isLength({ min: 1 }),
    body('model').trim().isLength({ min: 1 }),
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

        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        if (SandboxStore.isActive(req.user.id)) {
            const body = req.body;
            const simulated = {
                id: body.id || `SBX_DEV_${Math.random().toString(36).slice(2, 10)}`,
                ...body,
                updated_at: new Date().toISOString(),
            };
            return res.json(simulated);
        }
        const chromebook = await upsertChromebook(req.body);
        res.json(chromebook);
    } catch (error) {
        console.error('❌ [Upsert Chromebook] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to upsert chromebook'
        });
    }
});

// Bulk upsert chromebooks - for Google API sync (admin only)
router.post('/bulk-upsert', [
    body('chromebooks').isArray({ min: 1 }),
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

        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { chromebooks } = req.body;
        const results: {
            success: any[];
            errors: any[];
        } = {
            success: [],
            errors: []
        };

        for (const chromebookData of chromebooks) {
            try {
                if (SandboxStore.isActive(req.user.id)) {
                    results.success.push({
                        id: chromebookData.id || `SBX_DEV_${Math.random().toString(36).slice(2, 10)}`,
                        ...chromebookData,
                        updated_at: new Date().toISOString(),
                    });
                } else {
                    const chromebook = await upsertChromebook(chromebookData);
                    results.success.push(chromebook);
                }
            } catch (error: any) {
                console.error(`❌ [Bulk Upsert] Error processing ${chromebookData.asset_tag}:`, error);
                results.errors.push({
                    asset_tag: chromebookData.asset_tag,
                    error: error?.message || 'Unknown error'
                });
            }
        }

        res.json({
            message: `Processed ${chromebooks.length} chromebooks`,
            successCount: results.success.length,
            errorCount: results.errors.length,
            results
        });
    } catch (error) {
        console.error('❌ [Bulk Upsert Chromebooks] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to bulk upsert chromebooks'
        });
    }
});

export { router as chromebookRoutes };
