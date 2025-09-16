import express from 'express';
import jwt from 'jsonwebtoken';
import { createOrUpdateUser, getUserByEmail } from '../database';
import { ssoConfigService } from '../services/sso-config.service';
import { getJwtSecretUnsafe } from '../utils/jwt';

const router = express.Router();

// JWT secret (validated at startup for production)
const JWT_SECRET = getJwtSecretUnsafe();

interface TinyAuthIdentity {
    email: string;
    name: string;
    username?: string | null;
    provider: string;
    source: 'tinyauth' | 'dev' | 'legacy';
}

function resolveTinyAuthIdentity(req: express.Request): TinyAuthIdentity | null {
    const headerUser = (req.headers['remote-user'] as string | undefined)?.trim();
    const headerName = (req.headers['remote-name'] as string | undefined)?.trim();
    const headerEmail = (req.headers['remote-email'] as string | undefined)?.trim();

    if (headerEmail) {
        return {
            email: headerEmail.toLowerCase(),
            name: headerName || headerEmail.split('@')[0],
            username: headerUser || null,
            provider: 'tinyauth',
            source: 'tinyauth'
        };
    }

    if (process.env.ALLOW_DEV_AUTH === 'true') {
        const fallbackEmail = (process.env.DEV_AUTH_EMAIL || req.body?.email || 'devadmin@example.com').trim().toLowerCase();
        const fallbackName = (process.env.DEV_AUTH_NAME || req.body?.name || 'Dev Admin').trim();
        const fallbackUsername = (process.env.DEV_AUTH_USERNAME || req.body?.username || 'devadmin').trim();

        return {
            email: fallbackEmail,
            name: fallbackName,
            username: fallbackUsername,
            provider: 'dev',
            source: req.body?.email ? 'legacy' : 'dev'
        };
    }

    if (req.body?.email && req.body?.name) {
        // Legacy fallback for OAuth-based flows. Log heavily so we can detect unexpected usage.
        console.warn('⚠️ [SSO Login] Legacy body-based login attempted without TinyAuth headers');
        return {
            email: String(req.body.email).trim().toLowerCase(),
            name: String(req.body.name).trim(),
            username: null,
            provider: String(req.body.provider || 'oauth'),
            source: 'legacy'
        };
    }

    return null;
}

function formatFrontendUser(user: any, provider: string, avatar?: string | null) {
    const role = user.role || (user.is_admin ? 'admin' : 'user');
    const isAdmin = role === 'admin' || role === 'super_admin';
    const isSuperAdmin = role === 'super_admin';

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: avatar || null,
        provider,
        role,
        isAdmin,
        isSuperAdmin,
        lastLogin: user.last_login ? new Date(user.last_login) : new Date()
    };
}

// SSO Login endpoint
router.post('/sso-login', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const identity = resolveTinyAuthIdentity(req);

        if (!identity) {
            console.log('❌ [SSO Login] TinyAuth headers missing and no fallback available');
            res.status(401).json({
                error: 'Authentication headers not provided',
                message: 'TinyAuth did not supply authentication headers. Ensure requests flow through the TinyAuth proxy.'
            });
            return;
        }

        const { email, name, provider, source } = identity;

        console.log('🔐 [SSO Login] Processing login via TinyAuth:', {
            email,
            name,
            provider,
            source,
            hasRemoteHeaders: source === 'tinyauth'
        });

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
        const user = await createOrUpdateUser(email, name, { provider });

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
        const frontendUser = formatFrontendUser(user, provider);

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
            const frontendUser = formatFrontendUser(user, user.provider || 'tinyauth');

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
