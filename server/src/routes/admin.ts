import express from 'express';
import { getAllUsers, updateUserRole, getUserById, getAeriesPermissions, upsertAeriesPermissions } from '../database';
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// Get all users (super-admin only)
router.get('/users', authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    try {
        console.log('📋 [Admin] Fetching all users');

        const users = await getAllUsers();

        // Format users for frontend
        const formattedUsers = users.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isAdmin: user.role === 'admin' || user.role === 'super_admin',
            isSuperAdmin: user.role === 'super_admin',
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            provider: 'microsoft', // Default provider since we only support Microsoft OAuth
            avatar: null // We don't store avatars yet
        }));

        console.log(`✅ [Admin] Retrieved ${formattedUsers.length} users`);
        res.json(formattedUsers);

    } catch (error) {
        console.error('❌ [Admin] Error fetching users:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch users'
        });
    }
});

// Update user role (super-admin only)
router.put('/users/:id/role', authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
    try {
        const userId = parseInt(req.params.id);
        const { role } = req.body;

        // Validate role
        if (!['user', 'admin', 'super_admin'].includes(role)) {
            res.status(400).json({
                error: 'Invalid role',
                message: 'Role must be one of: user, admin, super_admin'
            });
            return;
        }

        // Validate user ID
        if (isNaN(userId)) {
            res.status(400).json({
                error: 'Invalid user ID',
                message: 'User ID must be a valid number'
            });
            return;
        }

        // Prevent super-admin from demoting themselves
        const currentUser = req.user;
        if (currentUser?.id === userId && currentUser.role === 'super_admin' && role !== 'super_admin') {
            res.status(400).json({
                error: 'Cannot demote yourself',
                message: 'Super-admins cannot demote their own account'
            });
            return;
        }

        console.log(`🔄 [Admin] Updating user ${userId} role to ${role}`);

        // Check if user exists
        const existingUser = await getUserById(userId);
        if (!existingUser) {
            res.status(404).json({
                error: 'User not found',
                message: `User with ID ${userId} does not exist`
            });
            return;
        }

        // Update user role
        const updatedUser = await updateUserRole(userId, role);
        if (!updatedUser) {
            res.status(500).json({
                error: 'Update failed',
                message: 'Failed to update user role'
            });
            return;
        }

        // Format user for frontend
        const formattedUser = {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            isAdmin: updatedUser.role === 'admin' || updatedUser.role === 'super_admin',
            isSuperAdmin: updatedUser.role === 'super_admin',
            createdAt: updatedUser.created_at,
            updatedAt: updatedUser.updated_at,
            provider: 'microsoft',
            avatar: null
        };

        console.log(`✅ [Admin] Successfully updated user ${userId} role to ${role}`);
        res.json(formattedUser);

    } catch (error) {
        console.error('❌ [Admin] Error updating user role:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to update user role'
        });
    }
});

export { router as adminRoutes };

// ----- Aeries Permissions Management (super-admin only) -----
router.get('/users/:id/aeries-permissions', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        const perms = await getAeriesPermissions(userId);
        res.json(perms || {
            user_id: userId,
            aeries_enabled: false,
            can_access_school_data: false,
            can_access_student_data: false,
            can_view_student_overview: false,
            can_view_contact_info: false,
            can_view_address_info: false,
            can_view_emergency_contacts: false,
            can_view_academic_info: false,
            can_view_personal_info: false,
            can_view_test_records: false,
            can_view_programs: false,
            can_view_picture: false,
            can_view_groups: false,
            can_view_fines: false,
            can_view_disciplinary_records: false,
            created_at: null,
            updated_at: null,
        });
    } catch (error) {
        console.error('❌ [Admin] Error fetching Aeries permissions:', error);
        res.status(500).json({ error: 'Failed to fetch Aeries permissions' });
    }
});

router.put('/users/:id/aeries-permissions', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        // Only accept known boolean flags
        const allowedKeys = [
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
        const payload: any = {};
        for (const key of allowedKeys) {
            if (key in req.body) {
                const val = req.body[key];
                if (typeof val !== 'boolean') {
                    res.status(400).json({ error: `Field ${key} must be a boolean` });
                    return;
                }
                payload[key] = val;
            }
        }

        const updated = await upsertAeriesPermissions(userId, payload);
        res.json(updated);
    } catch (error) {
        console.error('❌ [Admin] Error updating Aeries permissions:', error);
        res.status(500).json({ error: 'Failed to update Aeries permissions' });
    }
});
