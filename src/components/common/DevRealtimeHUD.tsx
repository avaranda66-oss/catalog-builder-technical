import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { getSupabase } from '../../services/supabase.service';

export const DevRealtimeHUD: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);

  const {
    currentCatalog,
    activePageIndex,
    localRevision,
    lastAcknowledgedLocalRevision,
    isDirty,
    isSaving,
    syncStatus,
    syncError,
    realtimeStatus,
    inFlightSave
  } = useCatalogStore();
  const { email, role, status: authStatus, userId } = useAuthStore();

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

  const totalBlocks = currentCatalog?.pages?.reduce((acc, p) => acc + (p.blocks?.length || 0), 0) ?? 0;
  const activePageBlocks = currentCatalog?.pages?.[activePageIndex]?.blocks?.length ?? 0;
  const clientId = typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage.getItem('cb_client_instance_id') || 'init' : 'none';
  const buildSha = import.meta.env.VITE_GIT_COMMIT_SHA || 'dev';

  const handleCopyDiagnostics = () => {
    const report = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      catalogId: currentCatalog?.id || 'none',
      catalogTitle: currentCatalog?.title || 'none',
      version: currentCatalog?.version ?? 0,
      pagesCount: currentCatalog?.pages?.length ?? 0,
      totalBlocks,
      activePageIndex,
      syncStatus,
      syncError,
      isDirty,
      isSaving,
      localRevision,
      lastAcknowledgedLocalRevision,
      authStatus,
      userId,
      realtimeStatus,
      clientInstanceId: clientId,
      buildCommit: buildSha
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleForceTokenRefresh = async () => {
    setIsRefreshingAuth(true);
    const supabase = getSupabase();
    if (!supabase) {
      alert('Supabase não inicializado.');
      setIsRefreshingAuth(false);
      return;
    }

    console.log('[DEBUG FORCING TOKEN REFRESH] Chamando supabase.auth.refreshSession()...', {
      catalogBefore: currentCatalog?.id,
      titleBefore: currentCatalog?.title,
      versionBefore: currentCatalog?.version,
      pagesBefore: currentCatalog?.pages?.length,
      blocksBefore: totalBlocks,
      activePageIndex,
      isDirty,
      localRevision,
      authStatus,
      userId,
      timestamp: new Date().toISOString()
    });

    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('[DEBUG TOKEN REFRESH ERROR]', error);
        alert('Erro ao renovar token: ' + error.message);
      } else {
        console.log('[DEBUG TOKEN REFRESH SUCCESS]', {
          sessionExpiresAt: data.session?.expires_at,
          user: data.user?.email,
          catalogAfter: useCatalogStore.getState().currentCatalog?.id,
          versionAfter: useCatalogStore.getState().currentCatalog?.version,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e: any) {
      console.error('[DEBUG TOKEN REFRESH EXCEPTION]', e);
    } finally {
      setIsRefreshingAuth(false);
    }
  };

  return (
    <aside
      aria-label="DEV Realtime HUD"
      className="fixed bottom-2 right-2 z-50 bg-slate-950/95 text-slate-100 border border-slate-700 shadow-2xl rounded-lg p-3 max-w-md w-full font-mono text-[11px] backdrop-blur space-y-2 select-text"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
        <span className="font-bold text-amber-400 flex items-center gap-1.5 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${realtimeStatus === 'SUBSCRIBED' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          REALTIME DIAGNOSTIC HUD
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyDiagnostics}
            className={`px-2 py-0.5 text-[9px] rounded font-semibold transition-colors ${
              copied ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
            title="Copiar relatório de diagnóstico técnico"
          >
            {copied ? 'Copiado!' : 'Copiar diagnóstico'}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="text-slate-400 hover:text-white p-1 text-xs"
            title="Fechar painel de diagnóstico"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1 text-[10px]">
        <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800 break-all">
          <span className="text-slate-400">catalog.id:</span>{' '}
          <span className="text-cyan-300 font-bold">{currentCatalog?.id || 'none'}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <div>
            <span className="text-slate-400">version:</span>{' '}
            <span className="text-emerald-300 font-bold">v{currentCatalog?.version ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-400">pages / blocks:</span>{' '}
            <span className="text-purple-300 font-bold">{currentCatalog?.pages?.length ?? 0}p / {totalBlocks}b</span>
          </div>

          <div>
            <span className="text-slate-400">syncStatus:</span>{' '}
            <span className={`font-bold ${syncStatus === 'synced' ? 'text-emerald-400' : syncStatus === 'dirty' ? 'text-amber-400' : syncStatus === 'conflict' ? 'text-orange-400' : 'text-red-400'}`}>
              {syncStatus}
            </span>
          </div>
          <div>
            <span className="text-slate-400">RT Status:</span>{' '}
            <span className={`font-bold ${realtimeStatus === 'SUBSCRIBED' ? 'text-emerald-400' : 'text-red-400'}`}>
              {realtimeStatus}
            </span>
          </div>

          <div>
            <span className="text-slate-400">localRev / ack:</span>{' '}
            <span className="text-amber-300">{localRevision}</span> / <span className="text-slate-300">{lastAcknowledgedLocalRevision}</span>
          </div>
          <div>
            <span className="text-slate-400">isDirty / Saving:</span>{' '}
            <span className="text-slate-200">{String(isDirty)} / {String(isSaving)}</span>
          </div>

          <div className="col-span-2">
            <span className="text-slate-400">Client:</span>{' '}
            <span className="text-cyan-300">{clientId}</span> | Page {activePageIndex + 1} ({activePageBlocks}b)
          </div>

          <div className="col-span-2 text-slate-400">
            Build Commit: <span className="text-amber-300 font-bold">{buildSha}</span>
          </div>
        </div>

        {syncError && (
          <div className="text-[9px] text-red-200 bg-red-950/60 p-1.5 rounded border border-red-800">
            {syncError}
          </div>
        )}

        {inFlightSave && (
          <div className="text-[9px] text-amber-200/80 bg-amber-950/40 p-1 rounded border border-amber-800/40">
            inFlight: exp v{inFlightSave.expectedVersion} → tgt v{inFlightSave.targetVersion} (rev {inFlightSave.capturedRevision})
          </div>
        )}

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <div className="text-[9px] text-slate-400 truncate flex-1">
            User: {email || 'anon'} ({role || 'user'})
          </div>
          <button
            onClick={handleForceTokenRefresh}
            disabled={isRefreshingAuth}
            className="px-2 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 rounded text-[9px] font-bold transition-colors shadow-sm flex-shrink-0"
            title="Executa supabase.auth.refreshSession() oficial para teste de integridade da sessão"
          >
            {isRefreshingAuth ? 'Renovando...' : 'Forçar renovação de sessão'}
          </button>
        </div>
      </div>
    </aside>
  );
};

