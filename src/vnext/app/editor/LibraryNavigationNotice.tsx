import React from 'react';
import { X } from 'lucide-react';
import type { VNextPersistenceRuntime } from '../../persistence';
import { libraryNavigationNotice } from '../catalog-navigation';
import './entry-and-title.css';

/** Shows, at the top of the editor, why "Catálogos" could not leave yet. */
export function LibraryNavigationNotice({ runtime }: { readonly runtime: VNextPersistenceRuntime }) {
  const store = libraryNavigationNotice(runtime);
  const message = React.useSyncExternalStore(store.subscribe, store.get, store.get);
  if (!message) return null;
  return (
    <div className="vnext-library-navigation-notice" role="alert" data-library-navigation-notice="">
      <span>{message}</span>
      <button type="button" aria-label="Fechar aviso" onClick={() => store.set(undefined)}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
