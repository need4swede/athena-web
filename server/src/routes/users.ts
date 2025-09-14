import express from 'express';
import { param, body, validationResult } from 'express-validator';
import { getAllUsers, getAllGoogleUsers, updateUserRole, updateUserAdminStatus, getUserLoginActivity, query } from '../database';
import { authenticateToken, requireSuperAdmin, requireAdminOrAbove } from '../middleware/auth';

const router = express.Router();

// Transform Google user data to frontend format
function transformGoogleUserToFrontend(dbUser: any) {
    return {
        id: dbUser.google_id || dbUser.primary_email || Math.random().toString(36).substring(2, 9),
        student_id: dbUser.student_id,
        student_db_id: dbUser.student_db_id,
        primaryEmail: dbUser.primary_email || '',
        name: {
            fullName: dbUser.full_name || 'Unknown User',
            givenName: dbUser.first_name || '',
            familyName: dbUser.last_name || ''
        },
        suspended: Boolean(dbUser.is_suspended),
        orgUnitPath: dbUser.org_unit_path || '/',
        isAdmin: dbUser.is_admin || false,
        isDelegatedAdmin: false,
        lastLoginTime: dbUser.last_login_time,
        creationTime: dbUser.creation_time,
        agreedToTerms: true,
        archived: false,
        changePasswordAtNextLogin: false,
        ipWhitelisted: false,
        emails: [
            {
                address: dbUser.primary_email,
                primary: true,
                type: 'work'
            }
        ],
        organizations: [],
        phones: [],
        addresses: [],
        isEnrolledIn2Sv: false,
        isEnforcedIn2Sv: false,
        includeInGlobalAddressList: true
    };
}

// Get all users - returns Google users from database (read-only for users, full access for admins)
router.get('/', authenticateToken, async (req: any, res: any) => {
    try {
        // Add cache-busting headers to ensure fresh data
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        const googleUsers = await getAllGoogleUsers();

        // Transform database format to frontend format
        const transformedUsers = googleUsers.map(transformGoogleUserToFrontend);

        res.json(transformedUsers);

    } catch (error) {
        console.error('❌ [Get Users] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch users'
        });
    }
});

// Update user role (super admin only)
router.patch('/:id/role', [
    param('id').isInt({ min: 1 }),
    body('role').isIn(['super_admin', 'admin', 'user']),
    authenticateToken,
    requireSuperAdmin
], async (req: any, res: any) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const userId = parseInt(req.params.id);
        const { role } = req.body;

        // Prevent users from changing their own role
        if (userId === req.user.userId) {
            return res.status(400).json({
                error: 'Cannot change your own role'
            });
        }

        const updatedUser = await updateUserRole(userId, role);

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(updatedUser);

    } catch (error) {
        console.error('❌ [Update User Role] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to update user role'
        });
    }
});

// Update user admin status (legacy endpoint for backward compatibility)
router.patch('/:id/admin-status', [
    param('id').isInt({ min: 1 }),
    authenticateToken,
    requireSuperAdmin
], async (req: any, res: any) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const userId = parseInt(req.params.id);
        const { isAdmin } = req.body;

        // Prevent users from removing their own admin status
        if (userId === req.user.userId && req.user.isAdmin && !isAdmin) {
            return res.status(400).json({
                error: 'Cannot remove your own admin privileges'
            });
        }

        const updatedUser = await updateUserAdminStatus(userId, isAdmin);

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(updatedUser);

    } catch (error) {
        console.error('❌ [Update Admin Status] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to update user admin status'
        });
    }
});

// Get user by student ID
router.get('/by-student-id/:studentId', authenticateToken, async (req: any, res: any) => {
    try {
        const { studentId } = req.params;

        const queryText = `
            SELECT id, student_id, first_name, last_name, email, grade_level
            FROM students
            WHERE student_id = $1
            LIMIT 1
        `;

        const result = await query(queryText, [studentId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        res.json({
            id: user.id,
            studentId: user.student_id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            gradeLevel: user.grade_level
        });

    } catch (error) {
        console.error('❌ [Get User by Student ID] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch user by student ID'
        });
    }
});

// Get user activity (admin only)
router.get('/activity', authenticateToken, requireAdminOrAbove, async (req: any, res: any) => {
    try {

        const activity = await getUserLoginActivity();
        res.json(activity);

    } catch (error) {
        console.error('❌ [Get User Activity] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch user activity'
        });
    }
});

export { router as userRoutes };
