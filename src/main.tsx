import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useCatalogStore } from './stores/useCatalogStore';
import { useAuthStore } from './stores/useAuthStore';
import { useLibraryStore } from './stores/useLibraryStore';
import { useUIStore } from './stores/useUIStore';
import { usePresenceStore } from './stores/usePresenceStore';
import { useAssetStore } from './stores/useAssetStore';
import { useMediaStore } from './stores/useMediaStore';
import { useTranslationStore } from './stores/useTranslationStore';

const A4PhysicalProofPage = import.meta.env.DEV || import.meta.env.VITE_E2E_BUILD === 'true'
  ? React.lazy(() => import('./labs/a4-physical-proof/A4PhysicalProofPage'))
  : null;

if (typeof window !== 'undefined') {
  const isDebugE2E = import.meta.env.DEV || import.meta.env.VITE_E2E_BUILD === 'true';
  if (isDebugE2E) {
    (window as any).useCatalogStore = useCatalogStore;
    (window as any).useAuthStore = useAuthStore;
    (window as any).useLibraryStore = useLibraryStore;
    (window as any).useUIStore = useUIStore;
    (window as any).usePresenceStore = usePresenceStore;
    (window as any).useAssetStore = useAssetStore;
    (window as any).useMediaStore = useMediaStore;
    (window as any).useTranslationStore = useTranslationStore;
  }
}

const isA4PhysicalProofRoute = typeof window !== 'undefined'
  && window.location.pathname === '/__a4-physical-proof'
  && A4PhysicalProofPage;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isA4PhysicalProofRoute && A4PhysicalProofPage ? (
      <React.Suspense fallback={<div>Carregando prova física A4...</div>}>
        <A4PhysicalProofPage />
      </React.Suspense>
    ) : <App />}
  </React.StrictMode>
);
