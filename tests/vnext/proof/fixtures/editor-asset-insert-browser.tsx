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
import { createCatalogDocument } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import { DefaultAssetPersistenceBridge, type AssetRepository, type AssetRecord, type AssetFinalizationResult } from '@/vnext/asset';
import { DocumentRenderer, compilePlans, resolveAssets, decodeImages, loadFonts, captureSnapshot } from '@/vnext/rendering';
import { layoutReport } from '@/vnext/publication';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

const INITIAL_MUTATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '99999999-9999-4999-8999-999999999999';

function envelope(document: CatalogDocument, revision: number, mutationId: string): CatalogPersistenceEnvelope {
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


class ProofAssets implements AssetRepository {
  records = new Map<string, AssetRecord>();
  bytes = new Map<string, { bytes: Uint8Array; mime: string }>();
  uploadCount = 0;
  hold = false;
  release: (() => void) | undefined;
  async uploadBytes(path: string, bytes: ArrayBuffer | Uint8Array, mime: string) {
    this.uploadCount++;
    if (this.hold) { this.hold = false; await new Promise<void>((resolve) => { this.release = resolve; }); }
    this.bytes.set(path, { bytes: new Uint8Array(bytes), mime });
    return { ok: true, storagePath: path };
  }
  async finalizeAsset(p: Parameters<AssetRepository['finalizeAsset']>[0]): Promise<AssetFinalizationResult> {
    const asset = { id: p.assetId, version: '1' as const, sha256: p.sha256, mime: p.mime as AssetRecord['mime'], widthPx: p.widthPx, heightPx: p.heightPx, name: p.name, alt: p.alt };
    this.records.set(asset.id, { ...asset, storageBucket: 'product-assets', storagePath: p.storagePath, fileSize: p.fileSize, createdAt: '2026-09-21T00:00:00Z' });
    return { ok: true, asset };
  }
  async getAsset(id: string) { return { ok: true as const, record: this.records.get(id) ?? null }; }
  async createSignedUrl(path: string) {
    const stored = this.bytes.get(path);
    return stored ? { ok: true, signedUrl: URL.createObjectURL(new Blob([new Uint8Array(stored.bytes).buffer], { type: stored.mime })) } : { ok: false };
  }
}
const primary = createCatalogDocument(() => crypto.randomUUID(), 'Blank Image proof');
const other = createCatalogDocument(() => crypto.randomUUID(), 'Outro catálogo');
const repository = new ProofRepository([envelope(primary, 1, INITIAL_MUTATION_ID), envelope(other, 1, INITIAL_MUTATION_ID)]);
const assets = new ProofAssets();
const dependencies: ApplicationExecutionDependencies = { createId: () => crypto.randomUUID() };
const session = createDocumentSession(primary, dependencies);
let runtime: VNextPersistenceRuntime;
const bridge = new DefaultAssetPersistenceBridge(assets, { getActiveLineage: () => {
  const snap = runtime.workspace.getSnapshot();
  return { authLineage: snap.binding.authLineage, openSessionId: snap.binding.openSessionId, authorityScopeId: snap.activeAuthorityScopeId, catalogId: snap.binding.kind === 'PERSISTED' ? snap.binding.catalogId : undefined };
} });
runtime = new VNextPersistenceRuntime({ session, repository, applicationDependencies: dependencies, createMutationId: () => crypto.randomUUID(), createOpenSessionId: () => crypto.randomUUID(), authLineage: 'proof-user', authorityScopeId: 'proof:asset', binding: envelope(primary, 1, INITIAL_MUTATION_ID), autosave: false, resolveAssetUrls: (doc) => bridge.resolveDocumentAssets(doc) });
let publish: () => void;
const api = {
  primaryId: primary.id, otherId: other.id,
  state: () => {
    const snap = runtime.workspace.getSnapshot();
    return { document: snap.session.getSnapshot().document, urls: [...snap.assetUrls], states: [...snap.assetRuntimeStates], dirty: snap.dirty, uploadCount: assets.uploadCount, saved: repository.records.get(primary.id)?.documentSnapshot };
  },
  hold: () => { assets.hold = true; },
  release: () => { assets.release?.(); },
  reopen: (id: string) => runtime.reopenCoordinator.open(id),
  publish: () => publish(),
  publication: async () => {
    const doc = runtime.workspace.getSnapshot().session.getSnapshot().document;
    const root = document.querySelector<HTMLElement>('[data-publication] [data-editorial-root]')!;
    const resolved = await bridge.resolveDocumentAssets(doc);
    await resolveAssets(doc, (asset) => resolved.urls.get(asset.id));
    await loadFonts(doc, root);
    await decodeImages(root, doc, resolved.urls);
    const plans = compilePlans(doc).plans;
    const snapshot = await captureSnapshot(doc, plans, root);
    return { diagnostics: layoutReport(doc, plans, snapshot, root), snapshot };
  },
};
declare global { interface Window { __ASSET_INSERT_PROOF__: typeof api } }
window.__ASSET_INSERT_PROOF__ = api;
function App() {
  const [publication, setPublication] = React.useState(false);
  publish = () => setPublication(true);
  const snap = runtime.workspace.getSnapshot();
  const doc = snap.session.getSnapshot().document;
  if (publication) return <div data-publication=""><DocumentRenderer document={doc} plans={compilePlans(doc).plans} assetUrls={snap.assetUrls} /></div>;
  return <><div data-proof-controls=""><button onClick={() => { void runtime.reopenCoordinator.open(other.id); }}>Abrir outro catálogo</button><button onClick={() => { void runtime.reopenCoordinator.open(primary.id); }}>Reabrir catálogo original</button><button onClick={() => setPublication(true)}>Publicar prova</button></div><VNextApp runtime={runtime} assetBridge={bridge} /></>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
