import React, { useState, useEffect } from 'react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useAuthStore } from '../../stores/useAuthStore';

export const DevRealtimeHUD: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const {
    currentCatalog,
    localRevision,
    lastAcknowledgedLocalRevision,
    isDirty,
    isSaving,
    syncStatus,
    realtimeStatus,
    inFlightSave
  } = useCatalogStore();
  const { email, role } = useAuthStore();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debugRealtime') === '1') {
        setIsVisible(true);
      }
    }
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-2 right-2 z-50 text-[10px] font-mono bg-slate-900/80 text-white px-2 py-1 rounded shadow hover:bg-slate-900 opacity-60 hover:opacity-100 transition-opacity"
        title="Ativar painel DEV de diagnóstico de sincronização em tempo real"
      >
        DEV HUD
      </button>
    );
  }

  return (
    <aside
      aria-label="DEV Realtime HUD"
      className="fixed bottom-2 right-2 z-50 bg-slate-950/95 text-slate-100 border border-slate-700 shadow-2xl rounded-lg p-3 max-w-sm w-full font-mono text-[11px] backdrop-blur space-y-1.5 select-text"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
        <span className="font-bold text-amber-400 flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${realtimeStatus === 'SUBSCRIBED' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          REALTIME DIAGNOSTIC HUD
        </span>
        <button
          onClick={() => setIsVisible(false)}
          className="text-slate-400 hover:text-white px-1 text-xs"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
        <div>
          <span className="text-slate-400">catalog.id:</span>{' '}
          <span className="text-blue-300 break-all">{currentCatalog?.id ? `${currentCatalog.id.slice(0, 8)}...` : 'none'}</span>
        </div>
        <div>
          <span className="text-slate-400">version:</span>{' '}
          <span className="text-emerald-300 font-bold">v{currentCatalog?.version ?? 0}</span>
        </div>

        <div>
          <span className="text-slate-400">pages.length:</span>{' '}
          <span className="text-purple-300 font-bold">{currentCatalog?.pages?.length ?? 0}</span>
        </div>
        <div>
          <span className="text-slate-400">syncStatus:</span>{' '}
          <span className={`font-bold ${syncStatus === 'synced' ? 'text-emerald-400' : syncStatus === 'dirty' ? 'text-amber-400' : 'text-red-400'}`}>
            {syncStatus}
          </span>
        </div>

        <div>
          <span className="text-slate-400">localRev:</span>{' '}
          <span className="text-amber-300">{localRevision}</span>
        </div>
        <div>
          <span className="text-slate-400">ackRev:</span>{' '}
          <span className="text-slate-300">{lastAcknowledgedLocalRevision}</span>
        </div>

        <div>
          <span className="text-slate-400">isDirty / Saving:</span>{' '}
          <span className="text-slate-200">{String(isDirty)} / {String(isSaving)}</span>
        </div>
        <div>
          <span className="text-slate-400">RT Status:</span>{' '}
          <span className={`font-bold ${realtimeStatus === 'SUBSCRIBED' ? 'text-emerald-400' : 'text-red-400'}`}>
            {realtimeStatus}
          </span>
        </div>

        {inFlightSave && (
          <div className="col-span-2 text-[9px] text-amber-200/80 bg-amber-950/40 p-1 rounded border border-amber-800/40">
            inFlight: exp v{inFlightSave.expectedVersion} → tgt v{inFlightSave.targetVersion} (rev {inFlightSave.capturedRevision})
          </div>
        )}

        <div className="col-span-2 text-[9px] text-slate-400 pt-1 border-t border-slate-800/80 truncate">
          User: {email || 'anon'} ({role || 'user'})
        </div>
      </div>
    </aside>
  );
};
