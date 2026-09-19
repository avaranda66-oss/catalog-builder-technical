import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  authoredStructuralIdentityIds,
  createCatalogDocument,
  createDocumentSession,
  createStaticPageTemplateRegistry,
  projectEditableRichText,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import { VNextApp } from '@/vnext/app/VNextApp';
import {
  DefaultAssetPersistenceBridge,
  type AssetFinalizationResult,
  type AssetRecord,
  type AssetRepository,
} from '@/vnext/asset';
import type { CatalogDocument } from '@/vnext/domain';
import {
  CatalogLibraryService,
  createDefaultCatalogStarterRegistry,
  createStaticCatalogStarterRegistry,
} from '@/vnext/library';
import {
  VNextPersistenceRuntime,
  canonicalDocumentEquivalence,
  type ArchiveCatalogCasRequest,
  type CatalogListItem,
  type CatalogListQuery,
  type CatalogPersistenceEnvelope,
  type CatalogPersistenceMetadata,
  type CatalogRepository,
  type CreateCatalogRequest,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { IndexedDbRecoveryRepository } from '@/vnext/recovery';

const STORAGE_PREFIX = 'w3i-proof:';
const CATALOG_PREFIX = `${STORAGE_PREFIX}catalog:`;
const ASSET_RECORD_PREFIX = `${STORAGE_PREFIX}asset-record:`;
const ASSET_BYTES_PREFIX = `${STORAGE_PREFIX}asset-bytes:`;
const AUTH_LINEAGE = 'father-proof:0';
const AUTHORITY_SCOPE_ID = 'father-proof:workspace:user';
const INITIAL_ASSET_ID = '11111111-1111-4111-8111-111111111111';
const INITIAL_ASSET_SHA256 = '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460';
const INITIAL_ASSET_PATH = `vnext/${INITIAL_ASSET_ID}/1.png`;
const INITIAL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const params = new URLSearchParams(window.location.search);
const recoveryDatabaseName = params.get('db') ?? 'catalog_builder_vnext_w3i_proof';

function createUuid(): string {
  return globalThis.crypto.randomUUID();
}

const applicationDependencies: ApplicationExecutionDependencies = {
  createId: createUuid,
  templateRegistry: createStaticPageTemplateRegistry([]),
};
const defaultStarter = createDefaultCatalogStarterRegistry().get('essential-technical-sheet');
if (!defaultStarter) throw new Error('Missing canonical W3.I Starter source');
const controlledStarterDocument: CatalogDocument = {
  ...defaultStarter.sourceDocument,
  pages: defaultStarter.sourceDocument.pages.map((page, index) => index === 0 ? {
    ...page,
    objects: [...page.objects, {
      id: 'starter-father-image',
      type: 'image',
      assetId: INITIAL_ASSET_ID,
      frame: { xMm: 12, yMm: 132, widthMm: 72, heightMm: 72 },
      zIndex: page.objects.length,
      fit: 'contain',
    }],
  } : page),
  assets: [{
    id: INITIAL_ASSET_ID,
    version: '1',
    sha256: INITIAL_ASSET_SHA256,
    mime: 'image/png',
    widthPx: 1,
    heightPx: 1,
    name: 'starter-father.png',
    alt: 'Imagem inicial do catálogo',
  }],
};
const starterRegistry = createStaticCatalogStarterRegistry([{
  ...defaultStarter,
  sourceDocument: controlledStarterDocument,
}]);

function seedInitialAsset(): void {
  const recordKey = `${ASSET_RECORD_PREFIX}${INITIAL_ASSET_ID}`;
  if (!localStorage.getItem(recordKey)) {
    const record: AssetRecord = {
      id: INITIAL_ASSET_ID,
      version: '1',
      sha256: INITIAL_ASSET_SHA256,
      mime: 'image/png',
      widthPx: 1,
      heightPx: 1,
      name: 'starter-father.png',
      alt: 'Imagem inicial do catálogo',
      storageBucket: 'product-assets',
      storagePath: INITIAL_ASSET_PATH,
      fileSize: 68,
      createdAt: '2026-09-19T00:00:00.000Z',
    };
    localStorage.setItem(recordKey, JSON.stringify(record));
  }
  const bytesKey = `${ASSET_BYTES_PREFIX}${INITIAL_ASSET_PATH}`;
  if (!localStorage.getItem(bytesKey)) {
    const binary = atob(INITIAL_PNG_BASE64);
    const bytes = Array.from(binary, (character) => character.charCodeAt(0));
    const stored: StoredAssetBytes = { mime: 'image/png', bytes };
    localStorage.setItem(bytesKey, JSON.stringify(stored));
  }
}

function catalogKey(catalogId: string): string {
  return `${CATALOG_PREFIX}${catalogId}`;
}

function readCatalog(catalogId: string): CatalogPersistenceEnvelope | undefined {
  const raw = localStorage.getItem(catalogKey(catalogId));
  return raw ? JSON.parse(raw) as CatalogPersistenceEnvelope : undefined;
}

function writeCatalog(envelope: CatalogPersistenceEnvelope): void {
  localStorage.setItem(catalogKey(envelope.catalogId), JSON.stringify(envelope));
}

function allCatalogs(): CatalogPersistenceEnvelope[] {
  const records: CatalogPersistenceEnvelope[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(CATALOG_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (raw) records.push(JSON.parse(raw) as CatalogPersistenceEnvelope);
  }
  return records;
}

function envelope(
  documentSnapshot: CatalogDocument,
  remoteRevision: number,
  lastMutationId: string,
  origin?: CatalogPersistenceEnvelope['origin'],
  archivedAt: string | null = null
): CatalogPersistenceEnvelope {
  const now = new Date().toISOString();
  return {
    catalogId: documentSnapshot.id,
    remoteRevision,
    lastMutationId,
    title: documentSnapshot.title,
    locale: documentSnapshot.locale,
    createdAt: now,
    updatedAt: now,
    createdBy: 'father-proof',
    updatedBy: 'father-proof',
    archivedAt,
    ...(origin ? { origin } : {}),
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

interface HeldSave {
  readonly request: SaveCatalogCasRequest;
  readonly resolve: (result: PersistenceResult<CatalogPersistenceEnvelope>) => void;
}

interface HeldCreate {
  readonly request: CreateCatalogRequest;
  readonly resolve: (result: PersistenceResult<CatalogPersistenceEnvelope>) => void;
}

class ControlledCatalogRepository implements CatalogRepository {
  saveDispatchCount = 0;
  createDispatchCount = 0;
  archiveDispatchCount = 0;
  readonly saveMutationIds: string[] = [];
  readonly createMutationIds: string[] = [];
  private holdSave = false;
  private heldSave?: HeldSave;
  private holdCreate = false;
  private heldCreate?: HeldCreate;
  private ambiguousCreate = false;

  listCatalogs = async (query: CatalogListQuery = {}): Promise<PersistenceResult<readonly CatalogListItem[]>> => {
    const value = allCatalogs()
      .filter((record) => query.includeArchived || record.archivedAt === null)
      .map(({ documentSnapshot: _document, lastMutationId: _mutation, ...item }) => item);
    return { ok: true, value };
  };

  getCatalog = async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const value = readCatalog(catalogId);
    return value ? { ok: true, value } : { ok: false, error: { code: 'NOT_FOUND' } };
  };

  createCatalog = async (request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    this.createDispatchCount += 1;
    this.createMutationIds.push(request.mutationId);
    if (this.holdCreate) {
      this.holdCreate = false;
      return new Promise((resolve) => {
        this.heldCreate = { request, resolve };
      });
    }
    if (this.ambiguousCreate) {
      this.ambiguousCreate = false;
      const committed = this.commitCreate(request);
      return committed.ok
        ? { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } }
        : committed;
    }
    return this.commitCreate(request);
  };

  saveCAS = async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    this.saveDispatchCount += 1;
    this.saveMutationIds.push(request.mutationId);
    if (this.holdSave) {
      this.holdSave = false;
      return new Promise((resolve) => {
        this.heldSave = { request, resolve };
      });
    }
    return this.commitSave(request);
  };

  archiveCAS = async (request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> => {
    this.archiveDispatchCount += 1;
    const current = readCatalog(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const next: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeCatalog(next);
    const { documentSnapshot: _document, ...metadata } = next;
    return { ok: true, value: metadata };
  };

  armAmbiguousCreate(): void {
    this.ambiguousCreate = true;
  }

  holdNextSave(): void {
    if (this.heldSave) throw new Error('A Save response is already held');
    this.holdSave = true;
  }

  releaseHeldSave(): void {
    const held = this.heldSave;
    if (!held) throw new Error('No held Save response');
    this.heldSave = undefined;
    held.resolve(this.commitSave(held.request));
  }

  holdNextCreate(): void {
    if (this.heldCreate) throw new Error('A Create response is already held');
    this.holdCreate = true;
  }

  releaseHeldCreate(): void {
    const held = this.heldCreate;
    if (!held) throw new Error('No held Create response');
    this.heldCreate = undefined;
    held.resolve(this.commitCreate(held.request));
  }

  heldSaveText(): string | null {
    return this.heldSave ? firstText(this.heldSave.request.documentSnapshot) : null;
  }

  private commitCreate(request: CreateCatalogRequest): PersistenceResult<CatalogPersistenceEnvelope> {
    if (readCatalog(request.documentSnapshot.id)) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const created = envelope(request.documentSnapshot, 1, request.mutationId, request.origin);
    writeCatalog(created);
    return { ok: true, value: created };
  }

  private commitSave(request: SaveCatalogCasRequest): PersistenceResult<CatalogPersistenceEnvelope> {
    const current = readCatalog(request.catalogId);
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
    writeCatalog(saved);
    return { ok: true, value: saved };
  }
}

interface StoredAssetBytes {
  readonly mime: string;
  readonly bytes: number[];
}

class DurableBrowserAssetRepository implements AssetRepository {
  async finalizeAsset(input: {
    readonly assetId: string;
    readonly version: string;
    readonly sha256: string;
    readonly mime: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly name: string;
    readonly alt: string;
    readonly fileSize: number;
    readonly storagePath: string;
  }): Promise<AssetFinalizationResult> {
    const existing = localStorage.getItem(`${ASSET_RECORD_PREFIX}${input.assetId}`);
    if (existing) return { ok: false, error: { code: 'CONFLICT', message: 'Asset already exists' } };
    const record: AssetRecord = {
      id: input.assetId,
      version: '1',
      sha256: input.sha256,
      mime: input.mime as AssetRecord['mime'],
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      name: input.name,
      alt: input.alt,
      storageBucket: 'product-assets',
      storagePath: input.storagePath,
      fileSize: input.fileSize,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(`${ASSET_RECORD_PREFIX}${record.id}`, JSON.stringify(record));
    return {
      ok: true,
      asset: {
        id: record.id,
        version: record.version,
        sha256: record.sha256,
        mime: record.mime,
        widthPx: record.widthPx,
        heightPx: record.heightPx,
        name: record.name,
        alt: record.alt,
      },
    };
  }

  async getAsset(id: string): Promise<
    { ok: true; record: AssetRecord | null }
    | { ok: false; error: { code: string; message: string } }
  > {
    const raw = localStorage.getItem(`${ASSET_RECORD_PREFIX}${id}`);
    return { ok: true, record: raw ? JSON.parse(raw) as AssetRecord : null };
  }

  async uploadBytes(storagePath: string, input: ArrayBuffer | Uint8Array, mime: string) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const stored: StoredAssetBytes = { mime, bytes: [...bytes] };
    localStorage.setItem(`${ASSET_BYTES_PREFIX}${storagePath}`, JSON.stringify(stored));
    return { ok: true, storagePath };
  }

  async createSignedUrl(storagePath: string, _expiresInSeconds: number) {
    const raw = localStorage.getItem(`${ASSET_BYTES_PREFIX}${storagePath}`);
    if (!raw) return { ok: false, error: 'Asset bytes not found' };
    const stored = JSON.parse(raw) as StoredAssetBytes;
    const bytes = Uint8Array.from(stored.bytes);
    const blob = new Blob([bytes.slice().buffer], { type: stored.mime });
    return { ok: true, signedUrl: URL.createObjectURL(blob) };
  }
}

function firstText(document: CatalogDocument): string | null {
  for (const page of document.pages) {
    for (const object of page.objects) {
      if (object.type === 'text') return projectEditableRichText(object.text);
    }
  }
  return null;
}

function firstTextObjectId(document: CatalogDocument): string | null {
  for (const page of document.pages) {
    const object = page.objects.find((candidate) => candidate.type === 'text');
    if (object) return object.id;
  }
  return null;
}

function firstImageObjectId(document: CatalogDocument): string | null {
  for (const page of document.pages) {
    const object = page.objects.find((candidate) => candidate.type === 'image');
    if (object) return object.id;
  }
  return null;
}

const repository = new ControlledCatalogRepository();
const recoveryRepository = new IndexedDbRecoveryRepository({ databaseName: recoveryDatabaseName });
const assetRepository = new DurableBrowserAssetRepository();
let activeRuntime: VNextPersistenceRuntime | undefined;
let activeAssetBridge: DefaultAssetPersistenceBridge | undefined;
let mode: 'library' | 'editor' = 'library';
let disposedRuntimeCount = 0;

const libraryService = new CatalogLibraryService({
  repository,
  applicationDependencies,
  createId: createUuid,
  createMutationId: createUuid,
  createOpenSessionId: createUuid,
  authLineage: () => AUTH_LINEAGE,
  authorityScopeId: () => AUTHORITY_SCOPE_ID,
  starterRegistry,
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing W3.I proof root');
const renderer = ReactDOM.createRoot(root);

async function disposeActiveRuntime(): Promise<void> {
  const runtime = activeRuntime;
  const bridge = activeAssetBridge;
  activeRuntime = undefined;
  activeAssetBridge = undefined;
  if (runtime) {
    await runtime.dispose();
    disposedRuntimeCount += 1;
  }
  bridge?.revokeObjectURLs();
}

function renderLibrary(): void {
  mode = 'library';
  window.history.replaceState(null, '', `?db=${encodeURIComponent(recoveryDatabaseName)}`);
  renderer.render(
    <React.StrictMode>
      <CatalogLibrary service={libraryService} onOpen={(catalogId) => { void openCatalog(catalogId); }} />
    </React.StrictMode>
  );
}

async function openCatalog(catalogId: string): Promise<void> {
  await disposeActiveRuntime();
  const bridge = new DefaultAssetPersistenceBridge(assetRepository, {
    getActiveLineage: () => {
      const snapshot = activeRuntime?.workspace.getSnapshot();
      return {
        authLineage: AUTH_LINEAGE,
        authorityScopeId: AUTHORITY_SCOPE_ID,
        openSessionId: snapshot?.binding.openSessionId,
        catalogId: snapshot?.binding.kind === 'PERSISTED' ? snapshot.binding.catalogId : undefined,
      };
    },
  });
  const initial = createCatalogDocument(createUuid, 'Inicialização W3.I');
  const runtime = new VNextPersistenceRuntime({
    session: createDocumentSession(initial, applicationDependencies),
    repository,
    applicationDependencies,
    createMutationId: createUuid,
    createOpenSessionId: createUuid,
    authLineage: AUTH_LINEAGE,
    authorityScopeId: AUTHORITY_SCOPE_ID,
    recoveryRepository,
    autosave: { debounceMs: 250 },
    resolveAssetUrls: async (document) => bridge.resolveDocumentAssets(document, {
      authLineage: AUTH_LINEAGE,
      authorityScopeId: AUTHORITY_SCOPE_ID,
    }),
  });
  activeRuntime = runtime;
  activeAssetBridge = bridge;
  const opened = await runtime.reopenCoordinator.open(catalogId, { allowDiscardUnsaved: true });
  if (!opened.ok) throw new Error(`W3.I controlled reopen failed: ${opened.error.code}`);
  mode = 'editor';
  window.history.replaceState(
    null,
    '',
    `?db=${encodeURIComponent(recoveryDatabaseName)}&catalog=${encodeURIComponent(catalogId)}`
  );
  renderer.render(
    <React.StrictMode>
      <VNextApp
        runtime={runtime}
        assetBridge={bridge}
        onRequestLibrary={() => {
          void disposeActiveRuntime().then(renderLibrary);
        }}
      />
    </React.StrictMode>
  );
}

function runtimeState() {
  const runtime = activeRuntime;
  if (!runtime) return null;
  const workspace = runtime.workspace.getSnapshot();
  const session = workspace.session.getSnapshot();
  const document = session.document;
  const binding = workspace.binding;
  const authoritative = binding.kind === 'PERSISTED' ? readCatalog(binding.catalogId) : undefined;
  return {
    catalogId: document.id,
    title: document.title,
    text: firstText(document),
    textObjectId: firstTextObjectId(document),
    imageObjectId: firstImageObjectId(document),
    openSessionId: binding.openSessionId,
    bindingKind: binding.kind,
    remoteRevision: binding.kind === 'PERSISTED' ? binding.remoteRevision : null,
    dirty: workspace.dirty,
    savePhase: workspace.save.phase,
    saveLabel: workspace.save.label,
    localSequence: session.localSequence,
    canUndo: session.canUndo,
    canRedo: session.canRedo,
    conflictResolutionState: runtime.conflictResolutionCoordinator.getState(),
    structuralIds: [...authoredStructuralIdentityIds(document)].sort(),
    document,
    documentEquivalence: canonicalDocumentEquivalence(document),
    assetRuntimeStates: [...workspace.assetRuntimeStates.entries()].map(([id, state]) => ({
      id,
      status: state.status,
      runtimeUrl: state.status === 'resolved' ? state.url : null,
    })),
    authoritative: authoritative ? {
      catalogId: authoritative.catalogId,
      title: authoritative.title,
      remoteRevision: authoritative.remoteRevision,
      lastMutationId: authoritative.lastMutationId,
      text: firstText(authoritative.documentSnapshot),
      archivedAt: authoritative.archivedAt,
      equivalence: canonicalDocumentEquivalence(authoritative.documentSnapshot),
    } : null,
  };
}

function catalogAudit(catalogId: string) {
  const value = readCatalog(catalogId);
  return value ? {
    catalogId: value.catalogId,
    title: value.title,
    remoteRevision: value.remoteRevision,
    lastMutationId: value.lastMutationId,
    archivedAt: value.archivedAt,
    origin: value.origin ?? null,
    text: firstText(value.documentSnapshot),
    structuralIds: [...authoredStructuralIdentityIds(value.documentSnapshot)].sort(),
    assetRefs: value.documentSnapshot.assets,
    document: value.documentSnapshot,
    equivalence: canonicalDocumentEquivalence(value.documentSnapshot),
  } : null;
}

const proofApi = {
  ready: true,
  recoveryDatabaseName,
  authorityScopeId: AUTHORITY_SCOPE_ID,
  state() {
    return {
      mode,
      runtime: runtimeState(),
      saveDispatchCount: repository.saveDispatchCount,
      createDispatchCount: repository.createDispatchCount,
      archiveDispatchCount: repository.archiveDispatchCount,
      saveMutationIds: [...repository.saveMutationIds],
      createMutationIds: [...repository.createMutationIds],
      heldSaveText: repository.heldSaveText(),
      catalogIds: allCatalogs().map((record) => record.catalogId).sort(),
      disposedRuntimeCount,
    };
  },
  catalog: catalogAudit,
  holdNextSave() {
    repository.holdNextSave();
  },
  releaseHeldSave() {
    repository.releaseHeldSave();
  },
  holdNextCreate() {
    repository.holdNextCreate();
  },
  releaseHeldCreate() {
    repository.releaseHeldCreate();
  },
  armAmbiguousCreate() {
    repository.armAmbiguousCreate();
  },
  flushRecovery() {
    return activeRuntime?.recoveryManager?.flush();
  },
  async recoveryRecords(scope = AUTHORITY_SCOPE_ID) {
    const records = await recoveryRepository.listByScope(scope);
    return records.map((inspection) => inspection.status === 'VALID' ? {
      status: inspection.status,
      authorityScopeId: inspection.record.authorityScopeId,
      catalogId: inspection.record.catalogId,
      openSessionId: inspection.record.openSessionId,
      recoveryGeneration: inspection.record.recoveryGeneration,
      canonicalText: firstText(inspection.record.documentSnapshot),
      draft: inspection.record.authoringRecoveryOverlay?.kind === 'TEXT_DRAFT_V1'
        ? inspection.record.authoringRecoveryOverlay.draft
        : null,
    } : {
      status: inspection.status,
      authorityScopeId: inspection.key.authorityScopeId,
      catalogId: inspection.key.catalogId,
      openSessionId: inspection.key.openSessionId,
    });
  },
  async dispose() {
    await disposeActiveRuntime();
    return { disposedRuntimeCount };
  },
};

declare global {
  interface Window {
    __W3I_PROOF__: typeof proofApi;
  }
}

window.__W3I_PROOF__ = proofApi;

window.addEventListener('pagehide', () => {
  void disposeActiveRuntime();
}, { once: true });

seedInitialAsset();
const requestedCatalogId = params.get('catalog');
if (requestedCatalogId) {
  void openCatalog(requestedCatalogId);
} else {
  renderLibrary();
}
