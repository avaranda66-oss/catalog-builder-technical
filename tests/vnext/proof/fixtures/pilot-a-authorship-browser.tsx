import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createDocumentSession,
  projectEditableRichText,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { InMemoryRecoveryRepository } from '@/vnext/recovery';
import {
  createW4F3Document,
  W4F3_CATALOG_ID,
  W4F3_OBJECT_ID,
  W4F3_OTHER_CATALOG_ID,
} from './w4f3-table-document';

export const PILOT_A_TEXT_ID = 'pilot-a-text';
export const PILOT_A_SECOND_PAGE_ID = 'pilot-a-second-page';
const INITIAL_MUTATION_ID = 'a1111111-aaaa-4aaa-8aaa-111111111111';
const USER_ID = '99999999-9999-4999-8999-999999999999';
function createPilotDocument(id = W4F3_CATALOG_ID, title = 'PILOT.A Authorship Trust'): CatalogDocument {
  const document = createW4F3Document(id, title);
  if (id !== W4F3_CATALOG_ID) return document;
  document.pages[0].objects.push({
    id: PILOT_A_TEXT_ID,
    type: 'text',
    frame: { xMm: 150, yMm: 14, widthMm: 44, heightMm: 20 },
    zIndex: 50,
    text: plainRichText('pilot-a-text-rich', 'Texto inicial PILOT.A'),
    style: {
      fontFamily: 'Noto Sans',
      fontSizePt: 9,
      lineHeight: 1.2,
      fontWeight: 400,
      color: '#172033',
      textAlign: 'left',
    },
  });
  document.pages.push({
    id: PILOT_A_SECOND_PAGE_ID,
    widthMm: 210,
    heightMm: 297,
    objects: [],
  });
  return document;
}

function envelope(document: CatalogDocument, revision: number, mutationId: string): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-29T13:00:00.000Z',
    updatedAt: '2026-09-29T13:00:00.000Z',
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
    if (current.remoteRevision !== request.expectedRemoteRevision) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const next = envelope(request.documentSnapshot, current.remoteRevision + 1, request.mutationId);
    this.records.set(next.catalogId, next);
    return { ok: true, value: next };
  };
}

const primary = createPilotDocument();
const other = createPilotDocument(W4F3_OTHER_CATALOG_ID, 'Outro catálogo PILOT.A');
const repository = new ProofRepository([
  envelope(primary, 1, INITIAL_MUTATION_ID),
  envelope(other, 1, INITIAL_MUTATION_ID),
]);
const recoveryRepository = new InMemoryRecoveryRepository();

function createRuntime(binding: CatalogPersistenceEnvelope): VNextPersistenceRuntime {
  const dependencies: ApplicationExecutionDependencies = { createId: () => crypto.randomUUID() };
  const session = createDocumentSession(structuredClone(binding.documentSnapshot), dependencies);
  return new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies: dependencies,
    createMutationId: () => crypto.randomUUID(),
    createOpenSessionId: () => crypto.randomUUID(),
    authLineage: 'proof-user:0',
    authorityScopeId: 'proof-user',
    recoveryRepository,
    binding,
    autosave: false,
  });
}

function plainText(document: CatalogDocument): string {
  const object = document.pages[0]?.objects.find((entry) => entry.id === PILOT_A_TEXT_ID);
  if (!object || object.type !== 'text') throw new Error('Missing PILOT.A Text object');
  return projectEditableRichText(object.text) ?? '';
}
function titleText(document: CatalogDocument): string | null {
  const object = document.pages[0]?.objects.find((entry) => entry.id === W4F3_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Missing PILOT.A Table object');
  return object.table.title ? projectEditableRichText(object.table.title) : null;
}

let activeRuntime = createRuntime(repository.records.get(W4F3_CATALOG_ID)!);
let libraryAttempts = 0;
let libraryBlocks = 0;
let libraryNavigations = 0;
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing PILOT.A proof root');
const reactRoot = ReactDOM.createRoot(rootElement);

function requestLibrary(): void {
  libraryAttempts += 1;
  if (activeRuntime.workspace.getSnapshot().dirty) {
    libraryBlocks += 1;
    return;
  }
  libraryNavigations += 1;
}
function renderActive(): void {
  const key = activeRuntime.workspace.getSnapshot().binding.openSessionId;
  reactRoot.render(
    <React.StrictMode>
      <VNextApp key={key} runtime={activeRuntime} onRequestLibrary={requestLibrary} />
    </React.StrictMode>
  );
}
renderActive();

function currentState() {
  const workspace = activeRuntime.workspace.getSnapshot();
  const snapshot = workspace.session.getSnapshot();
  return {
    catalogId: snapshot.document.id,
    document: snapshot.document,
    text: snapshot.document.id === W4F3_CATALOG_ID ? plainText(snapshot.document) : null,
    title: snapshot.document.id === W4F3_CATALOG_ID ? titleText(snapshot.document) : null,
    dirty: workspace.dirty,
    saveLabel: workspace.save.label,
    savePhase: workspace.save.phase,
    localSequence: snapshot.localSequence,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
    pendingDraft: activeRuntime.workspace.getAuthoringBarrier().hasPendingDraft(),
    overlay: activeRuntime.workspace.captureRecoveryOverlay() ?? null,
    libraryAttempts,
    libraryBlocks,
    libraryNavigations,
  };
}

async function recoverFromCrash(): Promise<{ ok: boolean; candidateKinds: string[] }> {
  await activeRuntime.recoveryManager?.flush();
  const crashedCatalogId = activeRuntime.workspace.getSnapshot().session.getSnapshot().document.id;
  await activeRuntime.dispose();
  const authoritative = repository.records.get(crashedCatalogId);
  if (!authoritative) throw new Error('Missing authoritative record for crash recovery');
  const fresh = createRuntime(authoritative);
  const candidates = await fresh.recoveryStartup!.discover('proof-user');
  const candidate = candidates.find((entry) =>
    entry.inspection.status === 'VALID'
    && entry.inspection.record.authoringRecoveryOverlay?.kind === 'TABLE_TITLE_DRAFT_V1'
  );
  const ok = candidate ? await fresh.recover(candidate) : false;
  activeRuntime = fresh;
  renderActive();
  return { ok, candidateKinds: candidates.map((entry) => entry.decision.kind) };
}

declare global {
  interface Window {
    __PILOT_A_PROOF__: {
      readonly primaryId: string;
      readonly otherId: string;
      readonly tableObjectId: string;
      readonly textObjectId: string;
      readonly secondPageId: string;
      state(): ReturnType<typeof currentState>;
      reopen(catalogId: string): Promise<unknown>;
      recoverFromCrash(): Promise<{ ok: boolean; candidateKinds: string[] }>;
      authoritative(catalogId: string): { revision: number; text: string | null; title: string | null } | null;
    };
  }
}

window.__PILOT_A_PROOF__ = {
  primaryId: W4F3_CATALOG_ID,
  otherId: W4F3_OTHER_CATALOG_ID,
  tableObjectId: W4F3_OBJECT_ID,
  textObjectId: PILOT_A_TEXT_ID,
  secondPageId: PILOT_A_SECOND_PAGE_ID,
  state: currentState,
  reopen: async (catalogId: string) => activeRuntime.reopenCoordinator.open(catalogId),
  recoverFromCrash,
  authoritative: (catalogId: string) => {
    const item = repository.records.get(catalogId);
    if (!item) return null;
    return {
      revision: item.remoteRevision,
      text: catalogId === W4F3_CATALOG_ID ? plainText(item.documentSnapshot) : null,
      title: catalogId === W4F3_CATALOG_ID ? titleText(item.documentSnapshot) : null,
    };
  },
};
