import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useCatalogStore } from './stores/useCatalogStore';
import { useAuthStore } from './stores/useAuthStore';

if (typeof window !== 'undefined') {
  const isDebug = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debugRealtime') === '1';
  if (isDebug) {
    (window as any).useCatalogStore = useCatalogStore;
    (window as any).useAuthStore = useAuthStore;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
