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
  type CatalogListQuery,
  type ArchiveCatalogCasRequest,
  type CatalogListItem,
  type CatalogPersistenceEnvelope,
  type CatalogPersistenceMetadata,
  type CatalogRepository,
  type CreateCatalogRequest,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';

const SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const INITIAL_MUTATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STORAGE_PREFIX = 'w3h-proof:catalog:';

function createUuid(): string {
  return globalThis.crypto.randomUUID();
}

function documentFixture(): CatalogDocument {
  return {
    schemaVersion: 1,
    id: SOURCE_ID,
    title: 'W3.H controlled catalog',
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
      id: 'w3h-page-source',
      widthMm: 210,
      heightMm: 297,
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 92, heightMm: 24 },
        zIndex: 0,
        text: plainRichText('w3h-text-source', 'Persisted N'),
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
  lastMutationId: string,
  origin?: CatalogPersistenceEnvelope['origin'],
  archivedAt: string | null = null
): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision,
    lastMutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-15T23:00:00.000Z',
    updatedAt: new Date().toISOString(),
    createdBy: 'proof-user',
    updatedBy: 'proof-user',
    archivedAt,
    ...(origin ? { origin } : {}),
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

function key(catalogId: string): string {
  return `${STORAGE_PREFIX}${catalogId}`;
}

function read(catalogId: string): CatalogPersistenceEnvelope | undefined {
  const value = localStorage.getItem(key(catalogId));
  return value ? JSON.parse(value) as CatalogPersistenceEnvelope : undefined;
}

function write(value: CatalogPersistenceEnvelope): void {
  localStorage.setItem(key(value.catalogId), JSON.stringify(value));
}

function all(): CatalogPersistenceEnvelope[] {
  const values: CatalogPersistenceEnvelope[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const currentKey = localStorage.key(index);
    if (!currentKey?.startsWith(STORAGE_PREFIX)) continue;
    const value = localStorage.getItem(currentKey);
    if (value) values.push(JSON.parse(value) as CatalogPersistenceEnvelope);
  }
  return values;
}

if (!read(SOURCE_ID)) write(envelope(documentFixture(), 1, INITIAL_MUTATION_ID));

function documentText(document: CatalogDocument): string {
  const visit = (objects: CatalogDocument['pages'][number]['objects']): string | undefined => {
    for (const object of objects) {
      if (object.type === 'text') {
        return object.text.paragraphs
          .map((paragraph) => paragraph.inlines
            .map((inline) => inline.kind === 'text' ? inline.text : '\n')
            .join(''))
          .join('\n');
      }
      if (object.type === 'group') {
        const nested = visit(object.objects);
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  };
  const text = document.pages.flatMap((page) => [visit(page.objects)]).find((value) => value !== undefined);
  if (text === undefined) throw new Error('Missing proof Text object');
  return text;
}

interface HeldSave {
  readonly request: SaveCatalogCasRequest;
  readonly resolve: (result: PersistenceResult<CatalogPersistenceEnvelope>) => void;
}

class SharedStrictCasRepository implements CatalogRepository {
  private holdNext = false;
  private held: HeldSave | undefined;
  saveDispatchCount = 0;

  listCatalogs = async (query: CatalogListQuery = {}): Promise<PersistenceResult<readonly CatalogListItem[]>> => {
    const items = all()
      .filter((item) => query.includeArchived || item.archivedAt === null)
      .map(({ documentSnapshot: _document, lastMutationId: _mutation, ...item }) => item);
    return { ok: true, value: items };
  };

  getCatalog = async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const value = read(catalogId);
    return value ? { ok: true, value } : { ok: false, error: { code: 'NOT_FOUND' } };
  };

  createCatalog = async (request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    if (read(request.documentSnapshot.id)) return { ok: false, error: { code: 'CONFLICT' } };
    const created = envelope(request.documentSnapshot, 1, request.mutationId, request.origin);
    write(created);
    return { ok: true, value: created };
  };

  saveCAS = async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    this.saveDispatchCount += 1;
    if (this.holdNext) {
      this.holdNext = false;
      return new Promise((resolve) => {
        this.held = { request, resolve };
      });
    }
    return this.commitSave(request);
  };

  archiveCAS = async (request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> => {
    const current = read(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const archived = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    write(archived);
    const { documentSnapshot: _document, ...metadata } = archived;
    return { ok: true, value: metadata };
  };

  holdNextSave(): void {
    if (this.held) throw new Error('A save is already held');
    this.holdNext = true;
  }

  releaseHeldSave(): void {
    const held = this.held;
    if (!held) throw new Error('No held save to release');
    this.held = undefined;
    held.resolve(this.commitSave(held.request));
  }

  private commitSave(request: SaveCatalogCasRequest): PersistenceResult<CatalogPersistenceEnvelope> {
    const current = read(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const saved = envelope(
      request.documentSnapshot,
      current.remoteRevision + 1,
      request.mutationId,
      current.origin,
      current.archivedAt
    );
    write(saved);
    return { ok: true, value: saved };
  }

  heldRequest(): SaveCatalogCasRequest | undefined {
    return this.held?.request;
  }
}

const authoritativeAtOpen = read(SOURCE_ID);
if (!authoritativeAtOpen) throw new Error('Missing controlled authoritative source');
const repository = new SharedStrictCasRepository();
const applicationDependencies: ApplicationExecutionDependencies = { createId: createUuid };
const initialSession = createDocumentSession(authoritativeAtOpen.documentSnapshot, applicationDependencies);
const runtime = new VNextPersistenceRuntime({
  session: initialSession,
  repository,
  applicationDependencies,
  createMutationId: createUuid,
  createOpenSessionId: createUuid,
  authLineage: 'proof-user:0',
  authorityScopeId: 'proof:shared-strict-cas',
  binding: authoritativeAtOpen,
  autosave: { debounceMs: 80 },
});

function activeState() {
  const snapshot = runtime.workspace.getSnapshot();
  const binding = snapshot.binding;
  const activeDocument = snapshot.session.getSnapshot().document;
  const authoritative = read(SOURCE_ID);
  const heldRequest = repository.heldRequest();
  return {
    catalogId: activeDocument.id,
    text: documentText(activeDocument),
    localSequence: snapshot.session.getSnapshot().localSequence,
    canUndo: snapshot.session.getSnapshot().canUndo,
    canRedo: snapshot.session.getSnapshot().canRedo,
    dirty: snapshot.dirty,
    saveLabel: snapshot.save.label,
    savePhase: snapshot.save.phase,
    openSessionId: binding.openSessionId,
    binding,
    autosaveEnabled: Boolean(runtime.autosaveCoordinator),
    saveDispatchCount: repository.saveDispatchCount,
    heldText: heldRequest ? documentText(heldRequest.documentSnapshot) : null,
    authoritativeSource: authoritative ? {
      catalogId: authoritative.catalogId,
      remoteRevision: authoritative.remoteRevision,
      lastMutationId: authoritative.lastMutationId,
      text: documentText(authoritative.documentSnapshot),
    } : null,
    catalogIds: all().map((item) => item.catalogId).sort(),
  };
}

declare global {
  interface Window {
    __W3H_PROOF__: {
      readonly SOURCE_ID: string;
      state(): ReturnType<typeof activeState>;
      holdNextSave(): void;
      releaseHeldSave(): void;
      authoritative(catalogId: string): {
        readonly catalogId: string;
        readonly remoteRevision: number;
        readonly lastMutationId: string;
        readonly text: string;
      } | null;
    };
  }
}

window.__W3H_PROOF__ = {
  SOURCE_ID,
  state: activeState,
  holdNextSave: () => repository.holdNextSave(),
  releaseHeldSave: () => repository.releaseHeldSave(),
  authoritative: (catalogId) => {
    const value = read(catalogId);
    return value ? {
      catalogId: value.catalogId,
      remoteRevision: value.remoteRevision,
      lastMutationId: value.lastMutationId,
      text: documentText(value.documentSnapshot),
    } : null;
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing W3.H proof root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <VNextApp runtime={runtime} />
  </React.StrictMode>
);
