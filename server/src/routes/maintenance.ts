import express from 'express';
import { pool } from '../database';
import { createStudentFee } from '../services/feeService';
import { authenticateToken } from '../middleware/auth';
import { SandboxStore } from '../services/sandboxStore';
import { SandboxOverlay } from '../services/sandboxOverlay';

const router = express.Router();

router.get('/', async (req, res) => {
    if (!pool) {
        return res.status(500).json({ message: "Database connection not available" });
    }

    try {
        const maintenanceRecords = await pool.query(
            `SELECT
                mr.*,
                c.asset_tag,
                c.serial_number,
                c.model,
                c.org_unit,
                s.first_name || ' ' || s.last_name as student_name,
                s.student_id,
                u.name as user_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', mc.id,
                            'text', mc.comment,
                            'author', COALESCE(cu.name, 'Unknown User'),
                            'date', mc.created_at
                        ) ORDER BY mc.created_at ASC
                    ) FILTER (WHERE mc.id IS NOT NULL),
                    '[]'::json
                ) as comments
            FROM maintenance_records mr
            LEFT JOIN chromebooks c ON mr.chromebook_id = c.id
            LEFT JOIN users u ON mr.user_id = u.id
            LEFT JOIN students s ON mr.student_id = s.id
            LEFT JOIN maintenance_comments mc ON mr.id = mc.maintenance_id
            LEFT JOIN users cu ON mc.user_id = cu.id
            GROUP BY mr.id, c.asset_tag, c.serial_number, c.model, c.org_unit, s.first_name, s.last_name, s.student_id, u.name
            ORDER BY mr.created_at DESC`
        );

        // Process records to ensure JSON fields are valid
        const processedRecords = maintenanceRecords.rows.map(record => {
            // Safely parse and validate damage_locations
            let damage_locations = [];
            if (record.damage_locations) {
                try {
                    // If it's already an object, use it as-is, otherwise parse it
                    damage_locations = typeof record.damage_locations === 'string'
                        ? JSON.parse(record.damage_locations)
                        : record.damage_locations;
                } catch (e) {
                    console.warn(`Invalid damage_locations JSON for record ${record.id}, using empty array:`, e);
                    damage_locations = [];
                }
            }

            // Safely parse and validate repair_recommendations
            let repair_recommendations = [];
            if (record.repair_recommendations) {
                try {
                    // If it's already an object, use it as-is, otherwise parse it
                    repair_recommendations = typeof record.repair_recommendations === 'string'
                        ? JSON.parse(record.repair_recommendations)
                        : record.repair_recommendations;
                } catch (e) {
                    console.warn(`Invalid repair_recommendations JSON for record ${record.id}, using empty array:`, e);
                    repair_recommendations = [];
                }
            }

            // Safely parse and validate photos
            let photos = [];
            if (record.photos) {
                try {
                    // If it's already an object, use it as-is, otherwise parse it
                    photos = typeof record.photos === 'string'
                        ? JSON.parse(record.photos)
                        : record.photos;
                } catch (e) {
                    console.warn(`Invalid photos JSON for record ${record.id}, using empty array:`, e);
                    photos = [];
                }
            }

            return {
                ...record,
                damage_locations,
                repair_recommendations,
                photos
            };
        });

        return res.status(200).json(processedRecords);
    } catch (error) {
        console.error('Error fetching maintenance records:', error);
        return res.status(500).json({ message: 'Error fetching maintenance records' });
    }
});

router.get('/active-service/:chromebook_id', authenticateToken, async (req: any, res) => {
    const { chromebook_id } = req.params;

    if (!pool) {
        return res.status(500).json({ message: "Database connection not available" });
    }

    try {
        const activeServiceRecord = await pool.query(
            `SELECT id, status, service_type, created_at
             FROM maintenance_records
             WHERE chromebook_id = $1::integer
             AND service_type = 'service'
             AND status != 'completed'
             ORDER BY created_at DESC
             LIMIT 1`,
            [chromebook_id]
        );

        if (activeServiceRecord.rows.length === 0) {
            return res.status(404).json({ message: 'No active service record found for this device' });
        }

        return res.status(200).json(activeServiceRecord.rows[0]);
    } catch (error) {
        console.error('Error fetching active service record:', error);
        return res.status(500).json({ message: 'Error fetching active service record' });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;

    if (!pool) {
        return res.status(500).json({ message: "Database connection not available" });
    }

    try {
        const maintenanceRecord = await pool.query(
            `SELECT
                mr.*,
                c.asset_tag,
                c.serial_number,
                c.model,
                c.org_unit,
                c.is_insured,
                s.first_name || ' ' || s.last_name as student_name,
                s.student_id,
                u.name as user_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', mc.id,
                            'text', mc.comment,
                            'author', COALESCE(cu.name, 'Unknown User'),
                            'date', mc.created_at
                        ) ORDER BY mc.created_at ASC
                    ) FILTER (WHERE mc.id IS NOT NULL),
                    '[]'::json
                ) as comments
            FROM maintenance_records mr
            LEFT JOIN chromebooks c ON mr.chromebook_id = c.id
            LEFT JOIN users u ON mr.user_id = u.id
            LEFT JOIN students s ON mr.student_id = s.id
            LEFT JOIN maintenance_comments mc ON mr.id = mc.maintenance_id
            LEFT JOIN users cu ON mc.user_id = cu.id
            WHERE mr.id = $1
            GROUP BY mr.id, c.asset_tag, c.serial_number, c.model, c.org_unit, c.is_insured, s.first_name, s.last_name, s.student_id, u.name`,
            [id]
        );

        if (maintenanceRecord.rows.length === 0) {
            return res.status(404).json({ message: 'Maintenance record not found' });
        }

        const record = maintenanceRecord.rows[0];

        // Process the record to ensure JSON fields are valid
        let damage_locations = [];
        if (record.damage_locations) {
            try {
                // If it's already an object, use it as-is, otherwise parse it
                damage_locations = typeof record.damage_locations === 'string'
                    ? JSON.parse(record.damage_locations)
                    : record.damage_locations;
            } catch (e) {
                console.warn(`Invalid damage_locations JSON for record ${record.id}, using empty array:`, e);
                damage_locations = [];
            }
        }

        let repair_recommendations = [];
        if (record.repair_recommendations) {
            try {
                // If it's already an object, use it as-is, otherwise parse it
                repair_recommendations = typeof record.repair_recommendations === 'string'
                    ? JSON.parse(record.repair_recommendations)
                    : record.repair_recommendations;
            } catch (e) {
                console.warn(`Invalid repair_recommendations JSON for record ${record.id}, using empty array:`, e);
                repair_recommendations = [];
            }
        }

        let photos = [];
        if (record.photos) {
            try {
                // If it's already an object, use it as-is, otherwise parse it
                photos = typeof record.photos === 'string'
                    ? JSON.parse(record.photos)
                    : record.photos;
            } catch (e) {
                console.warn(`Invalid photos JSON for record ${record.id}, using empty array:`, e);
                photos = [];
            }
        }

        const processedRecord = {
            ...record,
            damage_locations,
            repair_recommendations,
            photos
        };

        return res.status(200).json(processedRecord);
    } catch (error) {
        console.error('Error fetching maintenance record:', error);
        return res.status(500).json({ message: 'Error fetching maintenance record' });
    }
});

router.post('/', authenticateToken, async (req: any, res) => {
    const { studentId, assetTag, isInsured, damageLocations, totalCost } = req.body;

    if (!pool) {
        return res.status(500).json({ message: "Database connection not available" });
    }

    // Validate required fields
    if (!studentId || !assetTag) {
        return res.status(400).json({ message: 'Student ID and Asset Tag are required' });
    }

    try {
        if (SandboxStore.isActive(req.user.id)) {
            // Record overlay and return simulated record
            SandboxOverlay.recordMaintenance(req.user.id, 'create', { studentId, assetTag, isInsured, damageLocations, totalCost });
            return res.status(201).json({
                id: `SBX_M_${Math.random().toString(36).slice(2,10)}`,
                chromebook_id: `SBX_DEV_${Math.random().toString(36).slice(2,10)}`,
                student_id: studentId,
                asset_tag: assetTag,
                is_insured: isInsured,
                damage_locations: damageLocations || [],
                total_cost: totalCost || 0,
                status: 'pending',
                created_at: new Date().toISOString(),
                created_by: req.user.name
            });
        }
        console.log(`🔍 [MAINTENANCE] Creating maintenance record by user: ${req.user.name} (${req.user.email})`);
        // Look up chromebook ID from asset tag
        const chromebookResult = await pool.query(
            'SELECT id FROM chromebooks WHERE asset_tag = $1',
            [assetTag]
        );

        if (chromebookResult.rows.length === 0) {
            return res.status(404).json({ message: 'Chromebook not found with the specified asset tag' });
        }

        const chromebookId = chromebookResult.rows[0].id;

        // The user_id in maintenance_records should be the admin who created the record
        const adminUserId = req.user.id;
        console.log(`🔍 [MAINTENANCE] Admin user ID: ${adminUserId}`);

        // Look up the student database ID from the provided studentId
        const studentResult = await pool.query(
            'SELECT id, first_name, last_name FROM students WHERE student_id = $1',
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found with the specified student ID' });
        }

        const studentDbId = studentResult.rows[0].id;
        const studentName = `${studentResult.rows[0].first_name} ${studentResult.rows[0].last_name}`;
        console.log(`🔍 [MAINTENANCE] Student database ID: ${studentDbId}, Name: ${studentName}`);

        // Generate a description based on damage locations
        let issueDescription = 'Device added via maintenance workflow';
        if (damageLocations && damageLocations.length > 0) {
            const damageAreas = damageLocations.map((loc: any) => `${loc.area} (${loc.damageType})`);
            issueDescription = `Multiple damage locations identified: ${damageAreas.join(', ')}`;
        }

        // Calculate repair recommendations
        const calculateRepairRecommendations = (damages: any[]) => {
            const recommendations: any[] = [];
            const hasCriticalDamage = damages.some(d => d.severity === 'critical');
            const majorDamageCount = damages.filter(d => d.severity === 'major').length;

            if (hasCriticalDamage || majorDamageCount >= 3) {
                return [{
                    item: 'Full Chromebook Replacement',
                    cost: 350,
                    priority: 'high',
                    description: 'Multiple major issues or critical damage detected. Replacement recommended.'
                }];
            }

            const damageMap: { [key: string]: any } = {
                'Screen': { item: 'Screen Replacement', cost: 100, priority: 'high' },
                'Keyboard': { item: 'Keyboard Replacement', cost: 40, priority: 'medium' },
                'Trackpad': { item: 'Trackpad Replacement', cost: 35, priority: 'medium' },
                'Charging Port': { item: 'Charging Port Repair', cost: 50, priority: 'high' },
                'Camera': { item: 'Camera Replacement', cost: 30, priority: 'low' },
                'Hinge': { item: 'Hinge Repair/Replacement', cost: 60, priority: 'medium' },
                'Bottom Case': { item: 'Body/Chassis Replacement', cost: 80, priority: 'medium' },
            };

            const uniqueRecommendations = new Map();

            damages.forEach(damage => {
                const recommendationTemplate = damageMap[damage.area];
                if (recommendationTemplate && !uniqueRecommendations.has(recommendationTemplate.item)) {
                    uniqueRecommendations.set(recommendationTemplate.item, {
                        ...recommendationTemplate,
                        description: `Repair/replacement due to ${damage.damageType.toLowerCase()}.`,
                    });
                }
            });

            if (damages.length > 0 && uniqueRecommendations.size === 0) {
                uniqueRecommendations.set('General Assessment Required', {
                    item: 'General Assessment Required',
                    cost: 0,
                    priority: 'low',
                    description: 'Device requires technical assessment to determine repair needs.'
                });
            }

            return Array.from(uniqueRecommendations.values());
        };

        const repairRecommendations = calculateRepairRecommendations(damageLocations || []);

        // Add insurance status to damage locations metadata
        const enhancedDamageLocations = {
            locations: damageLocations || [],
            isInsured: isInsured,
            metadata: {
                addedVia: 'maintenance_workflow',
                timestamp: new Date().toISOString()
            }
        };

        // Determine priority based on total cost and damage severity
        let priority = 'medium';
        if (totalCost > 200) {
            priority = 'high';
        } else if (totalCost > 0 && damageLocations && damageLocations.some((loc: any) => loc.severity === 'critical')) {
            priority = 'high';
        } else if (totalCost === 0) {
            priority = 'low';
        }

        const newMaintenanceRecord = await pool.query(
            `INSERT INTO maintenance_records (chromebook_id, user_id, student_id, issue_description, damage_locations, repair_recommendations, total_cost, status, priority)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
             RETURNING *`,
            [chromebookId, adminUserId, studentDbId, issueDescription, JSON.stringify(enhancedDamageLocations), JSON.stringify(repairRecommendations), totalCost || 0, priority]
        );

        const maintenanceRecordId = newMaintenanceRecord.rows[0].id;

        // Create student fee if device has damage, has a cost, is not insured
        if (totalCost && parseFloat(totalCost) > 0 && !isInsured) {
            try {
                console.log(`💰 [MAINTENANCE] Creating student fee for damage: $${totalCost}`);

                // Get the student record to create the fee
                const studentRecord = await pool.query(
                    'SELECT id FROM students WHERE student_id = $1',
                    [studentId]
                );

                if (studentRecord.rows.length > 0) {
                    const studentDbId = studentRecord.rows[0].id;

                    // Get chromebook details for fee description
                    const chromebookDetails = await pool.query(
                        'SELECT asset_tag, serial_number FROM chromebooks WHERE id = $1',
                        [chromebookId]
                    );

                    const chromebook = chromebookDetails.rows[0];

                    await createStudentFee({
                        student_id: parseInt(studentDbId),
                        maintenance_id: parseInt(maintenanceRecordId),
                        amount: parseFloat(totalCost),
                        description: `Device damage repair cost (Asset: ${chromebook.asset_tag}, Serial: ${chromebook.serial_number}) - ${issueDescription}`,
                        created_by_user_id: parseInt(adminUserId)
                    });

                    console.log(`✅ [MAINTENANCE] Student fee created successfully for student ${studentId}`);
                } else {
                    console.error(`❌ [MAINTENANCE] Student not found with ID: ${studentId}`);
                }
            } catch (feeError) {
                console.error(`❌ [MAINTENANCE] Failed to create student fee:`, feeError);
                // Continue with maintenance creation even if fee creation fails
            }
        }

        console.log(`✅ Maintenance record created: ${assetTag} (ID: ${chromebookId}) for student ${studentId}`);
        return res.status(201).json(newMaintenanceRecord.rows[0]);
    } catch (error) {
        console.error('Error creating maintenance record:', error);
        return res.status(500).json({
            message: 'Error creating maintenance record',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.post('/comments', authenticateToken, async (req: any, res) => {
    const { maintenance_id, text } = req.body;

    if (!pool) {
        return res.status(500).json({ message: "Database connection not available" });
    }

    // Validate required fields
    if (!maintenance_id || !text?.trim()) {
        return res.status(400).json({ message: 'Maintenance ID and comment text are required' });
    }

    try {
        if (SandboxStore.isActive(req.user.id)) {
            SandboxOverlay.recordMaintenance(req.user.id, 'comment', { maintenance_id, text });
            return res.status(201).json({
                id: `SBX_MC_${Math.random().toString(36).slice(2,10)}`,
                text: text.trim(),
                author: req.user.name,
                date: new Date().toISOString()
            });
        }
        // Verify the maintenance record exists
        const maintenanceCheck = await pool.query(
            'SELECT id FROM maintenance_records WHERE id = $1',
            [maintenance_id]
        );

        if (maintenanceCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Maintenance record not found' });
        }

        // Insert the comment with user_id
        const newComment = await pool.query(
            `INSERT INTO maintenance_comments (maintenance_id, user_id, comment, created_at)
             VALUES ($1, $2, $3, NOW())
             RETURNING *`,
            [maintenance_id, req.user.id, text.trim()]
        );

        // Get the comment with user information
        const commentWithUser = await pool.query(
            `SELECT
                mc.*,
                u.name as author
             FROM maintenance_comments mc
             LEFT JOIN users u ON mc.user_id = u.id
             WHERE mc.id = $1`,
            [newComment.rows[0].id]
        );

        const responseComment = {
            id: commentWithUser.rows[0].id,
            text: commentWithUser.rows[0].comment,
            author: commentWithUser.rows[0].author || 'Unknown User',
            date: commentWithUser.rows[0].created_at
        };

        console.log(`✅ [MAINTENANCE] Comment added to record ${maintenance_id} by ${req.user.name}`);
        return res.status(201).json(responseComment);
    } catch (error) {
        console.error('Error creating maintenance comment:', error);
        return res.status(500).json({ message: 'Error creating maintenance comment' });
    }
});

// Mark maintenance record as complete and return device to service
// This leverages the existing checkin infrastructure for consistency
router.post('/:id/return', authenticateToken, async (req: any, res) => {
    const { id } = req.params;

    if (!pool) {
        return res.status(500).json({ message: "Database connection not available" });
    }

    try {
        if (SandboxStore.isActive(req.user.id)) {
            SandboxOverlay.recordMaintenance(req.user.id, 'return', { id });
            return res.status(200).json({
                message: 'Maintenance completed successfully (sandbox)',
                maintenance_id: id,
                chromebook_id: `SBX_DEV_${Math.random().toString(36).slice(2,10)}`,
                asset_tag: 'SBX_DEV',
                completed_by: req.user.name,
                completed_at: new Date().toISOString()
            });
        }
        console.log(`🔄 [MAINTENANCE] Completing maintenance record ${id} using existing checkin infrastructure`);

        // Get the maintenance record details
        const maintenanceRecord = await pool.query(
            `SELECT mr.*, c.asset_tag, c.id as chromebook_id
             FROM maintenance_records mr
             JOIN chromebooks c ON mr.chromebook_id = c.id
             WHERE mr.id = $1`,
            [id]
        );

        if (maintenanceRecord.rows.length === 0) {
            return res.status(404).json({ message: 'Maintenance record not found' });
        }

        const maintenance = maintenanceRecord.rows[0];

        // Update the maintenance record as completed first
        await pool.query(
            `UPDATE maintenance_records
             SET status = 'completed',
                 completed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id]
        );

        // Simulate the device being "checked in" from maintenance as good condition
        // This leverages the existing checkin logic for status updates, history, etc.
        await pool.query('BEGIN');

        try {
            // Update chromebook status back to available (using checkin logic)
            await pool.query(
                `UPDATE chromebooks
                 SET status = 'available',
                     current_user_id = NULL,
                     checked_out_date = NULL,
                     status_source = 'google',
                     status_override_date = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [maintenance.chromebook_id]
            );

            // Create a maintenance completion record in checkout_history for consistency
            await pool.query(
                `INSERT INTO checkout_history (chromebook_id, student_id, user_id, action, notes)
                 VALUES ($1, NULL, $2, 'checkin', $3)`,
                [
                    maintenance.chromebook_id,
                    req.user.id,
                    `Maintenance completed for record #${id}. Device returned to service.`
                ]
            );

            // Create device history record (following checkin pattern)
            await pool.query(
                `INSERT INTO device_history (chromebook_id, user_id, event_type, details)
                 VALUES ($1, $2, 'Maintenance Completed', $3)`,
                [
                    maintenance.chromebook_id,
                    req.user.id,
                    {
                        admin_name: req.user.name,
                        admin_email: req.user.email,
                        maintenance_id: parseInt(id),
                        completion_date: new Date().toISOString()
                    }
                ]
            );

            await pool.query('COMMIT');

            console.log(`✅ [MAINTENANCE] Maintenance record ${id} completed and device ${maintenance.asset_tag} returned to service using checkin infrastructure`);

            return res.status(200).json({
                message: 'Maintenance completed successfully',
                maintenance_id: id,
                chromebook_id: maintenance.chromebook_id,
                asset_tag: maintenance.asset_tag,
                completed_by: req.user.name,
                completed_at: new Date().toISOString()
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Error completing maintenance record:', error);
        return res.status(500).json({
            message: 'Error completing maintenance record',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
