import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useCatalogStore } from './stores/useCatalogStore';
import { useAuthStore } from './stores/useAuthStore';
import { useLibraryStore } from './stores/useLibraryStore';
import { useUIStore } from './stores/useUIStore';

if (typeof window !== 'undefined') {
  const isDebugE2E = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debugE2E') === '1' || (typeof window.sessionStorage !== 'undefined' && window.sessionStorage.getItem('e2e_allowed') === '1');
  if (isDebugE2E) {
    (window as any).useCatalogStore = useCatalogStore;
    (window as any).useAuthStore = useAuthStore;
    (window as any).useLibraryStore = useLibraryStore;
    (window as any).useUIStore = useUIStore;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
