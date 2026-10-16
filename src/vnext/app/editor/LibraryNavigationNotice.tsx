import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { VNextPersistenceRuntime } from '../../persistence';
import { libraryNavigationNotice } from '../catalog-navigation';
import './entry-and-title.css';

/**
 * Shows, at the top of the editor, why "Catálogos" could not leave yet. It is rendered on
 * document.body: inside the top bar it would sit under the page stage overlay, which would take
 * its clicks (including "Fechar aviso").
 */
export function LibraryNavigationNotice({ runtime }: { readonly runtime: VNextPersistenceRuntime }) {
  const store = libraryNavigationNotice(runtime);
  const message = React.useSyncExternalStore(store.subscribe, store.get, store.get);
  if (!message || typeof document === 'undefined') return null;
  return createPortal(
    <div className="vnext-library-navigation-notice" role="alert" data-library-navigation-notice="">
      <span>{message}</span>
      <button type="button" aria-label="Fechar aviso" onClick={() => store.set(undefined)}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>,
    document.body
  );
}
