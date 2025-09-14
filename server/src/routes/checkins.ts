import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query } from '../database';
import { authenticateToken, requireAdminOrAbove } from '../middleware/auth';
import { GoogleNotesService } from '../services/googleNotesService';
import { PDFService } from '../services/pdfService';
import { PhotoService } from '../services/photoService';
import { createStudentFee } from '../services/feeService';
import { SandboxOverlay } from '../services/sandboxOverlay';
import { SandboxStore } from '../services/sandboxStore';
import { getDatabaseTimestamp } from '../utils/timezone';
import { googleNotesConfig } from '../config';

const router = express.Router();

// Create a new checkin
router.post('/', [
    body('chromebook_id').custom((value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
            throw new Error('chromebook_id must be a positive integer');
        }
        return true;
    }),
    body('condition').isIn(['good', 'damaged', 'requires_repair']),
    body('notes').optional({ nullable: true }).isString(),
    body('damage_description').optional({ nullable: true }).isString(),
    body('damage_locations').optional({ nullable: true }).isArray(),
    body('repair_recommendations').optional({ nullable: true }).isArray(),
    body('total_cost').optional({ nullable: true }).isNumeric(),
    body('special_instructions').optional({ nullable: true }).isString(),
    body('photos').optional({ nullable: true }).isArray(),
    body('cost_waived').optional({ nullable: true }).isBoolean(),
    body('service_type').optional({ nullable: true }).isIn(['return', 'service']),
    authenticateToken
], async (req: any, res: any) => {
    try {
        console.log('🔍 [CHECKIN] Starting checkin process...');
        console.log('🔍 [CHECKIN] Request body:', JSON.stringify(req.body, null, 2));

        // Sandbox: simulate successful checkin without DB changes
        if (SandboxStore.isActive(req.user.id)) {
            const {
                chromebook_id,
                condition,
                notes,
                damage_description,
                damage_locations = [],
                repair_recommendations = [],
                total_cost = 0,
                special_instructions,
                cost_waived,
                service_type = 'return'
            } = req.body;
            const newStatus = condition === 'good' && service_type !== 'service' ? 'available' : 'maintenance';
            const responseNotes = notes || (service_type === 'service' ? 'Device brought in for service' : 'Device returned');
            SandboxOverlay.recordDeviceDelta(req.user.id, parseInt(chromebook_id), { status: newStatus, current_user_id: null });
            SandboxOverlay.recordMaintenance(req.user.id, service_type === 'service' ? 'create' : 'return', { chromebook_id, condition, notes: responseNotes });
            return res.status(201).json({
                message: service_type === 'service' ? 'Service request successful (sandbox)' : 'Checkin successful (sandbox)',
                checkin: {
                    chromebook_id,
                    student_id: null,
                    student_name: null,
                    checkin_date: new Date().toISOString(),
                    condition,
                    new_status: newStatus,
                    service_type,
                    notes: responseNotes,
                    maintenance_required: condition !== 'good',
                    maintenanceRecordId: null,
                    damage_locations,
                    repair_recommendations,
                    total_cost,
                    special_instructions,
                    cost_waived: !!cost_waived
                }
            });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [CHECKIN] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        // Check if user has permission to checkin devices (only regular users are restricted)
        if (req.user.role === 'user') {
            return res.status(403).json({
                error: 'Checkin access denied',
                message: 'Only admins and super admins can check in devices'
            });
        }

        const {
            chromebook_id,
            condition,
            notes,
            damage_description,
            damage_locations,
            repair_recommendations,
            total_cost,
            special_instructions,
            photos,
            cost_waived,
            service_type = 'return'
        } = req.body;

        // Convert chromebook_id to integer
        const chromebookIdInt = parseInt(chromebook_id);

        // Check if chromebook exists and is checked out
        const chromebookResult = await query(
            'SELECT * FROM chromebooks WHERE id = $1::integer',
            [chromebookIdInt]
        );

        if (chromebookResult.rows.length === 0) {
            return res.status(404).json({ error: 'Chromebook not found' });
        }

        const chromebook = chromebookResult.rows[0];
        if (chromebook.status !== 'checked_out' && chromebook.status !== 'pending_signature') {
            return res.status(400).json({
                error: 'Chromebook is not currently checked out or pending signature',
                current_status: chromebook.status
            });
        }

        // Check if device is already in service
        if (chromebook.in_service) {
            // Find the active maintenance record for this device
            const activeMaintenanceResult = await query(
                `SELECT id FROM maintenance_records
                 WHERE chromebook_id = $1::integer
                 AND service_type = 'service'
                 AND status != 'completed'
                 ORDER BY created_at DESC LIMIT 1`,
                [chromebookIdInt]
            );

            const maintenanceId = activeMaintenanceResult.rows.length > 0
                ? activeMaintenanceResult.rows[0].id
                : null;

            return res.status(409).json({
                error: 'Device is already in service',
                message: 'This device is currently being serviced. Please complete the existing service request before creating a new one.',
                current_status: chromebook.status,
                in_service: true,
                maintenance_id: maintenanceId
            });
        }

        // Get current student info for history
        let student = null;
        if (chromebook.current_user_id) {
            const studentResult = await query(
                'SELECT * FROM students WHERE id = $1::integer',
                [chromebook.current_user_id]
            );
            student = studentResult.rows.length > 0 ? studentResult.rows[0] : null;
        }

        // Start transaction
        await query('BEGIN');

        try {
            let newStatus = 'available';
            let shouldClearCheckout = true;

            // Handle service type workflow
            if (service_type === 'service') {
                // For service requests, keep device checked out but mark as in service
                newStatus = chromebook.status; // Keep current status (checked_out)
                shouldClearCheckout = false;

                // Update device to be in service but remain checked out
                await query(
                    `UPDATE chromebooks
                     SET in_service = true,
                         status_source = 'local',
                         status_override_date = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1::integer`,
                    [chromebookIdInt]
                );
            } else {
                // For return workflow, determine new status based on condition
                if (condition === 'damaged' || condition === 'requires_repair') {
                    newStatus = 'maintenance';
                }

                // Update chromebook status and clear checkout info (including insurance status reset)
                await query(
                    `UPDATE chromebooks
                     SET status = $1::varchar,
                         current_user_id = NULL,
                         checked_out_date = NULL,
                         is_insured = NULL,
                         insurance_status = 'uninsured',
                         in_service = false,
                         status_source = CASE
                             WHEN $1::varchar = 'maintenance' THEN 'local'
                             ELSE 'google'
                         END,
                         status_override_date = CASE
                             WHEN $1::varchar = 'maintenance' THEN CURRENT_TIMESTAMP
                             ELSE NULL
                         END,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2::integer`,
                    [newStatus, chromebookIdInt]
                );

                // Archive insurance payments (create credits) if student has previous insurance payments
                if (student) {
                    console.log(`📦 [Check-in Archive] Processing insurance payment archiving for student ${student.id} (${student.first_name} ${student.last_name})`);

                    try {
                        // Import the archiveInsurancePayments function (for check-ins only)
                        const { archiveInsurancePayments } = await import('../services/feeService');

                        // Check if student has any existing insurance fees with payments
                        const existingFeesResult = await query(
                            `SELECT sf.id, COUNT(fp.id) as payment_count
                             FROM student_fees sf
                             LEFT JOIN fee_payments fp ON sf.id = fp.student_fee_id
                             WHERE sf.student_id = $1::integer
                               AND sf.description = 'Device Insurance Fee'
                             GROUP BY sf.id
                             HAVING COUNT(fp.id) > 0`,
                            [student.id]
                        );

                        if (existingFeesResult.rows.length > 0) {
                            console.log(`📦 [Check-in Archive] Found ${existingFeesResult.rows.length} insurance fees with payments for student ${student.id}`);

                            // Use archiveInsurancePayments to convert payments to credits without creating new fees
                            const archiveResult = await archiveInsurancePayments(
                                student.id,
                                chromebook.asset_tag, // currentAssetTag - this is key for proper credit tracking!
                                `Device ${chromebook.asset_tag} returned - payments converted to credits`
                            );

                            console.log(`✅ [Check-in Archive] Successfully archived ${archiveResult.archivedCount} insurance payments as credits for device ${chromebook.asset_tag}`);
                            if (archiveResult.archivedCount > 0) {
                                console.log(`💳 [Check-in Archive] Student ${student.id} now has ${archiveResult.archivedCount} credit(s) available for future use`);
                            }
                        } else {
                            console.log(`ℹ️ [Check-in Archive] No insurance fees with payments found for student ${student.id}`);
                        }
                    } catch (archiveError) {
                        console.error(`❌ [Check-in Archive] Error processing insurance payment archiving for student ${student.id}:`, archiveError);
                        // Continue with checkin even if archiving fails
                    }
                } else {
                    console.log(`ℹ️ [Check-in Archive] No student found for insurance payment archiving`);
                }
            }

            // Create appropriate history records based on service type
            if (service_type === 'service') {
                // For service requests, create a service history record
                const serviceNotes = [];
                if (notes && typeof notes === 'string' && notes.trim()) {
                    serviceNotes.push(notes.trim());
                }
                if (condition !== 'good') {
                    serviceNotes.push(`Condition: ${condition}`);
                }
                if (damage_description && typeof damage_description === 'string' && damage_description.trim()) {
                    serviceNotes.push(`Damage: ${damage_description.trim()}`);
                }

                const serviceDescription = serviceNotes.length > 0 ? serviceNotes.join('. ') : 'Device brought in for service';

                // Create device history record for service request
                await query(
                    `INSERT INTO device_history (chromebook_id, user_id, student_id, event_type, details, cost_waived)
                     VALUES ($1, $2, $3, 'Repair', $4, $5)`,
                    [
                        chromebookIdInt,
                        req.user.id,
                        student?.id || null,
                        {
                            admin_name: req.user.name,
                            admin_email: req.user.email,
                            student_name: student ? `${student.first_name} ${student.last_name}` : null,
                            student_email: student?.email || null,
                            service_type: 'service',
                            description: serviceDescription
                        },
                        cost_waived || false
                    ]
                );
            } else {
                // For return workflow, create normal checkin records
                const checkinNotes = [];
                if (notes && typeof notes === 'string' && notes.trim()) {
                    checkinNotes.push(notes.trim());
                }
                if (condition !== 'good') {
                    checkinNotes.push(`Condition: ${condition}`);
                }
                if (damage_description && typeof damage_description === 'string' && damage_description.trim()) {
                    checkinNotes.push(`Damage: ${damage_description.trim()}`);
                }

                const checkinDescription = checkinNotes.length > 0 ? checkinNotes.join('. ') : 'Device returned';

                await query(
                    `INSERT INTO checkout_history (chromebook_id, student_id, user_id, action, notes)
                     VALUES ($1::integer, $2::integer, $3::integer, $4::varchar, $5::text)`,
                    [chromebookIdInt, student?.id || null, req.user.id, 'checkin', String(checkinDescription)]
                );

                // Create device history record
                await query(
                    `INSERT INTO device_history (chromebook_id, user_id, student_id, event_type, details, cost_waived)
                     VALUES ($1, $2, $3, 'Check-In', $4, $5)`,
                    [
                        chromebookIdInt,
                        req.user.id,
                        student?.id || null,
                        {
                            admin_name: req.user.name,
                            admin_email: req.user.email,
                            student_name: student ? `${student.first_name} ${student.last_name}` : null,
                            student_email: student?.email || null,
                        },
                        cost_waived || false
                    ]
                );
            }

            let maintenanceRecordId = null;
            // If device needs maintenance, create a maintenance record
            if (condition === 'damaged' || condition === 'requires_repair') {
                // Determine priority based on condition and damage
                let priority = 'medium';
                if (condition === 'requires_repair') {
                    priority = 'high';
                } else if (repair_recommendations && repair_recommendations.length > 0) {
                    const hasHighPriorityRepairs = repair_recommendations.some((rec: any) => rec.priority === 'high');
                    if (hasHighPriorityRepairs) {
                        priority = 'high';
                    }
                } else if (damage_locations && damage_locations.length > 0) {
                    const hasCriticalDamage = damage_locations.some((loc: any) => loc.severity === 'critical');
                    if (hasCriticalDamage) {
                        priority = 'high';
                    }
                }

                // Generate a meaningful issue description from damage data
                let issueDescription = damage_description || '';

                if (!issueDescription && damage_locations && damage_locations.length > 0) {
                    const damageDescriptions = damage_locations.map((loc: any) =>
                        `${loc.area}: ${loc.damageType} (${loc.severity})`
                    );
                    issueDescription = `Multiple damage locations identified: ${damageDescriptions.join(', ')}`;
                } else if (!issueDescription) {
                    issueDescription = `Device returned with condition: ${condition}`;
                }

                // Add special instructions to the description if provided
                if (special_instructions) {
                    issueDescription += `. Special instructions: ${special_instructions}`;
                }

                const savedPhotoUrls = await PhotoService.savePhotos(chromebook.asset_tag, photos);

                // Prepare original checkout info for service requests
                const originalCheckoutInfo = service_type === 'service' ? {
                    current_user_id: chromebook.current_user_id,
                    checked_out_date: chromebook.checked_out_date,
                    is_insured: chromebook.is_insured,
                    insurance_status: chromebook.insurance_status
                } : null;

                const maintenanceRecordResult = await query(
                    `INSERT INTO maintenance_records (
                        chromebook_id,
                        user_id,
                        student_id,
                        issue_description,
                        status,
                        priority,
                        damage_locations,
                        repair_recommendations,
                        total_cost,
                        cost_waived,
                        photos,
                        service_type,
                        original_status,
                        original_checkout_info
                    )
                     VALUES ($1::integer, $2::integer, $3::integer, $4::text, $5::varchar, $6::varchar, $7::jsonb, $8::jsonb, $9::numeric, $10::boolean, $11::jsonb, $12::varchar, $13::varchar, $14::jsonb) RETURNING id`,
                    [
                        chromebookIdInt,
                        req.user.id,
                        student?.id || null,
                        issueDescription,
                        'pending',
                        priority,
                        JSON.stringify(damage_locations || []),
                        JSON.stringify(repair_recommendations || []),
                        total_cost || 0,
                        cost_waived || false,
                        JSON.stringify(savedPhotoUrls),
                        service_type,
                        service_type === 'service' ? chromebook.status : null,
                        originalCheckoutInfo ? JSON.stringify(originalCheckoutInfo) : null
                    ]
                );
                maintenanceRecordId = maintenanceRecordResult.rows[0].id;

                // Create student fee if device has damage, has a cost, is not insured, and cost is not waived
                if (student && total_cost && parseFloat(total_cost) > 0 && !chromebook.is_insured && !cost_waived) {
                    try {
                        console.log(`💰 [CHECKIN] Creating student fee for damage: $${total_cost}`);

                        // Validate required fields before creating fee
                        const userId = parseInt(req.user.id);
                        const studentId = student?.id ? parseInt(student.id) : null;
                        const maintenanceId = parseInt(maintenanceRecordId);
                        const costAmount = parseFloat(total_cost);

                        if (!userId || isNaN(userId)) {
                            throw new Error(`Invalid user ID: ${req.user.id}`);
                        }

                        if (!studentId || isNaN(studentId)) {
                            throw new Error(`Invalid student ID: ${student?.id} - student may not exist`);
                        }

                        if (!maintenanceId || isNaN(maintenanceId)) {
                            throw new Error(`Invalid maintenance ID: ${maintenanceRecordId}`);
                        }

                        if (!costAmount || isNaN(costAmount) || costAmount <= 0) {
                            throw new Error(`Invalid cost amount: ${total_cost}`);
                        }

                        await createStudentFee({
                            student_id: studentId,
                            maintenance_id: maintenanceId,
                            amount: costAmount,
                            description: `Device damage repair cost (Asset: ${chromebook.asset_tag}, Serial: ${chromebook.serial_number}) - ${issueDescription}`,
                            created_by_user_id: userId
                        });

                        console.log(`✅ [CHECKIN] Student fee created successfully`);
                    } catch (feeError) {
                        console.error(`❌ [CHECKIN] Failed to create student fee:`, feeError);
                        // Continue with checkin even if fee creation fails
                    }
                }
            }

            // Commit transaction
            await query('COMMIT');

            // After successful database commit, update Google notes and archive agreement only for returns
            if (service_type === 'return') {
                try {
                    if (chromebook.asset_tag && student) {
                        // Archive the agreement
                        if (chromebook.checked_out_date) {
                            const agreementData = {
                                studentName: `${student.first_name} ${student.last_name}`,
                                studentId: student.student_id,
                                deviceSerial: chromebook.serial_number,
                                deviceAssetTag: chromebook.asset_tag,
                                isInsured: chromebook.is_insured,
                                checkoutDate: new Date(chromebook.checked_out_date),
                            };
                            const filename = PDFService.generateFilename(agreementData);
                            await PDFService.archiveAgreement(filename);
                        }

                        // Update Google notes (if enabled)
                        if (googleNotesConfig.enabled) {
                            const studentName = `${student.first_name} ${student.last_name}`;
                            const studentEmail = student.email || 'no-email@domain.com';
                            const adminName = req.user.name || req.user.email;
                            const isInsured = chromebook.is_insured || false;

                            const notesContent = GoogleNotesService.formatCheckinNote(
                                studentName,
                                studentEmail,
                                adminName,
                                isInsured
                            );

                            console.log(`🔄 [Checkin] Updating Google notes for asset: ${chromebook.asset_tag}`);

                            const notesResult = await GoogleNotesService.updateDeviceNotes(
                                chromebook.asset_tag,
                                notesContent,
                                req.headers.authorization?.replace('Bearer ', '') || ''
                            );

                            if (notesResult.success) {
                                console.log(`✅ [Checkin] Google notes updated successfully for asset: ${chromebook.asset_tag}`);
                            } else {
                                console.error(`❌ [Checkin] Google notes update failed for asset: ${chromebook.asset_tag} - ${notesResult.error}`);
                                // Continue with checkin success even if notes update fails
                            }
                        } else {
                            console.log(`📝 [Checkin] Google notes posting disabled via environment config`);
                        }
                    } else {
                        console.log(`⚠️ [Checkin] Missing asset tag or student info for chromebook ID ${chromebookIdInt}, skipping Google notes update`);
                    }

                } catch (notesError) {
                    console.error(`❌ [Checkin] Exception during notes update for asset: ${chromebook.asset_tag}`, notesError);
                    // Continue with checkin success even if notes update fails
                }
            } else {
                console.log(`🔧 [Service] Skipping Google notes update and agreement archiving for service request on asset: ${chromebook.asset_tag}`);
            }

            // Prepare response notes based on service type
            let responseNotes;
            if (service_type === 'service') {
                const serviceNotes = [];
                if (notes && typeof notes === 'string' && notes.trim()) {
                    serviceNotes.push(notes.trim());
                }
                if (condition !== 'good') {
                    serviceNotes.push(`Condition: ${condition}`);
                }
                if (damage_description && typeof damage_description === 'string' && damage_description.trim()) {
                    serviceNotes.push(`Damage: ${damage_description.trim()}`);
                }
                responseNotes = serviceNotes.length > 0 ? serviceNotes.join('. ') : 'Device brought in for service';
            } else {
                const checkinNotes = [];
                if (notes && typeof notes === 'string' && notes.trim()) {
                    checkinNotes.push(notes.trim());
                }
                if (condition !== 'good') {
                    checkinNotes.push(`Condition: ${condition}`);
                }
                if (damage_description && typeof damage_description === 'string' && damage_description.trim()) {
                    checkinNotes.push(`Damage: ${damage_description.trim()}`);
                }
                responseNotes = checkinNotes.length > 0 ? checkinNotes.join('. ') : 'Device returned';
            }

            // Return success response
            res.status(201).json({
                message: service_type === 'service' ? 'Service request successful' : 'Checkin successful',
                checkin: {
                    chromebook_id,
                    student_id: student?.student_id || null,
                    student_name: student ? `${student.first_name} ${student.last_name}` : null,
                    checkin_date: getDatabaseTimestamp(),
                    condition,
                    new_status: newStatus,
                    service_type: service_type,
                    notes: responseNotes,
                    maintenance_required: condition !== 'good',
                    maintenanceRecordId: maintenanceRecordId || null
                }
            });

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ [Checkin] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process checkin'
        });
    }
});

// Get checkin history for a chromebook
router.get('/chromebook/:id/history', [
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

        const chromebookId = parseInt(req.params.id);

        const historyResult = await query(`
            SELECT
                ch.id,
                ch.action,
                ch.action_date,
                ch.notes,
                u.name as performed_by_name,
                u.email as performed_by_email,
                s.student_id,
                s.first_name,
                s.last_name,
                s.email as student_email
            FROM checkout_history ch
            LEFT JOIN users u ON ch.user_id = u.id
            LEFT JOIN students s ON ch.student_id = s.id
            WHERE ch.chromebook_id = $1::integer AND ch.action = $2::varchar
            ORDER BY ch.action_date DESC
        `, [chromebookId, 'checkin']);

        const history = historyResult.rows.map(row => ({
            id: row.id,
            action: row.action,
            timestamp: row.action_date,
            notes: row.notes,
            performedBy: {
                name: row.performed_by_name,
                email: row.performed_by_email
            },
            student: row.student_id ? {
                studentId: row.student_id,
                firstName: row.first_name,
                lastName: row.last_name,
                email: row.student_email
            } : null
        }));

        res.json({ history });

    } catch (error) {
        console.error('❌ [Get Checkin History] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch checkin history'
        });
    }
});

// Complete service maintenance (super-admin only)
router.post('/complete-service/:maintenanceId', [
    param('maintenanceId').isInt({ min: 1 }),
    authenticateToken,
    requireAdminOrAbove
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        // Only super-admins can complete service requests
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Only super-admins can complete service requests'
            });
        }

        const maintenanceId = parseInt(req.params.maintenanceId);

        if (SandboxStore.isActive(req.user.id)) {
            return res.status(200).json({
                message: 'Maintenance completed successfully (sandbox)',
                maintenance_id: maintenanceId,
                chromebook_id: `SBX_DEV_${Math.random().toString(36).slice(2,10)}`,
                asset_tag: 'SBX_DEV',
                completed_by: req.user.name,
                completed_at: new Date().toISOString()
            });
        }

        // Get maintenance record details
        const maintenanceResult = await query(
            `SELECT * FROM maintenance_records
             WHERE id = $1::integer AND service_type = 'service'`,
            [maintenanceId]
        );

        if (maintenanceResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Service maintenance record not found'
            });
        }

        const maintenanceRecord = maintenanceResult.rows[0];
        const chromebookId = maintenanceRecord.chromebook_id;
        const originalCheckoutInfo = maintenanceRecord.original_checkout_info;
        const originalStatus = maintenanceRecord.original_status;

        if (!originalCheckoutInfo) {
            return res.status(400).json({
                error: 'No original checkout information found for this service request'
            });
        }

        // Start transaction
        await query('BEGIN');

        try {
            // Restore device to original checkout state
            await query(
                `UPDATE chromebooks
                 SET status = $1::varchar,
                     current_user_id = $2::integer,
                     checked_out_date = $3::timestamp,
                     is_insured = $4::boolean,
                     insurance_status = $5::varchar,
                     in_service = false,
                     status_source = 'local',
                     status_override_date = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $6::integer`,
                [
                    originalStatus || 'checked_out',
                    originalCheckoutInfo.current_user_id,
                    originalCheckoutInfo.checked_out_date,
                    originalCheckoutInfo.is_insured,
                    originalCheckoutInfo.insurance_status,
                    chromebookId
                ]
            );

            // Mark maintenance record as completed
            await query(
                `UPDATE maintenance_records
                 SET status = 'completed',
                     completed_at = CURRENT_TIMESTAMP
                 WHERE id = $1::integer`,
                [maintenanceId]
            );

            // Create device history record
            await query(
                `INSERT INTO device_history (chromebook_id, user_id, event_type, details)
                 VALUES ($1, $2, 'Maintenance Completed', $3)`,
                [
                    chromebookId,
                    req.user.id,
                    {
                        admin_name: req.user.name,
                        admin_email: req.user.email,
                        service_completed: true,
                        maintenance_id: maintenanceId
                    }
                ]
            );

            await query('COMMIT');

            res.json({
                message: 'Service completed successfully',
                maintenanceId: maintenanceId,
                chromebookId: chromebookId,
                restoredToStatus: originalStatus || 'checked_out'
            });

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ [Complete Service] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to complete service request'
        });
    }
});

// Get recent checkins
router.get('/recent', authenticateToken, async (req: any, res: any) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;

        const recentCheckinsResult = await query(`
            SELECT
                ch.id,
                ch.action_date,
                ch.notes,
                c.asset_tag,
                c.serial_number,
                c.model,
                c.status as current_status,
                s.student_id,
                s.first_name,
                s.last_name,
                u.name as performed_by_name,
                u.email as performed_by_email
            FROM checkout_history ch
            JOIN chromebooks c ON ch.chromebook_id = c.id
            LEFT JOIN students s ON ch.student_id = s.id
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE ch.action = $1::varchar
            ORDER BY ch.action_date DESC
            LIMIT $2::integer
        `, ['checkin', limit]);

        const recentCheckins = recentCheckinsResult.rows.map(row => ({
            id: row.id,
            timestamp: row.action_date,
            notes: row.notes,
            chromebook: {
                assetTag: row.asset_tag,
                serialNumber: row.serial_number,
                model: row.model,
                currentStatus: row.current_status
            },
            student: row.student_id ? {
                studentId: row.student_id,
                firstName: row.first_name,
                lastName: row.last_name
            } : null,
            performedBy: {
                name: row.performed_by_name,
                email: row.performed_by_email
            }
        }));

        res.json({ recentCheckins });

    } catch (error) {
        console.error('❌ [Get Recent Checkins] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch recent checkins'
        });
    }
});

export { router as checkinRoutes };
