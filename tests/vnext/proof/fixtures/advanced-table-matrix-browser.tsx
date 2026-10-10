import React from 'react';
import ReactDOM from 'react-dom/client';
import { createDocumentSession } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { VNextPersistenceRuntime, type CatalogPersistenceEnvelope, type CatalogRepository, type SaveCatalogCasRequest } from '@/vnext/persistence';
import { type PublicationSource } from '@/vnext/publication/review';
import { FATHER_ASSET_URL } from './father-large-catalog-data';
import { advancedTechnicalMatrix, createAdvancedTableMatrixDocument } from './advanced-table-matrix-data';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

const params = new URL(location.href).searchParams;
const rows = Number(params.get('rows') ?? 10);
const columns = Number(params.get('columns') ?? 4);
const pages = Number(params.get('pages') ?? 1);
const seed = createAdvancedTableMatrixDocument(rows, columns, pages, Number(params.get('run') ?? 1));
if (params.get('empty') === '1') seed.pages[0].objects = [];
let binding: CatalogPersistenceEnvelope | null = await fetch(`/__advanced/record/${seed.id}`).then(response => response.json());
if (!binding) {
  binding = { catalogId: seed.id, remoteRevision: 1, lastMutationId: crypto.randomUUID(), title: seed.title, locale: seed.locale,
    createdAt: '2026-10-08T12:00:00Z', updatedAt: '2026-10-08T12:00:00Z', createdBy: '99999999-9999-4999-8999-999999999999',
    updatedBy: '99999999-9999-4999-8999-999999999999', archivedAt: null, documentSchemaVersion: 1, documentSnapshot: seed };
  await fetch('/__advanced/seed', { method: 'POST', body: JSON.stringify(binding) });
}
const repository: CatalogRepository = {
  listCatalogs: async () => ({ ok: true, value: [] }),
  createCatalog: async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } }),
  archiveCAS: async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } }),
  getCatalog: async (id: string) => {
    const value = await fetch(`/__advanced/record/${id}`).then(response => response.json()) as CatalogPersistenceEnvelope | null;
    return value ? { ok: true, value } : { ok: false, error: { code: 'NOT_FOUND' } };
  },
  saveCAS: async (request: SaveCatalogCasRequest) => fetch('/__advanced/save', { method: 'POST', body: JSON.stringify(request) }).then(response => response.json()),
};
const dependencies = { createId: () => crypto.randomUUID() };
const urls = () => new Map(seed.assets.map(asset => [asset.id, new URL(FATHER_ASSET_URL, location.href).href]));
const runtime = new VNextPersistenceRuntime({ session: createDocumentSession(binding.documentSnapshot, dependencies), repository,
  applicationDependencies: dependencies, createMutationId: () => crypto.randomUUID(), createOpenSessionId: () => crypto.randomUUID(),
  authLineage: 'controlled-advanced:1', authorityScopeId: 'controlled-advanced', binding, assetUrls: urls(), resolveAssetUrls: urls,
  autosave: { debounceMs: 150 } });
const publicationSource = (): PublicationSource | undefined => {
  const snap = runtime.workspace.getSnapshot();
  if (snap.dirty || snap.binding.kind !== 'PERSISTED') return undefined;
  return { document: snap.session.getSnapshot().document, openSessionId: snap.binding.openSessionId, remoteRevision: snap.binding.remoteRevision,
    authLineage: snap.binding.authLineage, authorityScopeId: snap.activeAuthorityScopeId, assetUrls: snap.assetUrls };
};
declare global {
  interface Window {
    __ADVANCED_TABLE__: {
      state(): { document: typeof seed; dirty: boolean; sequence: number; phase: string; catalogId: string; remoteRevision: number };
      source(): string[][];
      reopen(): Promise<unknown>;
    };
  }
}
window.__ADVANCED_TABLE__ = {
  state: () => { const snap = runtime.workspace.getSnapshot(); return { document: snap.session.getSnapshot().document,
    dirty: snap.dirty, sequence: snap.session.getSnapshot().localSequence, phase: snap.save.phase, catalogId: seed.id,
    remoteRevision: snap.binding.kind === 'PERSISTED' ? snap.binding.remoteRevision : 0 }; },
  source: () => advancedTechnicalMatrix(rows, columns),
  reopen: () => runtime.reopenCoordinator.open(seed.id),
};
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><VNextApp runtime={runtime} simpleByDefault getPublicationSource={publicationSource} /></React.StrictMode>);
