import React, { useEffect } from 'react';
import { useUIStore } from './stores/useUIStore';
import { useLibraryStore } from './stores/useLibraryStore';
import { useCatalogStore } from './stores/useCatalogStore';
import { useMediaStore } from './stores/useMediaStore';
import { Navbar } from './components/common/Navbar';
import { EditorView } from './components/editor/EditorView';
import { LibraryView } from './components/library/LibraryView';
import { PublicationsView } from './components/publications/PublicationsView';
import { MediaGalleryModal } from './components/common/MediaGalleryModal';

export const App: React.FC = () => {
  const { activeTab } = useUIStore();
  const { loadProducts } = useLibraryStore();
  const { loadLatestCatalog } = useCatalogStore();
  const { loadAssets } = useMediaStore();

  useEffect(() => {
    // Inicialização da persistência local
    loadProducts();
    loadLatestCatalog();
    loadAssets();
  }, [loadProducts, loadLatestCatalog, loadAssets]);

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
    </div>
  );
};

export default App;
