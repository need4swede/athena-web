import { Pool, PoolClient } from 'pg';
import { formatTimeAgo, getDatabaseTimestamp } from './utils/timezone';

export interface DatabaseUser {
    id: number;
    email: string;
    name: string;
    role: 'super_admin' | 'admin' | 'user';
    provider?: string | null;
    last_login?: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateOrUpdateUserOptions {
    role?: 'super_admin' | 'admin' | 'user';
    provider?: string | null;
}

export interface AeriesPermissions {
    user_id: number;
    aeries_enabled: boolean;
    can_access_school_data: boolean;
    can_access_student_data: boolean;
    can_view_student_overview: boolean;
    can_view_contact_info: boolean;
    can_view_address_info: boolean;
    can_view_emergency_contacts: boolean;
    can_view_academic_info: boolean;
    can_view_personal_info: boolean;
    can_view_test_records: boolean;
    can_view_programs: boolean;
    can_view_picture: boolean;
    can_view_groups: boolean;
    can_view_fines: boolean;
    can_view_disciplinary_records: boolean;
    created_at: string;
    updated_at: string;
}

export interface DatabaseChromebook {
    id: number;
    asset_tag: string;
    serial_number: string;
    model: string;
    org_unit: string;
    status: 'available' | 'checked_out' | 'maintenance' | 'deprovisioned' | 'disabled' | 'retired' | 'pending_signature';
    current_user_id?: number;
    checked_out_date?: string;
    is_insured: boolean;
    assigned_location?: string;
    // Google Admin specific fields
    device_id?: string;
    last_sync?: string;
    platform_version?: string;
    os_version?: string;
    firmware_version?: string;
    mac_address?: string;
    last_known_network?: any;
    last_known_user?: string;
    // New Google API fields
    annotated_user?: string;
    annotated_asset_id?: string;
    recent_users?: any;
    org_unit_path?: string;
    // Additional Google API fields from updated implementation
    notes?: string;
    boot_mode?: string;
    last_enrollment_time?: string;
    support_end_date?: string;
    order_number?: string;
    will_auto_renew?: boolean;
    meid?: string;
    etag?: string;
    active_time_ranges?: any;
    cpu_status_reports?: any;
    disk_volume_reports?: any;
    system_ram_total?: number;
    system_ram_free_reports?: any;
    created_at: string;
    updated_at: string;
}

export interface GoogleUser {
    id: number;
    google_id: string;
    primary_email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    org_unit_path: string;
    is_admin: boolean;
    is_suspended: boolean;
    student_id: string;
    creation_time: string;
    last_login_time: string;
    created_at: string;
    updated_at: string;
}

// Database connection pool
export let pool: Pool | null = null;

// Initialize database connection
export async function connectToDatabase(): Promise<boolean> {
    try {
        if (pool) {
            return true; // Already connected
        }

        pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'chromebook_library',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 6000,
        });

        // Test the connection
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();

        console.log('✅ Connected to PostgreSQL database');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

// Generic query function
export async function query(text: string, params: any[] = []): Promise<{ rows: any[] }> {
    if (!pool) {
        await connectToDatabase();
    }

    if (!pool) {
        throw new Error('Database connection not available');
    }

    try {
        const result = await pool.query(text, params);
        return { rows: result.rows };
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// Check if this is the first user in the system
export async function isFirstUser(): Promise<boolean> {
    try {
        const result = await query('SELECT COUNT(*) as count FROM users');
        const count = parseInt(result.rows[0].count);
        return count === 0;
    } catch (error) {
        console.error('Error checking if first user:', error);
        return false;
    }
}

// User management functions
export async function createOrUpdateUser(
    email: string,
    name: string,
    options: CreateOrUpdateUserOptions = {}
): Promise<DatabaseUser> {
    const { role, provider } = options;
    console.log('💾 [createOrUpdateUser] Called with:', { email, name, role, provider });

    try {
        // Check if user exists
        const existingUserResult = await query('SELECT * FROM users WHERE email = $1', [email]);

        if (existingUserResult.rows.length > 0) {
            // Update existing user
            const updateResult = await query(
                'UPDATE users SET name = $1, provider = COALESCE($3, provider), last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING *',
                [name, email, provider ?? null]
            );
            console.log('💾 [createOrUpdateUser] Updated existing user:', updateResult.rows[0]);
            return updateResult.rows[0];
        } else {
            // Determine role for new user
            let userRole: 'super_admin' | 'admin' | 'user' = role || 'user';

            // If this is the first user, make them super_admin
            if (await isFirstUser()) {
                userRole = 'super_admin';
            }

            // Create new user
            const insertResult = await query(
                'INSERT INTO users (email, name, role, provider, last_login) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *',
                [email, name, userRole, provider ?? null]
            );
            console.log('💾 [createOrUpdateUser] Created new user:', insertResult.rows[0]);
            return insertResult.rows[0];
        }
    } catch (error) {
        console.error('💾 [createOrUpdateUser] Error:', error);
        throw error;
    }
}

export async function getUserByEmail(email: string): Promise<DatabaseUser | null> {
    try {
        const result = await query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('Error getting user by email:', error);
        return null;
    }
}

export async function getUserById(id: number): Promise<DatabaseUser | null> {
    try {
        const result = await query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('Error getting user by ID:', error);
        return null;
    }
}

export async function getAllUsers(): Promise<DatabaseUser[]> {
    try {
        const result = await query('SELECT * FROM users ORDER BY created_at DESC');
        return result.rows;
    } catch (error) {
        console.error('Error getting all users:', error);
        return [];
    }
}

export async function updateUserRole(userId: number, role: 'super_admin' | 'admin' | 'user'): Promise<DatabaseUser | null> {
    try {
        const result = await query(
            'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [role, userId]
        );
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('Error updating user role:', error);
        return null;
    }
}

// Legacy function for backward compatibility - converts boolean to role
export async function updateUserAdminStatus(userId: number, isAdmin: boolean): Promise<DatabaseUser | null> {
    const role = isAdmin ? 'admin' : 'user';
    return updateUserRole(userId, role);
}

// ----- Aeries permissions -----
export async function getAeriesPermissions(userId: number): Promise<AeriesPermissions | null> {
    try {
        const result = await query('SELECT * FROM aeries_permissions WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) return null;
        return result.rows[0] as AeriesPermissions;
    } catch (error) {
        console.error('Error fetching Aeries permissions:', error);
        return null;
    }
}

export type AeriesPermissionsUpdate = Partial<Pick<AeriesPermissions,
    'aeries_enabled' |
    'can_access_school_data' |
    'can_access_student_data' |
    'can_view_student_overview' |
    'can_view_contact_info' |
    'can_view_address_info' |
    'can_view_emergency_contacts' |
    'can_view_academic_info' |
    'can_view_personal_info' |
    'can_view_test_records' |
    'can_view_programs' |
    'can_view_picture' |
    'can_view_groups' |
    'can_view_fines' |
    'can_view_disciplinary_records'
>>;

export async function upsertAeriesPermissions(userId: number, updates: AeriesPermissionsUpdate): Promise<AeriesPermissions> {
    // Build dynamic SET clause for updates while keeping it safe
    const allowedKeys: (keyof AeriesPermissionsUpdate)[] = [
        'aeries_enabled',
        'can_access_school_data',
        'can_access_student_data',
        'can_view_student_overview',
        'can_view_contact_info',
        'can_view_address_info',
        'can_view_emergency_contacts',
        'can_view_academic_info',
        'can_view_personal_info',
        'can_view_test_records',
        'can_view_programs',
        'can_view_picture',
        'can_view_groups',
        'can_view_fines',
        'can_view_disciplinary_records',
    ];

    const keys = Object.keys(updates).filter(k => allowedKeys.includes(k as any)) as (keyof AeriesPermissionsUpdate)[];

    // If nothing to update, ensure row exists and return current/defaults (all false)
    if (keys.length === 0) {
        const ensure = await query(
            `INSERT INTO aeries_permissions (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING
             RETURNING *`,
            [userId]
        );
        if (ensure.rows.length > 0) return ensure.rows[0] as AeriesPermissions;
        const current = await query('SELECT * FROM aeries_permissions WHERE user_id = $1', [userId]);
        return (current.rows[0] || null) as AeriesPermissions;
    }

    const setFragments: string[] = [];
    const params: any[] = [userId];
    keys.forEach((key, idx) => {
        setFragments.push(`${key} = $${idx + 2}`);
        params.push((updates as any)[key]);
    });

    const sql = `
        INSERT INTO aeries_permissions (user_id, ${keys.join(', ')})
        VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
        ON CONFLICT (user_id) DO UPDATE SET
            ${setFragments.join(', ')},
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;

    const res = await query(sql, params);
    return res.rows[0] as AeriesPermissions;
}

// Google Users functions
export async function getAllGoogleUsers(): Promise<GoogleUser[]> {
    try {
        const result = await query(`
            SELECT
                gu.*,
                s.id as student_db_id
            FROM google_users gu
            LEFT JOIN students s ON gu.student_id = s.student_id
            ORDER BY gu.full_name
        `);
        return result.rows;
    } catch (error) {
        console.error('Error getting all Google users:', error);
        return [];
    }
}

// Chromebook management functions
export async function getAllChromebooks(): Promise<any[]> {
    try {
        const result = await query(`
            SELECT
                c.*,
                s.student_id,
                s.first_name,
                s.last_name,
                s.email as student_email,
                s.grade_level
            FROM chromebooks c
            LEFT JOIN students s ON c.current_user_id = s.id
            ORDER BY c.asset_tag
        `);

        // Transform the result to include student information in the expected format
        return result.rows.map(row => {

            return {
                ...row,
                currentUser: row.current_user_id ? {
                    id: row.current_user_id,
                    studentId: row.student_id,
                    firstName: row.first_name,
                    lastName: row.last_name,
                    email: row.student_email,
                    gradeLevel: row.grade_level
                } : null,
                // Add insurance status for better display logic
                insurance_status: row.insurance_status || row.history_insurance_status || (row.is_insured ? 'insured' : 'uninsured')
            };
        });
    } catch (error) {
        console.error('Error getting all chromebooks:', error);
        return [];
    }
}

export async function getChromebookById(id: number): Promise<any | null> {
    try {
        const result = await query(`
            SELECT
                c.*,
                s.student_id,
                s.first_name,
                s.last_name,
                s.email as student_email,
                s.grade_level,
                ch.insurance as history_insurance_status
            FROM chromebooks c
            LEFT JOIN students s ON c.current_user_id = s.id
            LEFT JOIN checkout_history ch ON ch.chromebook_id = c.id
                AND ch.action = 'checkout'
                AND ch.action_date = (
                    SELECT MAX(action_date)
                    FROM checkout_history
                    WHERE chromebook_id = c.id AND action = 'checkout'
                )
            WHERE c.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];

        // Get maintenance history
        const maintenanceHistoryResult = await query(`
            SELECT
                mr.id,
                mr.issue_description,
                mr.status,
                mr.created_at,
                mr.completed_at,
                u.name as reported_by,
                mc.comment,
                mc.created_at as comment_date,
                mcu.name as comment_author
            FROM maintenance_records mr
            LEFT JOIN users u ON mr.user_id = u.id
            LEFT JOIN maintenance_comments mc ON mc.maintenance_id = mr.id
            LEFT JOIN users mcu ON mc.user_id = mcu.id
            WHERE mr.chromebook_id = $1
            ORDER BY mr.created_at DESC, mc.created_at ASC
        `, [id]);

        const maintenanceHistory = maintenanceHistoryResult.rows.reduce((acc: any[], record: any) => {
            let maintenanceRecord = acc.find((r: any) => r.id === record.id);
            if (!maintenanceRecord) {
                maintenanceRecord = {
                    id: record.id,
                    issue: record.issue_description,
                    status: record.status,
                    reportedDate: record.created_at,
                    completedDate: record.completed_at,
                    reportedBy: record.reported_by,
                    comments: []
                };
                acc.push(maintenanceRecord);
            }
            if (record.comment) {
                maintenanceRecord.comments.push({
                    text: record.comment,
                    author: record.comment_author,
                    date: record.comment_date
                });
            }
            return acc;
        }, []);

        return {
            ...row,
            currentUser: row.student_id ? {
                id: row.current_user_id,
                studentId: row.student_id,
                firstName: row.first_name,
                lastName: row.last_name,
                email: row.student_email,
                gradeLevel: row.grade_level
            } : null,
            insurance_status: row.insurance_status || row.history_insurance_status || (row.is_insured ? 'insured' : 'uninsured'),
            maintenanceHistory
        };
    } catch (error) {
        console.error('Error getting chromebook by ID:', error);
        return null;
    }
}

export async function createChromebook(chromebook: Omit<DatabaseChromebook, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseChromebook> {
    try {
        const result = await query(
            `INSERT INTO chromebooks (asset_tag, serial_number, model, org_unit, status, is_insured, assigned_location,
             device_id, last_sync, platform_version, os_version, firmware_version, mac_address,
             last_known_network, last_known_user, annotated_user, annotated_asset_id, recent_users, org_unit_path,
             notes, boot_mode, last_enrollment_time, support_end_date, order_number, will_auto_renew, meid, etag,
             active_time_ranges, cpu_status_reports, disk_volume_reports, system_ram_total, system_ram_free_reports)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32) RETURNING *`,
            [
                chromebook.asset_tag,
                chromebook.serial_number,
                chromebook.model,
                chromebook.org_unit,
                chromebook.status,
                chromebook.is_insured,
                chromebook.assigned_location,
                chromebook.device_id,
                chromebook.last_sync,
                chromebook.platform_version,
                chromebook.os_version,
                chromebook.firmware_version,
                chromebook.mac_address,
                chromebook.last_known_network ? JSON.stringify(chromebook.last_known_network) : null,
                chromebook.last_known_user,
                chromebook.annotated_user,
                chromebook.annotated_asset_id,
                chromebook.recent_users ? JSON.stringify(chromebook.recent_users) : null,
                chromebook.org_unit_path,
                chromebook.notes,
                chromebook.boot_mode,
                chromebook.last_enrollment_time,
                chromebook.support_end_date,
                chromebook.order_number,
                chromebook.will_auto_renew,
                chromebook.meid,
                chromebook.etag,
                chromebook.active_time_ranges ? JSON.stringify(chromebook.active_time_ranges) : null,
                chromebook.cpu_status_reports ? JSON.stringify(chromebook.cpu_status_reports) : null,
                chromebook.disk_volume_reports ? JSON.stringify(chromebook.disk_volume_reports) : null,
                chromebook.system_ram_total,
                chromebook.system_ram_free_reports ? JSON.stringify(chromebook.system_ram_free_reports) : null
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error creating chromebook:', error);
        throw error;
    }
}

export async function upsertChromebook(chromebook: Omit<DatabaseChromebook, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseChromebook> {
    try {
        const result = await query(
            `INSERT INTO chromebooks (asset_tag, serial_number, model, org_unit, status, is_insured, assigned_location,
             device_id, last_sync, platform_version, os_version, firmware_version, mac_address,
             last_known_network, last_known_user, annotated_user, annotated_asset_id, recent_users, org_unit_path,
             notes, boot_mode, last_enrollment_time, support_end_date, order_number, will_auto_renew, meid, etag,
             active_time_ranges, cpu_status_reports, disk_volume_reports, system_ram_total, system_ram_free_reports,
             status_source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, 'google')
             ON CONFLICT (asset_tag) DO UPDATE SET
                serial_number = EXCLUDED.serial_number,
                model = EXCLUDED.model,
                org_unit = EXCLUDED.org_unit,
                -- Only update status if current status_source is 'google' or null
                status = CASE
                    WHEN chromebooks.status_source = 'local' THEN chromebooks.status
                    ELSE EXCLUDED.status
                END,
                is_insured = COALESCE(EXCLUDED.is_insured, chromebooks.is_insured),
                -- Only update status_source if we're actually updating the status
                status_source = CASE
                    WHEN chromebooks.status_source = 'local' THEN chromebooks.status_source
                    ELSE 'google'
                END,
                device_id = EXCLUDED.device_id,
                last_sync = EXCLUDED.last_sync,
                platform_version = EXCLUDED.platform_version,
                os_version = EXCLUDED.os_version,
                firmware_version = EXCLUDED.firmware_version,
                mac_address = EXCLUDED.mac_address,
                last_known_network = EXCLUDED.last_known_network,
                last_known_user = EXCLUDED.last_known_user,
                annotated_user = EXCLUDED.annotated_user,
                annotated_asset_id = EXCLUDED.annotated_asset_id,
                recent_users = EXCLUDED.recent_users,
                org_unit_path = EXCLUDED.org_unit_path,
                notes = EXCLUDED.notes,
                boot_mode = EXCLUDED.boot_mode,
                last_enrollment_time = EXCLUDED.last_enrollment_time,
                support_end_date = EXCLUDED.support_end_date,
                order_number = EXCLUDED.order_number,
                will_auto_renew = EXCLUDED.will_auto_renew,
                meid = EXCLUDED.meid,
                etag = EXCLUDED.etag,
                active_time_ranges = EXCLUDED.active_time_ranges,
                cpu_status_reports = EXCLUDED.cpu_status_reports,
                disk_volume_reports = EXCLUDED.disk_volume_reports,
                system_ram_total = EXCLUDED.system_ram_total,
                system_ram_free_reports = EXCLUDED.system_ram_free_reports,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                chromebook.asset_tag,
                chromebook.serial_number,
                chromebook.model,
                chromebook.org_unit,
                chromebook.status,
                chromebook.is_insured,
                chromebook.assigned_location,
                chromebook.device_id,
                chromebook.last_sync,
                chromebook.platform_version,
                chromebook.os_version,
                chromebook.firmware_version,
                chromebook.mac_address,
                chromebook.last_known_network ? JSON.stringify(chromebook.last_known_network) : null,
                chromebook.last_known_user,
                chromebook.annotated_user,
                chromebook.annotated_asset_id,
                chromebook.recent_users ? JSON.stringify(chromebook.recent_users) : null,
                chromebook.org_unit_path,
                chromebook.notes,
                chromebook.boot_mode,
                chromebook.last_enrollment_time,
                chromebook.support_end_date,
                chromebook.order_number,
                chromebook.will_auto_renew,
                chromebook.meid,
                chromebook.etag,
                chromebook.active_time_ranges ? JSON.stringify(chromebook.active_time_ranges) : null,
                chromebook.cpu_status_reports ? JSON.stringify(chromebook.cpu_status_reports) : null,
                chromebook.disk_volume_reports ? JSON.stringify(chromebook.disk_volume_reports) : null,
                chromebook.system_ram_total,
                chromebook.system_ram_free_reports ? JSON.stringify(chromebook.system_ram_free_reports) : null
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error upserting chromebook:', error);
        throw error;
    }
}

export async function updateChromebook(id: number, updates: Partial<DatabaseChromebook>): Promise<DatabaseChromebook | null> {
    try {
        const setClause = Object.keys(updates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');

        const values = [id, ...Object.values(updates)];

        const result = await query(
            `UPDATE chromebooks SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            values
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('Error updating chromebook:', error);
        return null;
    }
}

// Statistics functions
export async function getDashboardStats() {
    try {
        const chromebooks = await getAllChromebooks();

        // Get comprehensive insured count using the same logic as the insured devices modal
        const insuredCountResult = await query(`
            SELECT COUNT(*) as count
            FROM chromebooks c
            JOIN students s ON c.current_user_id = s.id
            LEFT JOIN checkout_history ch ON ch.chromebook_id = c.id AND ch.action = 'checkout' AND ch.action_date = (
                SELECT MAX(action_date) FROM checkout_history WHERE chromebook_id = c.id AND action = 'checkout'
            )
            WHERE c.status IN ('checked_out', 'pending_signature')
            AND (c.insurance_status = 'insured' OR c.insurance_status = 'pending' OR ch.insurance = 'insured' OR ch.insurance = 'pending')
        `);

        const insuredCount = parseInt(insuredCountResult.rows[0]?.count || 0);

        return {
            totalChromebooks: chromebooks.length,
            available: chromebooks.filter(c => c.status === 'available').length,
            checkedOut: chromebooks.filter(c => c.status === 'checked_out').length,
            maintenance: chromebooks.filter(c => c.status === 'maintenance').length,
            pending: chromebooks.filter(c => c.status === 'pending_signature').length,
            insured: insuredCount,
            overdue: 0 // Would need checkout records to calculate this
        };
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        return {
            totalChromebooks: 0,
            available: 0,
            checkedOut: 0,
            maintenance: 0,
            insured: 0,
            overdue: 0,
            pending: 0
        };
    }
}

export async function getRecentActivity() {
    try {
        const result = await query(`
            SELECT
                ch.action,
                ch.action_date,
                u.name as user_name,
                s.first_name || ' ' || s.last_name as student_name,
                s.student_id,
                cb.asset_tag
            FROM checkout_history ch
            LEFT JOIN users u ON ch.user_id = u.id
            LEFT JOIN students s ON ch.student_id = s.id
            LEFT JOIN chromebooks cb ON ch.chromebook_id = cb.id
            ORDER BY ch.action_date DESC
            LIMIT 10
        `);

        return result.rows.map(row => ({
            action: `Chromebook ${row.asset_tag} ${row.action === 'checkout' ? 'checked out to' : 'returned by'}`,
            user: row.student_name ? `${row.student_name} (ID: ${row.student_id})` : row.user_name,
            time: formatTimeAgo(new Date(row.action_date)),
            type: row.action as 'checkout' | 'checkin'
        }));
    } catch (error) {
        console.error('Error getting recent activity:', error);
        return [];
    }
}

// User activity tracking
export async function getUserLoginActivity(): Promise<Array<{
    user_id: number;
    user_name: string;
    user_email: string;
    is_admin: boolean;
    last_login: string;
    login_count: number;
    created_at: string;
}>> {
    try {
        // For now, we'll return basic user info since we don't have login tracking yet
        // In the future, you could add a user_sessions table to track actual login activity
        const result = await query(`
            SELECT
                id as user_id,
                name as user_name,
                email as user_email,
                (role = 'admin' OR role = 'super_admin') as is_admin,
                updated_at as last_login,
                1 as login_count,
                created_at
            FROM users
            ORDER BY updated_at DESC
        `);

        return result.rows;
    } catch (error) {
        console.error('Error getting user login activity:', error);
        return [];
    }
}

// Close database connection
export async function closeDatabase(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('🔌 Database connection closed');
    }
}
