import React from 'react';
import ReactDOM from 'react-dom/client';
import { VNextApp } from './VNextApp';

export function mountVNextApp(root: HTMLElement): void {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <VNextApp />
    </React.StrictMode>
  );
}
