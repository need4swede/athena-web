import crypto from 'crypto';

export interface SandboxSession {
  userId: number;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_MINUTES = Number(process.env.SANDBOX_TTL_MINUTES || 240);

class InMemorySandboxStore {
  private sessions = new Map<number, SandboxSession>();

  enable(userId: number, ttlMinutes = DEFAULT_TTL_MINUTES): SandboxSession {
    const now = Date.now();
    const session: SandboxSession = {
      userId,
      sessionId: crypto.randomBytes(16).toString('hex'),
      createdAt: now,
      expiresAt: now + ttlMinutes * 60 * 1000,
    };
    this.sessions.set(userId, session);
    return session;
  }

  disable(userId: number): void {
    this.sessions.delete(userId);
  }

  get(userId: number): SandboxSession | null {
    const session = this.sessions.get(userId) || null;
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(userId);
      return null;
    }
    return session;
  }

  isActive(userId: number): boolean {
    return this.get(userId) != null;
  }
}

export const SandboxStore = new InMemorySandboxStore();

