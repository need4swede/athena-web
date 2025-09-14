import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/sso/SSOProvider';

type SandboxContextType = {
  sandbox: boolean;
  sessionId?: string;
  ttl?: number;
  enable: (ttlMinutes?: number) => Promise<void>;
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SandboxContext = createContext<SandboxContextType | undefined>(undefined);

export function useSandbox() {
  const ctx = useContext(SandboxContext);
  if (!ctx) throw new Error('useSandbox must be used within SandboxProvider');
  return ctx;
}

export const SandboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAdmin, isSuperAdmin } = useAuth();
  const [sandbox, setSandbox] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [ttl, setTtl] = useState<number | undefined>();

  const authHeaders = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/sandbox', { headers: authHeaders });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSandbox(!!data.sandbox);
      setSessionId(data.sessionId);
      setTtl(data.ttl);
    } catch (e) {
      // ignore if unauthenticated or error
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = async (ttlMinutes?: number) => {
    if (!isAdmin && !isSuperAdmin) return;
    const res = await fetch('/api/sandbox/enable', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ttlMinutes }),
    });
    if (res.ok) {
      await refresh();
    } else {
      console.error('Failed to enable sandbox');
    }
  };

  const disable = async () => {
    if (!isAdmin && !isSuperAdmin) return;
    const res = await fetch('/api/sandbox/disable', { method: 'POST', headers: authHeaders });
    if (res.ok) {
      await refresh();
    } else {
      console.error('Failed to disable sandbox');
    }
  };

  return (
    <SandboxContext.Provider value={{ sandbox, sessionId, ttl, enable, disable, refresh }}>
      {children}
    </SandboxContext.Provider>
  );
};

