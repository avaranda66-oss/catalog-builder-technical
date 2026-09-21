import React from 'react';
import ReactDOM from 'react-dom/client';
import { createDocumentSession, type ApplicationExecutionDependencies, type TableCellContentInput } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  createW4BTableDocument,
  W4B_CATALOG_ID,
  W4B_OTHER_CATALOG_ID,
} from './w4b-table-document';

const INITIAL_MUTATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '99999999-9999-4999-8999-999999999999';

function envelope(document: ReturnType<typeof createW4BTableDocument>, revision: number, mutationId: string): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
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

const primary = createW4BTableDocument();
const other = createW4BTableDocument(W4B_OTHER_CATALOG_ID, 'Outro catÃ¡logo');
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
  authorityScopeId: 'proof:w4b',
  binding: envelope(primary, 1, INITIAL_MUTATION_ID),
});

declare global {
  interface Window {
    __W4B_PROOF__: {
      state(): {
        catalogId: string;
        localSequence: number;
        document: unknown;
        cells: Array<{ id: string; content: unknown; style: unknown; presentation: unknown; coveredBy?: string }>;
        frame: unknown;
        canUndo: boolean;
        canRedo: boolean;
        dirty: boolean;
        savePhase: string;
        saveCalls: number;
      };
      reopen(catalogId: string): Promise<unknown>;
      mutateContent(cellId: string, content: TableCellContentInput): boolean;
      readonly primaryId: string;
      readonly otherId: string;
    };
  }
}

window.__W4B_PROOF__ = {
  primaryId: W4B_CATALOG_ID,
  otherId: W4B_OTHER_CATALOG_ID,
  state: () => {
    const workspace = runtime.workspace.getSnapshot();
    const current = workspace.session.getSnapshot();
    const table = current.document.pages.flatMap((page) => page.objects).find((object) => object.type === 'table');
    return {
      catalogId: current.document.id,
      localSequence: current.localSequence,
      document: current.document,
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      cells: table?.type === 'table' ? table.table.cells.map((cell) => ({
        id: cell.id,
        content: cell.content,
        style: cell.style,
        presentation: cell.contentPresentation,
        ...(cell.coveredBy ? { coveredBy: cell.coveredBy } : {}),
      })) : [],
      frame: table?.frame,
      dirty: workspace.dirty,
      savePhase: workspace.save.phase,
      saveCalls: repository.saveCalls,
    };
  },
  reopen: (catalogId) => runtime.reopenCoordinator.open(catalogId),
  mutateContent: (cellId, content) => {
    const currentSession = runtime.workspace.getSnapshot().session;
    const document = currentSession.getSnapshot().document;
    const page = document.pages[0];
    const object = page.objects.find((candidate) => candidate.type === 'table');
    if (!object || object.type !== 'table') return false;
    const cell = object.table.cells.find((candidate) => candidate.id === cellId);
    if (!cell) return false;
    return currentSession.execute({
      type: 'table.cell.setContent',
      pageId: page.id,
      objectId: object.id,
      tableId: object.table.id,
      cellId,
      expectedContent: cell.content,
      content,
      allowTypeChange: cell.content.type === content.type ? undefined : true,
    }).ok;
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing W4.A proof root');
ReactDOM.createRoot(root).render(<React.StrictMode><VNextApp runtime={runtime} /></React.StrictMode>);
