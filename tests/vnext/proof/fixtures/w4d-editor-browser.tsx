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
  createW4DTableDocument,
  W4D_CATALOG_ID,
  W4D_OTHER_CATALOG_ID,
  W4D_OBJECT_A_ID,
  W4D_OBJECT_B_ID,
} from './w4d-table-document';

const INITIAL_MUTATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = '99999999-9999-4999-8999-999999999999';

function envelope(document: ReturnType<typeof createW4DTableDocument>, revision: number, mutationId: string): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-22T12:00:00.000Z',
    updatedAt: '2026-09-22T12:00:00.000Z',
    createdBy: USER_ID,
    updatedBy: USER_ID,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

class ProofRepository implements CatalogRepository {
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

const primary = createW4DTableDocument();
const other = createW4DTableDocument(W4D_OTHER_CATALOG_ID, 'Outro catálogo');
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
  authorityScopeId: 'proof:w4d',
  binding: envelope(primary, 1, INITIAL_MUTATION_ID),
});

function tableSnapshot(document: ReturnType<typeof createW4DTableDocument>, objectId: string) {
  const object = document.pages.flatMap((page) => page.objects)
    .find((candidate) => candidate.id === objectId && candidate.type === 'table');
  if (!object || object.type !== 'table') return null;
  return {
    id: object.table.id,
    cells: object.table.cells.map((cell) => ({
      id: cell.id,
      rowId: cell.rowId,
      columnId: cell.columnId,
      content: cell.content,
      style: cell.style,
      presentation: cell.contentPresentation,
      ...(cell.coveredBy ? { coveredBy: cell.coveredBy } : {}),
      ...(cell.span ? { span: cell.span } : {}),
      ...(cell.annotationIds ? { annotationIds: cell.annotationIds } : {}),
    })),
    legend: object.table.legend,
    annotations: object.table.annotations,
  };
}

declare global {
  interface Window {
    __W4D_PROOF__: {
      state(): {
        catalogId: string;
        localSequence: number;
        document: ReturnType<typeof createW4DTableDocument>;
        tableA: ReturnType<typeof tableSnapshot>;
        tableB: ReturnType<typeof tableSnapshot>;
        canUndo: boolean;
        canRedo: boolean;
        dirty: boolean;
        savePhase: string;
        saveCalls: number;
      };
      reopen(catalogId: string): Promise<unknown>;
      readonly primaryId: string;
      readonly otherId: string;
      readonly objectAId: string;
      readonly objectBId: string;
    };
  }
}

window.__W4D_PROOF__ = {
  primaryId: W4D_CATALOG_ID,
  otherId: W4D_OTHER_CATALOG_ID,
  objectAId: W4D_OBJECT_A_ID,
  objectBId: W4D_OBJECT_B_ID,
  state: () => {
    const workspace = runtime.workspace.getSnapshot();
    const current = workspace.session.getSnapshot();
    const document = current.document as ReturnType<typeof createW4DTableDocument>;
    return {
      catalogId: document.id,
      localSequence: current.localSequence,
      document,
      tableA: tableSnapshot(document, W4D_OBJECT_A_ID),
      tableB: tableSnapshot(document, W4D_OBJECT_B_ID),
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      dirty: workspace.dirty,
      savePhase: workspace.save.phase,
      saveCalls: repository.saveCalls,
    };
  },
  reopen: (catalogId) => runtime.reopenCoordinator.open(catalogId),
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing W4.D proof root');
ReactDOM.createRoot(root).render(<React.StrictMode><VNextApp runtime={runtime} /></React.StrictMode>);
