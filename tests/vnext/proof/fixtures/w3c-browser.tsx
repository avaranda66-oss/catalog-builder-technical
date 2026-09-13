import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createDocumentSession,
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

const A_ID = '11111111-1111-4111-8111-111111111111';
const B_ID = '22222222-2222-4222-8222-222222222222';
const INITIAL_MUTATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function documentFixture(id: string, title: string, text: string): CatalogDocument {
  return {
    schemaVersion: 1,
    id,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#172033'],
    },
    pages: [{
      id: `page-${id.slice(0, 4)}`,
      widthMm: 210,
      heightMm: 297,
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 92, heightMm: 24 },
        zIndex: 0,
        text: plainRichText(`text-${id.slice(0, 4)}`, text),
        style: {
          fontFamily: 'Noto Sans',
          fontSizePt: 12,
          lineHeight: 1.2,
          fontWeight: 700,
          color: '#172033',
          textAlign: 'left',
        },
      }],
    }],
    assets: [],
  };
}

function envelope(
  document: CatalogDocument,
  remoteRevision: number,
  lastMutationId: string
): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision,
    lastMutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-12T20:00:00.000Z',
    updatedAt: '2026-09-12T20:00:00.000Z',
    createdBy: '99999999-9999-4999-8999-999999999999',
    updatedBy: '99999999-9999-4999-8999-999999999999',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

function unsupported<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({
    ok: false,
    error: { code: 'REMOTE_FAILURE', message: 'Not used by W3.C browser proof' },
  });
}

interface PendingSave {
  readonly request: SaveCatalogCasRequest;
  readonly resolve: (result: PersistenceResult<CatalogPersistenceEnvelope>) => void;
}

class ProofRepository implements CatalogRepository {
  readonly records = new Map<string, CatalogPersistenceEnvelope>();
  readonly pending: PendingSave[] = [];

  constructor(initial: readonly CatalogPersistenceEnvelope[]) {
    for (const item of initial) this.records.set(item.catalogId, item);
  }

  listCatalogs = () => unsupported<readonly never[]>();
  createCatalog = () => unsupported<CatalogPersistenceEnvelope>();
  archiveCAS = () => unsupported<never>();

  getCatalog = async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const record = this.records.get(catalogId);
    return record
      ? { ok: true, value: record }
      : { ok: false, error: { code: 'NOT_FOUND' } };
  };

  saveCAS = (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> =>
    new Promise((resolve) => {
      this.pending.push({ request, resolve });
    });

  acknowledgeNext(): void {
    const pending = this.pending.shift();
    if (!pending) throw new Error('No pending save to acknowledge');
    const current = this.records.get(pending.request.catalogId);
    if (!current) throw new Error('Missing authoritative catalog');
    if (current.remoteRevision !== pending.request.expectedRemoteRevision) {
      pending.resolve({ ok: false, error: { code: 'CONFLICT' } });
      return;
    }
    const next = envelope(
      pending.request.documentSnapshot,
      pending.request.expectedRemoteRevision + 1,
      pending.request.mutationId
    );
    this.records.set(next.catalogId, next);
    pending.resolve({ ok: true, value: next });
  }
}

const documentA = documentFixture(A_ID, 'Catalog A', 'A persisted');
const documentB = documentFixture(B_ID, 'Catalog B', 'B persisted');
const repository = new ProofRepository([
  envelope(documentA, 1, INITIAL_MUTATION_ID),
  envelope(documentB, 5, INITIAL_MUTATION_ID),
]);
let generated = 0;
const createUuid = (): string => {
  generated += 1;
  return `00000000-0000-4000-8000-${generated.toString().padStart(12, '0')}`;
};
const applicationDependencies: ApplicationExecutionDependencies = { createId: createUuid };
const initialSession = createDocumentSession(documentA, applicationDependencies);
const runtime = new VNextPersistenceRuntime({
  session: initialSession,
  repository,
  applicationDependencies,
  createMutationId: createUuid,
  createOpenSessionId: createUuid,
  authLineage: 'proof-user:0',
  binding: envelope(documentA, 1, INITIAL_MUTATION_ID),
});

function documentText(document: CatalogDocument): string {
  const object = document.pages[0]?.objects.find((entry) => entry.id === 'text-target');
  if (!object || object.type !== 'text') throw new Error('Missing proof Text object');
  return object.text.paragraphs
    .map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '\n').join(''))
    .join('\n');
}

function activeState() {
  const snapshot = runtime.workspace.getSnapshot();
  const pendingRequest = repository.pending[0]?.request;
  return {
    catalogId: snapshot.session.getSnapshot().document.id,
    title: snapshot.session.getSnapshot().document.title,
    text: documentText(snapshot.session.getSnapshot().document),
    localSequence: snapshot.session.getSnapshot().localSequence,
    canUndo: snapshot.session.getSnapshot().canUndo,
    canRedo: snapshot.session.getSnapshot().canRedo,
    dirty: snapshot.dirty,
    saveLabel: snapshot.save.label,
    savePhase: snapshot.save.phase,
    saveMessage: snapshot.save.message ?? null,
    openSessionId: snapshot.binding.openSessionId,
    binding: snapshot.binding,
    pendingSaves: repository.pending.length,
    pendingText: pendingRequest ? documentText(pendingRequest.documentSnapshot) : null,
  };
}

declare global {
  interface Window {
    __W3C_PROOF__: {
      readonly A_ID: string;
      readonly B_ID: string;
      state(): ReturnType<typeof activeState>;
      acknowledgeNext(): void;
      open(catalogId: string, allowDiscardUnsaved?: boolean): Promise<unknown>;
      authoritative(catalogId: string): {
        remoteRevision: number;
        lastMutationId: string;
        text: string;
      } | undefined;
    };
  }
}

window.__W3C_PROOF__ = {
  A_ID,
  B_ID,
  state: activeState,
  acknowledgeNext: () => repository.acknowledgeNext(),
  open: (catalogId, allowDiscardUnsaved = false) =>
    runtime.reopenCoordinator.open(catalogId, { allowDiscardUnsaved }),
  authoritative: (catalogId) => {
    const item = repository.records.get(catalogId);
    return item ? {
      remoteRevision: item.remoteRevision,
      lastMutationId: item.lastMutationId,
      text: documentText(item.documentSnapshot),
    } : undefined;
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing W3.C proof root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <VNextApp runtime={runtime} />
  </React.StrictMode>
);
