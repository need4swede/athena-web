import React from 'react';
import { useSandbox } from '@/components/Sandbox/SandboxProvider';
import { useAuth } from '@/components/sso/SSOProvider';
import { Button } from '@/components/ui/button';

export const SandboxToggle: React.FC = () => {
  const { sandbox, enable, disable } = useSandbox();
  const { isAdmin, isSuperAdmin } = useAuth();
  if (!isAdmin && !isSuperAdmin) return null;
  return (
    <Button
      type="button"
      variant={sandbox ? 'destructive' : 'secondary'}
      size="sm"
      className="h-9 px-3"
      onClick={() => (sandbox ? disable() : enable())}
      title={sandbox ? 'Disable sandbox' : 'Enable sandbox'}
    >
      {sandbox ? 'Exit Sandbox' : 'Enable Sandbox'}
    </Button>
  );
};
