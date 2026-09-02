import React, { useEffect } from 'react';
import { useUIStore } from './stores/useUIStore';
import { useLibraryStore } from './stores/useLibraryStore';
import { useCatalogStore } from './stores/useCatalogStore';
import { useMediaStore } from './stores/useMediaStore';
import { useTemplateStore } from './stores/useTemplateStore';
import { Navbar } from './components/common/Navbar';
import { EditorView } from './components/editor/EditorView';
import { LibraryView } from './components/library/LibraryView';
import { PublicationsView } from './components/publications/PublicationsView';
import { MediaGalleryModal } from './components/common/MediaGalleryModal';
import { LoginView } from './components/auth/LoginView';
import { useAuthStore } from './stores/useAuthStore';

import { getSupabase } from './services/supabase.service';
import { handleCatalogRealtimeEvent } from './services/realtime.service';
import { DevRealtimeHUD } from './components/common/DevRealtimeHUD';

export const App: React.FC = () => {
  const { activeTab } = useUIStore();
  const { loadProducts } = useLibraryStore();
  const { loadLatestCatalog } = useCatalogStore();
  const { loadAssets } = useMediaStore();
  const { loadTemplates, handleRealtimeTemplateEvent } = useTemplateStore();
  const status = useAuthStore((state) => state.status);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const retryProfile = useAuthStore((state) => state.retryProfile);
  const signOut = useAuthStore((state) => state.signOut);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void loadProducts();
    void loadLatestCatalog();
    void loadAssets();
    void loadTemplates();

    // Sincronização em Tempo Real Segura com Status Callback (FASE 1.2B & 1.3)
    const supabase = getSupabase();
    if (!supabase) return;

    const clientId = typeof window !== 'undefined' && window.sessionStorage
      ? window.sessionStorage.getItem('cb_client_instance_id') || 'client'
      : 'client';

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'catalogs' },
        (payload) => {
          void handleCatalogRealtimeEvent(payload as any);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          void loadProducts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'templates' },
        (payload) => {
          handleRealtimeTemplateEvent(payload as any);
        }
      )
      .subscribe((realtimeStatus, error) => {
        console.log('[PRESYS REALTIME STATUS]', realtimeStatus, error);
        useCatalogStore.setState({ realtimeStatus });
      });

    // Listener RAW paralelo para depuração sob ?debugRealtime=1
    let rawChannel: any = null;
    const isDebug = typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('debugRealtime') === '1' ||
      import.meta.env.DEV
    );

    if (isDebug) {
      rawChannel = supabase
        .channel(`debug-raw-${clientId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'catalogs'
          },
          (payload) => {
            console.log('[REALTIME RAW EVENT]', {
              clientId,
              receivedAt: new Date().toISOString(),
              payload
            });
          }
        )
        .subscribe((rawStatus) => {
          console.log(`[REALTIME RAW CHANNEL STATUS] (${clientId}):`, rawStatus);
        });
    }

    return () => {
      void supabase.removeChannel(channel);
      if (rawChannel) {
        void supabase.removeChannel(rawChannel);
      }
    };
  }, [loadProducts, loadLatestCatalog, loadAssets, status]);

  if (status === 'loading') {
    return <main className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-600">Validando acesso…</main>;
  }

  if (status === 'unauthenticated') return <LoginView />;

  if (status === 'forbidden' || status === 'profile-error') {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-5">
        <section className="max-w-md bg-white border border-slate-300 p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Acesso não disponível</h1>
          <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
          <p className="mt-3 text-xs text-slate-500">Nenhum catálogo ou dado da Biblioteca foi carregado.</p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => void retryProfile()} className="px-3 py-2 text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50 rounded-none">Tentar novamente</button>
            <button onClick={() => void signOut()} className="px-3 py-2 text-sm font-semibold bg-[#003366] text-white rounded-none">Sair</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 font-sans text-slate-900 overflow-hidden select-none">
      <Navbar />

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'editor' && <EditorView />}
        {activeTab === 'library' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <LibraryView />
          </div>
        )}
        {activeTab === 'catalogs' && <PublicationsView />}
      </main>

      <MediaGalleryModal />
      <DevRealtimeHUD />
    </div>
  );
};

export default App;
