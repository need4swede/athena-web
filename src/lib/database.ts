// Frontend API client for backend server
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface DatabaseUser {
    id: number;
    email: string;
    name: string;
    role: 'super_admin' | 'admin' | 'user';
    created_at: string;
    updated_at: string;
}

// Admin application user (from /api/admin/users)
export interface AdminUserSummary {
    id: number;
    name: string;
    email: string;
    role: 'super_admin' | 'admin' | 'user';
    isAdmin: boolean;
    isSuperAdmin: boolean;
    createdAt: string;
    updatedAt: string;
    provider?: string | null;
    avatar?: string | null;
}

export interface AeriesPermissionsDto {
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
    created_at: string | null;
    updated_at: string | null;
}

export interface DatabaseChromebook {
    id: number;
    asset_tag: string;
    serial_number: string;
    model: string;
    status: 'available' | 'checked_out' | 'maintenance' | 'deprovisioned' | 'disabled';
    condition: 'excellent' | 'good' | 'fair' | 'poor';
    purchase_date: string;
    warranty_expiry: string;
    is_insured: boolean;
    location: string;
    notes: string;
    created_at: string;
    updated_at: string;
}

// Helper function to get auth token
function getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
}

// Helper function to make authenticated API requests
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = getAuthToken();

    const config: RequestInit = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
        },
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

// Initialize database connection (no-op for frontend)
export async function connectToDatabase(): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json().catch(() => null);
        if (!body || body.status !== 'OK') throw new Error('Unexpected health payload');
        console.log('✅ Connected to backend API');
        return true;
    } catch (error) {
        console.error('❌ Backend API connection failed:', error);
        return false;
    }
}

// Check if this is the first user in the system
export async function isFirstUser(): Promise<boolean> {
    try {
        const users = await getAllUsers();
        return users.length === 0;
    } catch (error) {
        console.error('Error checking if first user:', error);
        return false;
    }
}

// User management functions
export async function createOrUpdateUser(email: string, name: string): Promise<DatabaseUser> {
    console.log('💾 [createOrUpdateUser] Called with:', { email, name });

    try {
        const response = await apiRequest('/auth/sso-login', {
            method: 'POST',
            body: JSON.stringify({
                email,
                name,
                provider: 'microsoft',
                avatar: null
            }),
        });

        // Store the token
        if (response.token) {
            localStorage.setItem('auth_token', response.token);
        }

        console.log('💾 [createOrUpdateUser] Success:', response.user);
        return response.user;
    } catch (error) {
        console.error('💾 [createOrUpdateUser] Error:', error);
        throw error;
    }
}

export async function getUserByEmail(email: string): Promise<DatabaseUser | null> {
    try {
        const users = await getAllUsers();
        return users.find(user => user.email === email) || null;
    } catch (error) {
        console.error('Error getting user by email:', error);
        return null;
    }
}

export async function getUserById(id: number): Promise<DatabaseUser | null> {
    try {
        const users = await getAllUsers();
        return users.find(user => user.id === id) || null;
    } catch (error) {
        console.error('Error getting user by ID:', error);
        return null;
    }
}

export async function getAllUsers(): Promise<DatabaseUser[]> {
    try {
        return await apiRequest('/users');
    } catch (error) {
        console.error('Error getting all users:', error);
        return [];
    }
}

// Admin: fetch application users (super-admin only)
export async function getAdminUsers(): Promise<AdminUserSummary[]> {
    try {
        return await apiRequest('/admin/users');
    } catch (error) {
        console.error('Error getting admin users:', error);
        return [];
    }
}

// Admin: Aeries permissions endpoints
export async function getUserAeriesPermissions(userId: number): Promise<AeriesPermissionsDto> {
    return await apiRequest(`/admin/users/${userId}/aeries-permissions`);
}

export async function updateUserAeriesPermissions(userId: number, payload: Partial<AeriesPermissionsDto>): Promise<AeriesPermissionsDto> {
    return await apiRequest(`/admin/users/${userId}/aeries-permissions`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}

export async function updateUserAdminStatus(userId: number, isAdmin: boolean): Promise<DatabaseUser | null> {
    try {
        return await apiRequest(`/users/${userId}/admin-status`, {
            method: 'PATCH',
            body: JSON.stringify({ isAdmin }),
        });
    } catch (error) {
        console.error('Error updating user admin status:', error);
        return null;
    }
}

// Chromebook management functions
export async function getAllChromebooks(): Promise<DatabaseChromebook[]> {
    try {
        return await apiRequest('/chromebooks');
    } catch (error) {
        console.error('Error getting all chromebooks:', error);
        return [];
    }
}

export async function getChromebookById(id: number): Promise<DatabaseChromebook | null> {
    try {
        return await apiRequest(`/chromebooks/${id}`);
    } catch (error) {
        console.error('Error getting chromebook by ID:', error);
        return null;
    }
}

export async function createChromebook(chromebook: Omit<DatabaseChromebook, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseChromebook> {
    try {
        return await apiRequest('/chromebooks', {
            method: 'POST',
            body: JSON.stringify(chromebook),
        });
    } catch (error) {
        console.error('Error creating chromebook:', error);
        throw error;
    }
}

export async function updateChromebook(id: number, updates: Partial<DatabaseChromebook>): Promise<DatabaseChromebook | null> {
    try {
        return await apiRequest(`/chromebooks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    } catch (error) {
        console.error('Error updating chromebook:', error);
        return null;
    }
}

// Statistics functions
export async function getDashboardStats() {
    try {
        return await apiRequest('/dashboard/stats');
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        return {
            totalChromebooks: 0,
            available: 0,
            checkedOut: 0,
            maintenance: 0,
            insured: 0,
            overdue: 0
        };
    }
}

export async function getRecentActivity() {
    try {
        return await apiRequest('/dashboard/activity');
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
    role: 'super_admin' | 'admin' | 'user';
    last_login: string;
    login_count: number;
    created_at: string;
}>> {
    try {
        return await apiRequest('/users/activity');
    } catch (error) {
        console.error('Error getting user login activity:', error);
        return [];
    }
}

// Authentication functions
export async function verifyToken(): Promise<any> {
    try {
        return await apiRequest('/auth/verify');
    } catch (error) {
        // Remove invalid token
        localStorage.removeItem('auth_token');
        throw error;
    }
}

export async function logout(): Promise<void> {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        localStorage.removeItem('auth_token');
    }
}

// ----- DB Admin helpers -----
export type MigrationsList = { migrations: string[]; runScripts: string[]; basePath: string };

export async function listDbMigrations(): Promise<MigrationsList> {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE_URL}/admin/db/migrations`, {
        headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export async function runDbMigration(file: string): Promise<{ success: boolean; file: string } | never> {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE_URL}/admin/db/migrate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ file }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export async function downloadDbBackup(): Promise<Blob> {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE_URL}/admin/db/backup`, {
        method: 'GET',
        headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
}

export async function restoreDbFromSql(file: File, dropSchema: boolean): Promise<{ success: boolean }> {
    const token = getAuthToken();
    const sqlText = await file.text();
    const res = await fetch(`${API_BASE_URL}/admin/db/restore?dropSchema=${dropSchema ? 'true' : 'false'}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain',
            'Accept': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: sqlText,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}
