import React from 'react';
import { useSandbox } from './SandboxProvider';
import { ShieldAlert } from 'lucide-react';
import { SandboxOverlayViewer } from './SandboxOverlayViewer';

export const SandboxBanner: React.FC = () => {
  const { sandbox, disable } = useSandbox();
  if (!sandbox) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      <div className="flex items-center gap-3 bg-amber-50 text-amber-900 border border-amber-200 shadow-lg rounded-full px-4 py-2">
        <ShieldAlert className="w-4 h-4" />
        <span className="text-sm">Sandbox mode — changes won’t be saved</span>
        <SandboxOverlayViewer />
        <button
          onClick={disable}
          className="text-xs font-medium bg-amber-600 text-white rounded-full px-3 py-1 hover:bg-amber-700"
        >
          Exit Sandbox
        </button>
      </div>
    </div>
  );
};
