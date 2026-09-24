import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createDocumentSession,
  type ApplicationAction,
  type ApplicationActionResult,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  createW4EDiagnosticDocument,
  createW4EPageBoundDocument,
  createW4EPrimaryDocument,
  W4E_CATALOG_ID,
  W4E_DIAGNOSTIC_CATALOG_ID,
  W4E_PAGE_BOUND_CATALOG_ID,
  W4E_FIT_OBJECT_ID,
  W4E_INTERNAL_OBJECT_ID,
  W4E_PAGE_BOUND_OBJECT_ID,
} from './w4e-table-document';

const INITIAL_MUTATION_ID = 'eeeeeeee-cccc-4ccc-8ccc-eeeeeeeeeeee';
const USER_ID = 'eeeeeeee-9999-4999-8999-eeeeeeeeeeee';

function envelope(document: CatalogDocument, revision: number, mutationId: string): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-24T02:00:00.000Z',
    updatedAt: '2026-09-24T02:00:00.000Z',
    createdBy: USER_ID,
    updatedBy: USER_ID,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}class ProofRepository implements CatalogRepository {
  readonly records = new Map<string, CatalogPersistenceEnvelope>();
  saveCalls = 0;
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
    this.saveCalls += 1;
    const current = this.records.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const next = envelope(request.documentSnapshot, current.remoteRevision + 1, request.mutationId);
    this.records.set(request.catalogId, next);
    return { ok: true, value: next };
  };
}

const primary = createW4EPrimaryDocument();
const diagnostic = createW4EDiagnosticDocument();
const pageBound = createW4EPageBoundDocument();
const repository = new ProofRepository([
  envelope(primary, 1, INITIAL_MUTATION_ID),
  envelope(diagnostic, 1, INITIAL_MUTATION_ID),
  envelope(pageBound, 1, INITIAL_MUTATION_ID),
]);
const dependencies: ApplicationExecutionDependencies = { createId: () => crypto.randomUUID() };
const requestedCatalog = new URLSearchParams(window.location.search).get('catalog');
const initial = requestedCatalog === 'diagnostic'
  ? diagnostic
  : requestedCatalog === 'pagebound'
    ? pageBound
    : primary;
const session = createDocumentSession(initial, dependencies);
const runtime = new VNextPersistenceRuntime({
  session,
  repository,
  applicationDependencies: dependencies,
  createMutationId: () => crypto.randomUUID(),
  createOpenSessionId: () => crypto.randomUUID(),
  authLineage: 'proof-user:0',
  authorityScopeId: 'proof:w4e',
  binding: envelope(initial, 1, INITIAL_MUTATION_ID),
});

function tableSnapshot(document: CatalogDocument, objectId: string) {
  const object = document.pages.flatMap((page) => page.objects)
    .find((candidate) => candidate.id === objectId && candidate.type === 'table');
  if (!object || object.type !== 'table') return null;
  return {
    id: object.table.id,
    frame: object.frame,
    table: object.table,
  };
}

declare global {
  interface Window {
    __W4E_PROOF__: {
      state(): {
        catalogId: string;
        localSequence: number;
        document: CatalogDocument;
        fit: ReturnType<typeof tableSnapshot>;
        internal: ReturnType<typeof tableSnapshot>;
        pageBound: ReturnType<typeof tableSnapshot>;
        canUndo: boolean;
        canRedo: boolean;
        dirty: boolean;
        savePhase: string;
        saveCalls: number;
      };
      reopen(catalogId: string): Promise<unknown>;
      execute(action: ApplicationAction): ApplicationActionResult;
      readonly primaryId: string;
      readonly diagnosticId: string;
      readonly pageBoundId: string;
      readonly fitObjectId: string;
      readonly internalObjectId: string;
      readonly pageBoundObjectId: string;
    };
  }
}

window.__W4E_PROOF__ = {
  primaryId: W4E_CATALOG_ID,
  diagnosticId: W4E_DIAGNOSTIC_CATALOG_ID,
  pageBoundId: W4E_PAGE_BOUND_CATALOG_ID,
  fitObjectId: W4E_FIT_OBJECT_ID,
  internalObjectId: W4E_INTERNAL_OBJECT_ID,
  pageBoundObjectId: W4E_PAGE_BOUND_OBJECT_ID,
  state: () => {
    const workspace = runtime.workspace.getSnapshot();
    const current = workspace.session.getSnapshot();
    return {
      catalogId: current.document.id,
      localSequence: current.localSequence,
      document: current.document,
      fit: tableSnapshot(current.document, W4E_FIT_OBJECT_ID),
      internal: tableSnapshot(current.document, W4E_INTERNAL_OBJECT_ID),
      pageBound: tableSnapshot(current.document, W4E_PAGE_BOUND_OBJECT_ID),
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      dirty: workspace.dirty,
      savePhase: workspace.save.phase,
      saveCalls: repository.saveCalls,
    };
  },
  reopen: (catalogId) => runtime.reopenCoordinator.open(catalogId),
  execute: (action) => runtime.workspace.getSnapshot().session.execute(action),
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing W4.E proof root');
ReactDOM.createRoot(root).render(<React.StrictMode><VNextApp runtime={runtime} /></React.StrictMode>);
