import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { createOrUpdateUser, getUserByEmail } from '../database';
import { ssoConfigService } from '../services/sso-config.service';

const router = express.Router();

// JWT secret (in production, this should be in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// SSO Login endpoint
router.post('/sso-login', [
    body('email').isEmail().normalizeEmail(),
    body('name').trim().isLength({ min: 1 }),
    body('provider').trim().isLength({ min: 1 }),
], async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
            return;
        }

        const { email, name, provider, avatar } = req.body;

        console.log('🔐 [SSO Login] Processing login for:', { email, name, provider });

        // Check access control based on SSO configuration
        const isAllowed = ssoConfigService.checkAccessControl(email);
        if (!isAllowed) {
            console.log('❌ [SSO Login] Access denied for email:', email);
            res.status(403).json({
                error: 'Access denied',
                message: 'Your email is not authorized to access this application'
            });
            return;
        }

        // Create or update user in database (let the function determine admin status)
        const user = await createOrUpdateUser(email, name);

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role,
                isAdmin: user.role === 'admin' || user.role === 'super_admin'
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Format user for frontend
        const frontendUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: avatar || null,
            provider: provider,
            role: user.role,
            isAdmin: user.role === 'admin' || user.role === 'super_admin',
            isSuperAdmin: user.role === 'super_admin',
            lastLogin: new Date()
        };

        console.log('✅ [SSO Login] Login successful for:', user.email);

        res.json({
            token,
            user: frontendUser
        });

    } catch (error) {
        console.error('❌ [SSO Login] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process SSO login'
        });
    }
});

// Verify token endpoint
router.get('/verify', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }

        const token = authHeader.substring(7);

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;

            // Get fresh user data from database
            const user = await getUserByEmail(decoded.email);
            if (!user) {
                res.status(401).json({ error: 'User not found' });
                return;
            }

            // Format user for frontend
            const frontendUser = {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: null, // We don't store avatars in DB yet
                provider: "microsoft", // We don't store provider in current schema
                role: user.role,
                isAdmin: user.role === 'admin' || user.role === 'super_admin',
                isSuperAdmin: user.role === 'super_admin',
                lastLogin: new Date()
            };

            res.json({ user: frontendUser });

        } catch (jwtError) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

    } catch (error) {
        console.error('❌ [Token Verify] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to verify token'
        });
    }
});

// Logout endpoint (mainly for cleanup, JWT is stateless)
router.post('/logout', (req: express.Request, res: express.Response) => {
    // In a stateless JWT system, logout is handled client-side by removing the token
    // Here we could add token blacklisting if needed
    res.json({ message: 'Logged out successfully' });
});

export { router as authRoutes };
