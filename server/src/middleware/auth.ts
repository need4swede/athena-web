import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { query } from '../database';
import { getJwtSecretUnsafe } from '../utils/jwt';

const JWT_SECRET = getJwtSecretUnsafe();

export interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        name: string;
        email: string;
        role: 'super_admin' | 'admin' | 'user';
        isAdmin: boolean; // Legacy compatibility
        isSuperAdmin: boolean;
    };
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    console.log('🔐 [AUTH] authenticateToken called for:', req.method, req.path);
    const authHeader = req.headers.authorization;
    console.log('🔐 [AUTH] Authorization header:', authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : 'Not provided');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ [AUTH] No valid authorization header found');
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    const token = authHeader.substring(7);
    console.log('🔐 [AUTH] Token extracted, length:', token.length);

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        console.log('✅ [AUTH] Token verified successfully for user:', {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            isAdmin: decoded.isAdmin
        });

        // Fetch user from database to get the name
        const userResult = await query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
        if (userResult.rows.length === 0) {
            console.log('❌ [AUTH] User not found in database');
            res.status(403).json({ error: 'User not found' });
            return;
        }
        const user = userResult.rows[0];

        // Handle both new role-based tokens and legacy isAdmin tokens
        const role = user.role || (decoded.isAdmin ? 'admin' : 'user');
        const isAdmin = role === 'admin' || role === 'super_admin';
        const isSuperAdmin = role === 'super_admin';

        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: role,
            isAdmin: isAdmin,
            isSuperAdmin: isSuperAdmin
        };
        next();
    } catch (error) {
        console.log('❌ [AUTH] Token verification failed:', error instanceof Error ? error.message : 'Unknown error');
        res.status(403).json({ error: 'Invalid or expired token' });
        return;
    }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.user?.isSuperAdmin) {
        res.status(403).json({ error: 'Super admin access required' });
        return;
    }
    next();
}

export function requireAdminOrAbove(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin or super admin access required' });
        return;
    }
    next();
}

export function requireRole(role: 'super_admin' | 'admin' | 'user') {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        const userRole = req.user.role;
        const roleHierarchy = { 'user': 0, 'admin': 1, 'super_admin': 2 };

        if (roleHierarchy[userRole] < roleHierarchy[role]) {
            res.status(403).json({ error: `${role.replace('_', ' ')} access required` });
            return;
        }

        next();
    };
}
