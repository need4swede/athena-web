import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SandboxStore } from '../services/sandboxStore';
import { SandboxMetrics } from '../services/sandboxMetrics';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export interface SandboxRequest extends Request {
  sandbox?: boolean;
  sandboxSessionId?: string;
  user?: { id: number; role?: string; isAdmin?: boolean; isSuperAdmin?: boolean };
}

// Best-effort context attach: decodes JWT if present to discover userId, then attaches sandbox flags.
export function sandboxContext(req: SandboxRequest, res: Response, next: NextFunction): void {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const userId = decoded.userId as number | undefined;
        if (userId) {
          const session = SandboxStore.get(userId);
          if (session) {
            req.sandbox = true;
            req.sandboxSessionId = session.sessionId;
            res.setHeader('X-Sandbox-Mode', 'true');
          } else {
            req.sandbox = false;
          }
        }
      } catch {
        // ignore token errors; real auth middleware will enforce
      }
    }
  } catch {
    // non-fatal
  }
  next();
}

// For routers that proxy external systems (e.g., Google): block mutating methods in sandbox
export function blockExternalWritesInSandbox(req: SandboxRequest, res: Response, next: NextFunction): void {
  if (req.sandbox && req.method !== 'GET') {
    SandboxMetrics.incBlockedExternalWrite();
    console.log(JSON.stringify({
      event: 'blocked_external_call',
      sandbox: true,
      method: req.method,
      path: req.originalUrl,
      timestamp: new Date().toISOString()
    }));
    res.status(200).json({
      sandbox: true,
      success: true,
      message: 'Write blocked in sandbox; simulated success returned.',
      method: req.method,
      path: req.originalUrl,
    });
    return;
  }
  next();
}
