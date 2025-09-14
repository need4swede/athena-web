import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSandbox } from './SandboxProvider';
import { useAuth } from '@/components/sso/SSOProvider';
import { Button } from '@/components/ui/button';

export const SandboxOverlayViewer: React.FC = () => {
  const { sandbox } = useSandbox();
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const dragState = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  const fetchOverlay = async () => {
    try {
      const res = await fetch('/api/sandbox/overlay', {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!open || !sandbox) return;
    fetchOverlay();
  }, [open, sandbox, token]);

  useEffect(() => {
    if (!open || !sandbox || !autoRefresh) return;
    const id = window.setInterval(fetchOverlay, 2000);
    return () => window.clearInterval(id);
  }, [open, sandbox, autoRefresh, token]);

  // Initialize default position near bottom-right once opened
  useEffect(() => {
    if (open && pos == null) {
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      // Default panel size guess; user can reposition
      const defaultWidth = Math.min(700, Math.floor(vw * 0.9));
      const defaultHeight = Math.min(480, Math.floor(vh * 0.6));
      setPos({ top: Math.max(16, vh - defaultHeight - 80), left: Math.max(16, vw - defaultWidth - 16) });
    }
  }, [open, pos]);

  // Drag handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return;
      const top = Math.max(8, Math.min((window.innerHeight - 80), e.clientY - dragState.current.offsetY));
      const left = Math.max(8, Math.min((window.innerWidth - 80), e.clientX - dragState.current.offsetX));
      setPos({ top, left });
    };
    const onMouseUp = () => {
      dragState.current.dragging = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragState.current.dragging) return;
      const t = e.touches[0];
      const top = Math.max(8, Math.min((window.innerHeight - 80), t.clientY - dragState.current.offsetY));
      const left = Math.max(8, Math.min((window.innerWidth - 80), t.clientX - dragState.current.offsetX));
      setPos({ top, left });
    };
    const onTouchEnd = () => { dragState.current.dragging = false; };
    // Intercept global capture events for click/wheel within the overlay
    const captureStopper = (e: Event) => {
      const panel = panelRef.current;
      if (!panel) return;
      const path = (e as any).composedPath ? (e as any).composedPath() : [];
      if (path && path.includes(panel)) {
        e.stopPropagation();
        if ((e as any).stopImmediatePropagation) {
          (e as any).stopImmediatePropagation();
        }
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('wheel', captureStopper, true);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', captureStopper, true);
    };
  }, []);

  const beginDrag = (clientX: number, clientY: number) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragState.current.dragging = true;
    dragState.current.offsetX = clientX - rect.left;
    dragState.current.offsetY = clientY - rect.top;
  };

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    beginDrag(e.clientX, e.clientY);
  };
  const onHeaderTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    beginDrag(t.clientX, t.clientY);
  };

  if (!sandbox) return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => setOpen((v) => !v)}>
        View Simulated Changes
      </Button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div id="sandbox-hud"
          ref={panelRef}
          className="fixed z-[9999] w-[90vw] max-w-[700px] max-h-[60vh] bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden"
          style={{ top: pos.top, left: pos.left, pointerEvents: 'auto' }}
          onWheelCapture={(e) => { e.stopPropagation(); }}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); }}
          onTouchStart={(e) => { e.stopPropagation(); }}
        >
          <div
            className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between cursor-move select-none bg-neutral-50/80 dark:bg-neutral-800/60"
            onMouseDown={onHeaderMouseDown}
            onTouchStart={onHeaderTouchStart}
          >
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">Sandbox Simulated Changes</h3>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{lastUpdated && `Updated ${lastUpdated}`}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto refresh
              </label>
              <Button type="button" variant="outline" size="sm" onClick={fetchOverlay}>Refresh</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
          <div
            className="p-3 overflow-y-auto overscroll-contain text-xs text-neutral-800 dark:text-neutral-200"
            style={{ maxHeight: 'calc(60vh - 50px)' }}
            onWheelCapture={(e) => { e.stopPropagation(); }}
            onTouchMoveCapture={(e) => { e.stopPropagation(); }}
          >
            <pre className="whitespace-pre-wrap break-words">{data ? JSON.stringify(data, null, 2) : 'No simulated changes yet.'}</pre>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
