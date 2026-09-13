import ReactDOM from 'react-dom/client';
import { createDocumentSession, projectEditableRichText } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { IndexedDbRecoveryRepository, type RecoveryStartupCandidate } from '@/vnext/recovery';

const CATALOG_ID = '11111111-1111-4111-8111-111111111111';
const MUTATION_0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MUTATION_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const databaseName = 'catalog_builder_vnext_recovery_physical_proof';
const params = new URLSearchParams(window.location.search);
const authorityScopeId = params.get('scope') ?? 'physical:user-a';
const remoteMode = params.get('remote') ?? 'base';

function baseDocument(title = 'Cloud A'): CatalogDocument {
  return {
    schemaVersion: 1,
    id: CATALOG_ID,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 12,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#172033'],
    },
    pages: [{
      id: 'page-1',
      widthMm: 210,
      heightMm: 297,
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 },
        zIndex: 0,
        text: plainRichText('text-local', 'Canonical A'),
        style: { fontFamily: 'Noto Sans', fontSizePt: 12, lineHeight: 1.2 },
      }],
    }],
    assets: [],
  };
}

function envelope(
  documentSnapshot: CatalogDocument,
  remoteRevision = 1,
  lastMutationId = MUTATION_0
): CatalogPersistenceEnvelope {
  return {
    catalogId: CATALOG_ID,
    remoteRevision,
    lastMutationId,
    title: documentSnapshot.title,
    locale: documentSnapshot.locale,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

function failure<T>(code: 'OFFLINE' | 'REMOTE_FAILURE' = 'REMOTE_FAILURE'): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code } });
}

const recoveryRepository = new IndexedDbRecoveryRepository({ databaseName });
let lastSaveRequest: SaveCatalogCasRequest | undefined;
let controlledResolve: ((result: PersistenceResult<CatalogPersistenceEnvelope>) => void) | undefined;
let activeSave: Promise<unknown> | undefined;
let committedCache: CatalogPersistenceEnvelope | undefined;

async function pendingEnvelope(): Promise<CatalogPersistenceEnvelope | undefined> {
  const records = await recoveryRepository.listByScope(authorityScopeId);
  const pending = records.find(
    (entry) => entry.status === 'VALID' && entry.record.pendingRemoteMutation
  );
  if (!pending || pending.status !== 'VALID' || !pending.record.pendingRemoteMutation) return undefined;
  const mutation = pending.record.pendingRemoteMutation;
  return envelope(
    mutation.attemptedDocumentSnapshot,
    mutation.expectedRemoteRevision + 1,
    mutation.mutationId
  );
}

const repository: CatalogRepository = {
  listCatalogs: () => failure(),
  createCatalog: () => failure(),
  archiveCAS: () => failure(),
  getCatalog: async () => {
    if (committedCache) return { ok: true, value: committedCache };
    if (remoteMode === 'unavailable') return { ok: false, error: { code: 'OFFLINE' } };
    if (remoteMode === 'committed') {
      const committed = committedCache ?? await pendingEnvelope();
      if (committed) committedCache = committed;
      return committed
        ? { ok: true, value: committed }
        : { ok: true, value: envelope(baseDocument()) };
    }
    if (remoteMode === 'mismatch') {
      return { ok: true, value: envelope(baseDocument('Unexpected same revision')) };
    }
    if (remoteMode === 'newer') {
      return { ok: true, value: envelope(baseDocument('Newer remote'), 2, MUTATION_OTHER) };
    }
    return { ok: true, value: envelope(baseDocument()) };
  },
  saveCAS: (request) => {
    lastSaveRequest = request;
    if (remoteMode === 'replay') {
      committedCache = envelope(
        request.documentSnapshot,
        request.expectedRemoteRevision + 1,
        request.mutationId
      );
      return Promise.resolve({
        ok: true,
        value: committedCache,
      });
    }
    if (remoteMode === 'controlled' || remoteMode === 'hang') {
      return new Promise((resolve) => {
        controlledResolve = resolve;
      });
    }
    return failure();
  },
};

const initialRemoteDocument = remoteMode === 'mismatch'
  ? baseDocument('Unexpected same revision')
  : remoteMode === 'newer'
    ? baseDocument('Newer remote')
    : baseDocument();
const initialEnvelope = remoteMode === 'newer'
  ? envelope(initialRemoteDocument, 2, MUTATION_OTHER)
  : envelope(initialRemoteDocument);
const session = createDocumentSession(initialRemoteDocument, { createId: () => crypto.randomUUID() });
const runtime = new VNextPersistenceRuntime({
  session,
  repository,
  applicationDependencies: { createId: () => crypto.randomUUID() },
  createMutationId: () => crypto.randomUUID(),
  createOpenSessionId: () => crypto.randomUUID(),
  authLineage: `${authorityScopeId}:0`,
  authorityScopeId,
  recoveryRepository,
  ...(remoteMode === 'unavailable' ? {} : { binding: initialEnvelope }),
});

function canonicalText(): string | null {
  const object = runtime.workspace.getSnapshot().session.getSnapshot().document.pages[0].objects[0];
  return object.type === 'text' ? projectEditableRichText(object.text) : null;
}

const proofApi = {
  ready: true,
  databaseName,
  authorityScopeId,
  editTitle(title: string) {
    return runtime.workspace.getSnapshot().session.execute({ type: 'document.rename', title });
  },
  startSave() {
    activeSave = runtime.saveCoordinator.save();
  },
  awaitSave() {
    return activeSave;
  },
  resolveSave() {
    if (!controlledResolve || !lastSaveRequest) throw new Error('No controlled save');
    controlledResolve({
      ok: true,
      value: envelope(
        lastSaveRequest.documentSnapshot,
        lastSaveRequest.expectedRemoteRevision + 1,
        lastSaveRequest.mutationId
      ),
    });
  },
  flushRecovery() {
    return runtime.recoveryManager?.flush();
  },
  list(scope = runtime.workspace.getSnapshot().activeAuthorityScopeId) {
    return recoveryRepository.listByScope(scope);
  },
  discover(scope = runtime.workspace.getSnapshot().activeAuthorityScopeId) {
    return runtime.recoveryStartup?.discover(scope);
  },
  updateAuth(scope: string) {
    runtime.updateAuthContext(`${scope}:1`, scope);
  },
  async attemptForeign(candidate: RecoveryStartupCandidate, scope: string) {
    const startup = runtime.recoveryStartup;
    if (!startup) throw new Error('Recovery startup unavailable');
    let inspectDenied = false;
    let discardDenied = false;
    let recoverDenied: boolean;
    try {
      startup.inspect(candidate, scope);
    } catch {
      inspectDenied = true;
    }
    try {
      await startup.discard(candidate, scope);
    } catch {
      discardDenied = true;
    }
    try {
      const recovered = await runtime.recover(candidate);
      recoverDenied = !recovered;
    } catch {
      recoverDenied = true;
    }
    return { inspectDenied, discardDenied, recoverDenied };
  },
  snapshot() {
    const current = runtime.workspace.getSnapshot();
    return {
      openSessionId: current.binding.openSessionId,
      bindingKind: current.binding.kind,
      remoteRevision: current.binding.kind === 'PERSISTED' ? current.binding.remoteRevision : undefined,
      authorityScopeId: current.activeAuthorityScopeId,
      document: current.session.getSnapshot().document,
      canonicalText: canonicalText(),
      localSequence: current.session.getSnapshot().localSequence,
      canUndo: current.session.getSnapshot().canUndo,
      canRedo: current.session.getSnapshot().canRedo,
      save: current.save,
      lastSaveRequest,
    };
  },
};

declare global {
  interface Window { __W3D_PROOF__: typeof proofApi }
}
window.__W3D_PROOF__ = proofApi;

ReactDOM.createRoot(document.getElementById('root')!).render(<VNextApp runtime={runtime} />);
