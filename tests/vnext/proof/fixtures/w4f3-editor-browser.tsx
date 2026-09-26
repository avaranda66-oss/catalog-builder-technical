import React from 'react';
import ReactDOM from 'react-dom/client';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { AssetPersistenceBridge, AssetUploadResult } from '@/vnext/asset';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  createW4F3Document,
  W4F3_CATALOG_ID,
  W4F3_EXISTING_ASSET,
  W4F3_OBJECT_ID,
  W4F3_OTHER_CATALOG_ID,
} from './w4f3-table-document';

const INITIAL_MUTATION_ID = 'f3333333-aaaa-4aaa-8aaa-333333333333';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const ASSET_URL = '/src/labs/presys-editorial-proof/assets/ta-25n.jpg';
function envelope(
  document: ReturnType<typeof createW4F3Document>,
  revision: number,
  mutationId: string
): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-26T03:00:00.000Z',
    updatedAt: '2026-09-26T03:00:00.000Z',
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
    this.records.set(request.catalogId, next);
    return { ok: true, value: next };
  };
}
const primary = createW4F3Document();
const other = createW4F3Document(W4F3_OTHER_CATALOG_ID, 'Outro catálogo W4.F.3');
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
  authorityScopeId: 'proof:w4f3',
  binding: envelope(primary, 1, INITIAL_MUTATION_ID),
});
runtime.workspace.setAssetUrl(W4F3_EXISTING_ASSET.id, ASSET_URL);
runtime.workspace.setAssetRuntimeState(W4F3_EXISTING_ASSET.id, {
  status: 'resolved',
  asset: W4F3_EXISTING_ASSET,
  url: ASSET_URL,
  expiresAt: Date.now() + 60_000,
});
let uploadCount = 0;
const assetBridge = {
  upload: async (): Promise<AssetUploadResult> => {
    uploadCount += 1;
    return {
      ok: true,
      asset: W4F3_EXISTING_ASSET,
      runtimeState: {
        status: 'resolved',
        asset: W4F3_EXISTING_ASSET,
        url: ASSET_URL,
        expiresAt: Date.now() + 60_000,
      },
    };
  },
} as Pick<AssetPersistenceBridge, 'upload'> as AssetPersistenceBridge;

function tableState(document: ReturnType<typeof createW4F3Document>) {
  for (const page of document.pages) {
    const object = page.objects.find((entry) => entry.id === W4F3_OBJECT_ID);
    if (object?.type === 'table') return { frame: object.frame, table: object.table };
  }
  return null;
}
declare global {
  interface Window {
    __W4F3_PROOF__: {
      state(): {
        catalogId: string;
        localSequence: number;
        dirty: boolean;
        canUndo: boolean;
        canRedo: boolean;
        uploadCount: number;
        document: ReturnType<typeof createW4F3Document>;
        main: ReturnType<typeof tableState>;
      };
      reopen(catalogId: string): Promise<unknown>;
      readonly primaryId: string;
      readonly otherId: string;
      readonly objectId: string;
    };
  }
}

window.__W4F3_PROOF__ = {
  primaryId: W4F3_CATALOG_ID,
  otherId: W4F3_OTHER_CATALOG_ID,
  objectId: W4F3_OBJECT_ID,
  state: () => {
    const workspace = runtime.workspace.getSnapshot();
    const current = workspace.session.getSnapshot();
    return {
      catalogId: current.document.id,
      localSequence: current.localSequence,
      dirty: workspace.dirty,
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      uploadCount,
      document: current.document,
      main: tableState(current.document),
    };
  },
  reopen: async (catalogId) => {
    const result = await runtime.reopenCoordinator.open(catalogId);
    const active = runtime.workspace.getSnapshot().session.getSnapshot().document;
    if (active.assets.some((asset) => asset.id === W4F3_EXISTING_ASSET.id)) {
      runtime.workspace.setAssetUrl(W4F3_EXISTING_ASSET.id, ASSET_URL);
      runtime.workspace.setAssetRuntimeState(W4F3_EXISTING_ASSET.id, {
        status: 'resolved', asset: W4F3_EXISTING_ASSET, url: ASSET_URL, expiresAt: Date.now() + 60_000,
      });
    }
    return result;
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing W4.F.3 proof root');
ReactDOM.createRoot(root).render(
  <React.StrictMode><VNextApp runtime={runtime} assetBridge={assetBridge} /></React.StrictMode>
);
