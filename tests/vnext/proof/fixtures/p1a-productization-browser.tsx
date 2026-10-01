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
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import type { AssetPersistenceBridge, AssetRuntimeState } from '@/vnext/asset';
import {
  DocumentRenderer,
  compilePlans,
  loadFonts,
  captureSnapshot,
} from '@/vnext/rendering';
import { layoutReport } from '@/vnext/publication';
import {
  createW4F3Document,
  W4F3_CATALOG_ID,
  W4F3_EXISTING_ASSET,
  W4F3_OBJECT_ID,
  W4F3_OTHER_CATALOG_ID,
} from './w4f3-table-document';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

const INITIAL_MUTATION_ID = '77777777-7777-4777-8777-777777777777';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const ASSET_URL = '/src/labs/presys-editorial-proof/assets/ta-25n.jpg';
export const P1A_IMAGE_ID = 'w4g-standalone-image';
export const P1A_TEXT_ID = 'w4g-object-text';
export const P1A_LINE_ID = 'w4g-object-line';

function envelope(document: CatalogDocument, revision: number, mutationId: string): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-27T12:00:00.000Z',
    updatedAt: '2026-09-27T12:00:000Z',
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

const primary = createW4F3Document();
primary.title = 'P1.A Productization';
const mainTable = primary.pages[0].objects.find((object) => object.id === W4F3_OBJECT_ID);
if (mainTable?.type !== 'table') throw new Error('Missing canonical W4.F.3 Table fixture');
mainTable.frame.heightMm = 44;
mainTable.table.cells[12].content = { type: 'technicalCode', value: 'MERGE-W4G' };
mainTable.table.cells[13].content = { type: 'empty' };
primary.pages[0].objects.push(
  {
    id: P1A_IMAGE_ID,
    type: 'image',
    frame: { xMm: 24, yMm: 185, widthMm: 48, heightMm: 38 },
    zIndex: 2,
    assetId: W4F3_EXISTING_ASSET.id,
    fit: 'contain',
  },
  {
    id: P1A_TEXT_ID,
    type: 'text',
    frame: { xMm: 88, yMm: 194, widthMm: 78, heightMm: 15 },
    zIndex: 3,
    text: plainRichText('w4g-object-text-rich', 'Objeto integrado W4.G'),
    style: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, color: '#172033' },
  },
  {
    id: P1A_LINE_ID,
    type: 'line',
    frame: { xMm: 94, yMm: 226, widthMm: 72, heightMm: 1 },
    zIndex: 4,
    axis: 'horizontal',
    color: '#003366',
  }
);

const other = createW4F3Document(W4F3_OTHER_CATALOG_ID, 'Outro catÃ¡logo W4.G');
const repository = new ProofRepository([
  envelope(primary, 1, INITIAL_MUTATION_ID),
  envelope(other, 1, INITIAL_MUTATION_ID),
]);
const dependencies: ApplicationExecutionDependencies = { createId: () => crypto.randomUUID() };
const session = createDocumentSession(primary, dependencies);

function resolvedState(asset = W4F3_EXISTING_ASSET): AssetRuntimeState {
  return {
    status: 'resolved',
    asset,
    url: ASSET_URL,
    expiresAt: Date.now() + 60_000,
  };
}

const assetBridge = {
  finalizeUpload: async () => ({ ok: false, error: { code: 'NOT_USED', message: 'Upload not used in W4.G closeout proof' } }),
  upload: async () => ({ ok: false, error: { code: 'NOT_USED', message: 'Upload not used in W4.G closeout proof' } }),
  resolve: async (asset: typeof W4F3_EXISTING_ASSET) => (
    asset.id === W4F3_EXISTING_ASSET.id
      ? { ok: true, state: resolvedState(asset) }
      : { ok: false, state: { status: 'unavailable', asset, error: 'Unknown controlled proof asset' } }
  ),
  verify: async () => ({ ok: true, sha256: W4F3_EXISTING_ASSET.sha256 }),
  resolveDocumentAssets: async (doc: CatalogDocument) => {
    const urls = new Map<string, string>();
    const states = new Map<string, AssetRuntimeState>();
    for (const asset of doc.assets) {
      if (asset.id === W4F3_EXISTING_ASSET.id) {
        urls.set(asset.id, ASSET_URL);
        states.set(asset.id, resolvedState(asset));
      }
    }
    return { urls, states };
  },
  resolveDocument: async (doc: CatalogDocument) => (await assetBridge.resolveDocumentAssets(doc)).states,
  revokeObjectURLs: () => undefined,
  invalidateAuth: () => undefined,
} as unknown as AssetPersistenceBridge;

let runtime: VNextPersistenceRuntime;
runtime = new VNextPersistenceRuntime({
  session,
  repository,
  applicationDependencies: dependencies,
  createMutationId: () => crypto.randomUUID(),
  createOpenSessionId: () => crypto.randomUUID(),
  authLineage: 'proof-user:w4g',
  authorityScopeId: 'proof:w4g',
  binding: envelope(primary, 1, INITIAL_MUTATION_ID),
  autosave: false,
  resolveAssetUrls: (doc) => assetBridge.resolveDocumentAssets(doc),
});

const initialResolved = await assetBridge.resolveDocumentAssets(primary);
for (const [assetId, url] of initialResolved.urls) runtime.workspace.setAssetUrl(assetId, url);
for (const [assetId, state] of initialResolved.states) runtime.workspace.setAssetRuntimeState(assetId, state);

let publish: () => void;

const api = {
  primaryId: W4F3_CATALOG_ID,
  otherId: W4F3_OTHER_CATALOG_ID,
  tableObjectId: W4F3_OBJECT_ID,
  imageId: P1A_IMAGE_ID,
  textId: P1A_TEXT_ID,
  lineId: P1A_LINE_ID,
  state: () => {
    const workspace = runtime.workspace.getSnapshot();
    const current = workspace.session.getSnapshot();
    return {
      catalogId: workspace.binding.kind === 'PERSISTED' ? workspace.binding.catalogId : current.document.id,
      document: current.document,
      localSequence: current.localSequence,
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      dirty: workspace.dirty,
      savePhase: workspace.save.phase,
      urls: [...workspace.assetUrls],
      saved: repository.records.get(W4F3_CATALOG_ID)?.documentSnapshot,
    };
  },
  reopen: async (catalogId: string) => runtime.reopenCoordinator.open(catalogId),
  publish: () => publish(),
  publication: async () => {
    const doc = runtime.workspace.getSnapshot().session.getSnapshot().document;
    const root = document.querySelector<HTMLElement>('[data-publication] [data-editorial-root]');
    if (!root) throw new Error('Missing publication root');
    await loadFonts(doc, root);
    await Promise.all(
      [...root.querySelectorAll<HTMLImageElement>('img')]
        .map((image) => image.complete && image.naturalWidth > 0 ? Promise.resolve() : image.decode())
    );
    const plans = compilePlans(doc).plans;
    const snapshot = await captureSnapshot(doc, plans, root);
    return { diagnostics: layoutReport(doc, plans, snapshot, root), snapshot };
  },
};

declare global {
  interface Window {
    __P1A_PROOF__: typeof api;
  }
}
window.__P1A_PROOF__ = api;

function App() {
  const [publication, setPublication] = React.useState(false);
  publish = () => setPublication(true);
  const workspace = runtime.workspace.getSnapshot();
  const doc = workspace.session.getSnapshot().document;
  if (publication) {
    return (
      <div data-publication="">
        <DocumentRenderer document={doc} plans={compilePlans(doc).plans} assetUrls={workspace.assetUrls} />
      </div>
    );
  }
  return (
    <>
      <div data-proof-controls="">
        <button onClick={() => { void runtime.reopenCoordinator.open(other.id); }}>Abrir outro catÃ¡logo</button>
        <button onClick={() => { void runtime.reopenCoordinator.open(primary.id); }}>Reabrir catÃ¡logo original</button>
        <button onClick={() => setPublication(true)}>Publicar prova</button>
      </div>
      <VNextApp runtime={runtime} assetBridge={assetBridge} simpleByDefault onRequestLibrary={() => undefined} translation={{} as never} onOpenTranslatedCopy={() => undefined} getPublicationSource={() => undefined} />
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing W4.G proof root');
ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
