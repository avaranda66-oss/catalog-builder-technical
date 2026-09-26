import React from 'react';
import ReactDOM from 'react-dom/client';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  createW4F2Document,
  W4F2_CATALOG_ID,
  W4F2_MERGED_OBJECT_ID,
  W4F2_OBJECT_ID,
  W4F2_OTHER_CATALOG_ID,
} from './w4f2-table-document';

const INITIAL_MUTATION_ID = 'f2222222-aaaa-4aaa-8aaa-222222222222';
const USER_ID = '99999999-9999-4999-8999-999999999999';

function envelope(
  document: ReturnType<typeof createW4F2Document>,
  revision: number,
  mutationId: string
): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-25T12:00:00.000Z',
    updatedAt: '2026-09-25T12:00:00.000Z',
    createdBy: USER_ID,
    updatedBy: USER_ID,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

class ProofRepository implements CatalogRepository {
  readonly records = new Map<string, CatalogPersistenceEnvelope>();
  constructor(items: readonly CatalogPersistenceEnvelope[]) {
    items.forEach((item) => this.records.set(item.catalogId, item));
  }
  listCatalogs = async () => ({ ok: true as const, value: [] });
  createCatalog = async () => ({ ok: false as const, error: { code: 'REMOTE_FAILURE' as const } });
  archiveCAS = async () => ({ ok: false as const, error: { code: 'REMOTE_FAILURE' as const } });
  getCatalog = async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const item = this.records.get(catalogId);
    return item ? { ok: true, value: item } : { ok: false, error: { code: 'NOT_FOUND' } };
  };
  saveCAS = async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const current = this.records.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const next = envelope(request.documentSnapshot, current.remoteRevision + 1, request.mutationId);
    this.records.set(request.catalogId, next);
    return { ok: true, value: next };
  };
}

const primary = createW4F2Document();
const other = createW4F2Document(W4F2_OTHER_CATALOG_ID, 'Outro catálogo W4.F.2');
const repository = new ProofRepository([
  envelope(primary, 1, INITIAL_MUTATION_ID),
  envelope(other, 1, INITIAL_MUTATION_ID),
]);
const dependencies: ApplicationExecutionDependencies = { createId: () => crypto.randomUUID() };
const session = createDocumentSession(primary, dependencies);
const runtime = new VNextPersistenceRuntime({
  session,
  repository,
  applicationDependencies: dependencies,
  createMutationId: () => crypto.randomUUID(),
  createOpenSessionId: () => crypto.randomUUID(),
  authLineage: 'proof-user:0',
  authorityScopeId: 'proof:w4f2',
  binding: envelope(primary, 1, INITIAL_MUTATION_ID),
});

function tableState(document: ReturnType<typeof createW4F2Document>, objectId: string) {
  for (const page of document.pages) {
    const object = page.objects.find((entry) => entry.id === objectId);
    if (object?.type === 'table') return { frame: object.frame, table: object.table };
  }
  return null;
}

declare global {
  interface Window {
    __W4F2_PROOF__: {
      state(): {
        catalogId: string;
        localSequence: number;
        dirty: boolean;
        savePhase: string;
        canUndo: boolean;
        canRedo: boolean;
        document: ReturnType<typeof createW4F2Document>;
        main: ReturnType<typeof tableState>;
        merged: ReturnType<typeof tableState>;
      };
      reopen(catalogId: string): Promise<unknown>;
      readonly primaryId: string;
      readonly otherId: string;
      readonly mainObjectId: string;
      readonly mergedObjectId: string;
    };
  }
}

window.__W4F2_PROOF__ = {
  primaryId: W4F2_CATALOG_ID,
  otherId: W4F2_OTHER_CATALOG_ID,
  mainObjectId: W4F2_OBJECT_ID,
  mergedObjectId: W4F2_MERGED_OBJECT_ID,
  state: () => {
    const workspace = runtime.workspace.getSnapshot();
    const current = workspace.session.getSnapshot();
    return {
      catalogId: current.document.id,
      localSequence: current.localSequence,
      dirty: workspace.dirty,
      savePhase: workspace.save.phase,
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      document: current.document,
      main: tableState(current.document, W4F2_OBJECT_ID),
      merged: tableState(current.document, W4F2_MERGED_OBJECT_ID),
    };
  },
  reopen: (catalogId) => runtime.reopenCoordinator.open(catalogId),
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing W4.F.2 proof root');
ReactDOM.createRoot(root).render(<React.StrictMode><VNextApp runtime={runtime} /></React.StrictMode>);
