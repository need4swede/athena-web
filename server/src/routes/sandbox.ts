import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { SandboxStore } from '../services/sandboxStore';
import { SandboxOverlay } from '../services/sandboxOverlay';
import { SandboxMetrics } from '../services/sandboxMetrics';

const router = express.Router();

// Get sandbox status
router.get('/', authenticateToken, (req: any, res) => {
  const userId = req.user.id as number;
  const session = SandboxStore.get(userId);
  if (session) {
    return res.json({ sandbox: true, sessionId: session.sessionId, ttl: Math.max(0, session.expiresAt - Date.now()) });
  } else {
    return res.json({ sandbox: false });
  }
});

// Enable sandbox (Admin/Super Admin only)
router.post('/enable', authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin or super admin access required' });
  }
  const ttlMinutes = typeof req.body?.ttlMinutes === 'number' ? req.body.ttlMinutes : undefined;
  const session = SandboxStore.enable(req.user.id, ttlMinutes);
  SandboxMetrics.incSessionStarted();
  console.log(JSON.stringify({ event: 'sandbox_session_started', userId: req.user.id, sessionId: session.sessionId, ttlMinutes: ttlMinutes || undefined, timestamp: new Date().toISOString() }));
  return res.json({ sandbox: true, sessionId: session.sessionId, ttl: Math.max(0, session.expiresAt - Date.now()) });
});

// Disable sandbox (Admin/Super Admin only)
router.post('/disable', authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin or super admin access required' });
  }
  SandboxStore.disable(req.user.id);
  SandboxMetrics.incSessionEnded();
  console.log(JSON.stringify({ event: 'sandbox_session_ended', userId: req.user.id, timestamp: new Date().toISOString() }));
  return res.json({ sandbox: false });
});

// Introspection: current overlay snapshot (Admin/Super Admin only)
router.get('/overlay', authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin or super admin access required' });
  }
  if (!SandboxStore.isActive(req.user.id)) {
    return res.status(200).json({ sandbox: false, overlay: null });
  }
  return res.json({ sandbox: true, overlay: SandboxOverlay.snapshot(req.user.id) });
});

// Metrics snapshot (Admin/Super Admin only)
router.get('/metrics', authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin or super admin access required' });
  }
  return res.json({ sandboxMetrics: SandboxMetrics.snapshot() });
});

export default router;
