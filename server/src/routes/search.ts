import { Router } from 'express';
import { query } from '../database';
import { authenticateToken } from '../middleware/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const router = Router();
const execAsync = promisify(exec);

// Search intent detection
type SearchIntent = 'student' | 'device' | 'both';

function detectSearchIntent(searchQuery: string): SearchIntent {
    const trimmed = searchQuery.trim();

    // Device patterns
    if (/^NJESD/i.test(trimmed)) return 'device';            // NJESD (starts with NJESD)
    if (/^DCS\d+$/i.test(trimmed)) return 'device';          // DCS2514
    if (/^\d{4}$/.test(trimmed)) return 'device';            // 6123 (exactly 4 digits)
    if (/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{7}$/i.test(trimmed)) return 'device'; // ABC1234 (exactly 7 mixed alphanumeric)

    // Student patterns
    if (/^\d{6}$/.test(trimmed)) return 'student';           // 123456 (exactly 6 digits)
    if (/^[a-zA-Z\s'-]+$/.test(trimmed)) return 'student';   // Adam Johnson (names with spaces, apostrophes, hyphens)

    // Fallback for ambiguous cases
    return 'both';
}

// Track ongoing background syncs to prevent duplicates
const backgroundSyncs = new Map<string, Promise<void>>();

// Helper function to run Athena script
const runAthenaScript = async (scriptName: string, args: string[]): Promise<any> => {
    const athenaPath = path.join(process.cwd(), 'athena', 'scripts');
    const scriptPath = path.join(athenaPath, scriptName);
    const command = `cd ${athenaPath} && python3 ${scriptPath} ${args.map(arg => `"${arg}"`).join(' ')}`;

    try {
        const { stdout, stderr } = await execAsync(command);
        if (stderr) {
            console.warn(`⚠️ [Athena Script] ${scriptName} stderr:`, stderr);
        }
        return JSON.parse(stdout);
    } catch (error: any) {
        console.error(`❌ [Athena Script] ${scriptName} error:`, error);
        throw new Error(`Athena script failed: ${error.message}`);
    }
};

// Background sync function for students
const backgroundSyncStudents = async (searchQuery: string): Promise<void> => {
    const syncKey = `students_${searchQuery.toLowerCase().trim()}`;

    if (backgroundSyncs.has(syncKey)) {
        console.log(`🔄 [Background Sync] Student sync already in progress for: "${searchQuery}"`);
        return;
    }

    const syncPromise = (async () => {
        try {
            console.log(`☁️ [Background Sync] Starting student sync for: "${searchQuery}"`);

            const googleStudentResult = await runAthenaScript('search_student_live.py', [searchQuery]);

            if (googleStudentResult.success && googleStudentResult.data && googleStudentResult.data.length > 0) {
                console.log(`☁️ [Background Sync] Found ${googleStudentResult.data.length} Google students`);

                // Auto-populate/update students in database
                const insertPromises = googleStudentResult.data.map(async (student: any) => {
                    try {
                        // Upsert into google_users table
                        await query(
                            `INSERT INTO google_users (
                                google_id, primary_email, first_name, last_name, full_name,
                                org_unit_path, is_admin, is_suspended, student_id, creation_time, last_login_time
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                            ON CONFLICT (google_id) DO UPDATE SET
                                primary_email = EXCLUDED.primary_email,
                                first_name = EXCLUDED.first_name,
                                last_name = EXCLUDED.last_name,
                                full_name = EXCLUDED.full_name,
                                org_unit_path = EXCLUDED.org_unit_path,
                                is_admin = EXCLUDED.is_admin,
                                is_suspended = EXCLUDED.is_suspended,
                                student_id = EXCLUDED.student_id,
                                creation_time = EXCLUDED.creation_time,
                                last_login_time = EXCLUDED.last_login_time,
                                updated_at = CURRENT_TIMESTAMP`,
                            [
                                student.google_id, student.primary_email, student.first_name, student.last_name,
                                student.full_name, student.org_unit_path, student.is_admin, student.is_suspended,
                                student.student_id, student.creation_time, student.last_login_time
                            ]
                        );

                        // Upsert into students table if we have the required fields
                        if (student.student_id && student.first_name && student.last_name) {
                            await query(
                                `INSERT INTO students (student_id, first_name, last_name, email)
                                 VALUES ($1, $2, $3, $4)
                                 ON CONFLICT (student_id) DO UPDATE SET
                                     first_name = EXCLUDED.first_name,
                                     last_name = EXCLUDED.last_name,
                                     email = EXCLUDED.email,
                                     updated_at = CURRENT_TIMESTAMP`,
                                [student.student_id, student.first_name, student.last_name, student.primary_email]
                            );
                        }

                        console.log(`👥 [Background Sync] Updated student: ${student.full_name} (${student.student_id})`);
                    } catch (error) {
                        console.error(`❌ [Background Sync] Failed to update student record:`, error);
                    }
                });

                await Promise.all(insertPromises);
                console.log(`✅ [Background Sync] Student sync completed for: "${searchQuery}"`);
            } else {
                console.log(`☁️ [Background Sync] No Google students found for: "${searchQuery}"`);
            }
        } catch (error) {
            console.error(`❌ [Background Sync] Student sync failed for "${searchQuery}":`, error);
        }
    })();

    backgroundSyncs.set(syncKey, syncPromise);

    try {
        await syncPromise;
    } finally {
        backgroundSyncs.delete(syncKey);
    }
};

// Background sync function for devices
const backgroundSyncDevices = async (searchQuery: string): Promise<void> => {
    const syncKey = `devices_${searchQuery.toLowerCase().trim()}`;

    if (backgroundSyncs.has(syncKey)) {
        console.log(`🔄 [Background Sync] Device sync already in progress for: "${searchQuery}"`);
        return;
    }

    const syncPromise = (async () => {
        try {
            console.log(`☁️ [Background Sync] Starting device sync for: "${searchQuery}"`);

            const googleDeviceResult = await runAthenaScript('search_device_live.py', [searchQuery]);

            if (googleDeviceResult.success && googleDeviceResult.data && googleDeviceResult.data.length > 0) {
                console.log(`☁️ [Background Sync] Found ${googleDeviceResult.data.length} Google devices`);

                // Auto-populate/update devices in database
                const insertPromises = googleDeviceResult.data.map(async (device: any) => {
                    try {
                        // Check if device exists and has protected status
                        const existingDeviceResult = await query(
                            'SELECT status, current_user_id, checked_out_date FROM chromebooks WHERE serial_number = $1',
                            [device.serial_number]
                        );

                        const existingDevice = existingDeviceResult.rows[0];
                        const protectedStatuses = ['checked_out', 'pending_signature'];
                        const newStatus = device.status === 'ACTIVE' ? 'available' : 'disabled';

                        // Determine if we should protect the status
                        const shouldProtectStatus = existingDevice && protectedStatuses.includes(existingDevice.status);

                        if (shouldProtectStatus) {
                            console.log(`🔒 [Background Sync] Protecting status for device ${device.annotated_asset_id || device.serial_number} (status: ${existingDevice.status})`);

                            // Update device without changing status or checkout-related fields
                            await query(
                                `UPDATE chromebooks SET
                                    asset_tag = $1,
                                    model = $2,
                                    org_unit = $3,
                                    notes = $4,
                                    device_id = $5,
                                    annotated_user = $6,
                                    annotated_asset_id = $7,
                                    org_unit_path = $8,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE serial_number = $9`,
                                [
                                    device.annotated_asset_id || device.serial_number,
                                    device.model || 'Unknown',
                                    device.org_unit_path || '/',
                                    device.notes || '',
                                    device.device_id,
                                    device.annotated_user,
                                    device.annotated_asset_id,
                                    device.org_unit_path,
                                    device.serial_number
                                ]
                            );
                        } else {
                            // Normal upsert for devices that don't need status protection
                            await query(
                                `INSERT INTO chromebooks (
                                    asset_tag, serial_number, model, status, org_unit, notes, device_id,
                                    annotated_user, annotated_asset_id, org_unit_path
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                ON CONFLICT (serial_number) DO UPDATE SET
                                    asset_tag = EXCLUDED.asset_tag,
                                    model = EXCLUDED.model,
                                    status = EXCLUDED.status,
                                    org_unit = EXCLUDED.org_unit,
                                    notes = EXCLUDED.notes,
                                    device_id = EXCLUDED.device_id,
                                    annotated_user = EXCLUDED.annotated_user,
                                    annotated_asset_id = EXCLUDED.annotated_asset_id,
                                    org_unit_path = EXCLUDED.org_unit_path,
                                    updated_at = CURRENT_TIMESTAMP`,
                                [
                                    device.annotated_asset_id || device.serial_number,
                                    device.serial_number,
                                    device.model || 'Unknown',
                                    newStatus,
                                    device.org_unit_path || '/',
                                    device.notes || '',
                                    device.device_id,
                                    device.annotated_user,
                                    device.annotated_asset_id,
                                    device.org_unit_path
                                ]
                            );
                        }

                        console.log(`💻 [Background Sync] Updated device: ${device.annotated_asset_id || device.serial_number} (${device.model})`);
                    } catch (error) {
                        console.error(`❌ [Background Sync] Failed to update device record for ${device.serial_number}:`, error);
                    }
                });

                await Promise.all(insertPromises);
                console.log(`✅ [Background Sync] Device sync completed for: "${searchQuery}"`);
            } else {
                console.log(`☁️ [Background Sync] No Google devices found for: "${searchQuery}"`);
            }
        } catch (error) {
            console.error(`❌ [Background Sync] Device sync failed for "${searchQuery}":`, error);
        }
    })();

    backgroundSyncs.set(syncKey, syncPromise);

    try {
        await syncPromise;
    } finally {
        backgroundSyncs.delete(syncKey);
    }
};

// Enhanced Unified Search Endpoint with Page Context Support
router.get('/', authenticateToken, async (req: any, res: any) => {
    const { q, context, limit } = req.query;

    if (typeof q !== 'string' || q.length < 3) {
        return res.status(400).json({ message: 'Query must be at least 3 characters long.' });
    }

    try {
        const searchIntent = detectSearchIntent(q);
        const pageContext = context || 'global'; // 'global', 'users', 'chromebooks', 'checkout'
        const resultLimit = parseInt(limit as string) || (pageContext === 'global' ? 20 : 50);

        console.log(`🔍 [Unified Search] Starting search for: "${q}" (intent: ${searchIntent}, context: ${pageContext})`);

        // PHASE 1: Return local results immediately
        console.log(`⚡ [Phase 1] Fetching local results instantly...`);

        // Search local users (enhanced for different contexts)
        let userQuery = `
            SELECT *
            FROM google_users
            WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR full_name ILIKE $1 OR primary_email ILIKE $1
        `;

        // Add student-specific search for checkout context
        if (pageContext === 'checkout' || searchIntent === 'student') {
            userQuery += ` OR student_id ILIKE $1`;
        }

        userQuery += ` ORDER BY
            CASE
                WHEN student_id ILIKE $2 THEN 1
                WHEN full_name ILIKE $2 THEN 2
                WHEN primary_email ILIKE $2 THEN 3
                ELSE 4
            END
            LIMIT $3`;

        const userResults = await query(userQuery, [`%${q}%`, `${q}%`, resultLimit]);

        // Search local students from students table (for checkout context)
        let localStudents: any[] = [];
        if (pageContext === 'checkout' || searchIntent === 'student') {
            const studentQuery = `
                SELECT
                    id,
                    student_id,
                    first_name,
                    last_name,
                    email,
                    grade_level,
                    created_at,
                    'local' as source
                FROM students
                WHERE
                    student_id ILIKE $1 OR
                    first_name ILIKE $1 OR
                    last_name ILIKE $1 OR
                    email ILIKE $1 OR
                    (first_name || ' ' || last_name) ILIKE $1
                ORDER BY
                    CASE
                        WHEN student_id ILIKE $2 THEN 1
                        WHEN first_name ILIKE $2 OR last_name ILIKE $2 THEN 2
                        WHEN email ILIKE $2 THEN 3
                        ELSE 4
                    END,
                    last_name, first_name
                LIMIT $3
            `;
            const studentResults = await query(studentQuery, [`%${q}%`, `${q}%`, resultLimit]);
            localStudents = studentResults.rows.map(row => ({
                id: row.id,
                studentId: row.student_id,
                firstName: row.first_name,
                lastName: row.last_name,
                email: row.email,
                gradeLevel: row.grade_level,
                fullName: `${row.first_name} ${row.last_name}`,
                createdAt: row.created_at,
                source: 'local'
            }));
        }

        // Search local devices
        const deviceQuery = `
            SELECT id, asset_tag, serial_number, model, org_unit, status, current_user_id,
                   checked_out_date, is_insured, notes, annotated_user, org_unit_path
            FROM chromebooks
            WHERE asset_tag ILIKE $1 OR serial_number ILIKE $1 OR model ILIKE $1
            ORDER BY
                CASE
                    WHEN asset_tag ILIKE $2 THEN 1
                    WHEN serial_number ILIKE $2 THEN 2
                    WHEN model ILIKE $2 THEN 3
                    ELSE 4
                END
            LIMIT $3
        `;
        const deviceResults = await query(deviceQuery, [`%${q}%`, `${q}%`, resultLimit]);

        const devices = deviceResults.rows.map(row => ({
            id: row.id,
            assetTag: row.asset_tag,
            serialNumber: row.serial_number,
            model: row.model,
            orgUnit: row.org_unit,
            status: row.status,
            currentUserId: row.current_user_id,
            checkedOutDate: row.checked_out_date,
            isInsured: row.is_insured,
            notes: row.notes,
            annotatedUser: row.annotated_user,
            orgUnitPath: row.org_unit_path,
            source: 'local'
        }));

        console.log(`⚡ [Phase 1] Found ${userResults.rows.length} users, ${localStudents.length} students, ${devices.length} devices locally`);

        // PHASE 2: Start background sync (non-blocking)
        console.log(`🔄 [Phase 2] Starting background sync...`);

        // Start background syncs based on search intent and context
        const shouldSyncStudents = (searchIntent === 'student' || searchIntent === 'both') || pageContext === 'checkout';
        const shouldSyncDevices = (searchIntent === 'device' || searchIntent === 'both') || pageContext === 'chromebooks';

        if (shouldSyncStudents) {
            backgroundSyncStudents(q).catch(error => {
                console.error(`❌ [Background Sync] Student sync error:`, error);
            });
        }

        if (shouldSyncDevices) {
            backgroundSyncDevices(q).catch(error => {
                console.error(`❌ [Background Sync] Device sync error:`, error);
            });
        }

        // Transform users to match expected format
        const transformedUsers = userResults.rows.map(user => ({
            id: user.id || user.google_id,
            primaryEmail: user.primary_email,
            name: {
                fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
                givenName: user.first_name,
                familyName: user.last_name
            },
            orgUnitPath: user.org_unit_path,
            suspended: user.is_suspended || false,
            isAdmin: user.is_admin || false,
            lastLoginTime: user.last_login_time,
            creationTime: user.creation_time,
            student_id: user.student_id,
            updatedAt: user.updated_at,
            createdAt: user.created_at
        }));

        // Return immediate results with sync status
        return res.json({
            users: transformedUsers,
            students: localStudents, // Separate students array for checkout context
            devices: devices,
            metadata: {
                searchQuery: q,
                searchIntent,
                pageContext,
                localUserCount: transformedUsers.length,
                localStudentCount: localStudents.length,
                localDeviceCount: devices.length,
                syncInProgress: shouldSyncStudents || shouldSyncDevices,
                syncStudents: shouldSyncStudents,
                syncDevices: shouldSyncDevices,
                source: 'instant'
            }
        });

    } catch (error) {
        console.error('❌ [Unified Search] Search failed:', error);
        return res.status(500).json({ message: 'An error occurred during the search.' });
    }
});

export default router;
