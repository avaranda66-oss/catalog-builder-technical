import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createDocumentSession,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { CatalogDocument, AssetRef } from '@/vnext/domain';
import { resolveAssets } from '@/vnext/rendering/resources';
import {
  VNextPersistenceRuntime,
  type CatalogRepository,
  type PersistenceResult,
} from '@/vnext/persistence';
import {
  DefaultAssetPersistenceBridge,
  type AssetRepository,
  type AssetRecord,
  type AssetFinalizationResult,
} from '@/vnext/asset';

// 1x1 Red PNG fixture
const INITIAL_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function computeSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

class ControlledBrowserAssetRepository implements AssetRepository {
  readonly assets = new Map<string, AssetRecord>();
  readonly storage = new Map<string, { bytes: Uint8Array; mime: string }>();

  async finalizeAsset(params: any): Promise<AssetFinalizationResult> {
    const key = `${params.assetId}:${params.version}`;
    const record: AssetRecord = {
      id: params.assetId,
      version: params.version,
      sha256: params.sha256,
      mime: params.mime,
      widthPx: params.widthPx,
      heightPx: params.heightPx,
      name: params.name,
      alt: params.alt,
      fileSize: params.fileSize,
      storageBucket: 'product-assets',
      storagePath: params.storagePath,
      createdAt: new Date().toISOString(),
    };
    this.assets.set(key, record);
    return {
      ok: true,
      asset: {
        id: record.id,
        version: record.version,
        sha256: record.sha256,
        mime: record.mime as any,
        widthPx: record.widthPx,
        heightPx: record.heightPx,
        name: record.name,
        alt: record.alt,
      },
    };
  }

  async getAsset(id: string, version = '1') {
    const key = `${id}:${version}`;
    const record = this.assets.get(key);
    return { ok: true as const, record: record ?? null };
  }

  async uploadBytes(storagePath: string, bytes: ArrayBuffer | Uint8Array, mime: string) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.storage.set(storagePath, { bytes: u8, mime });
    return { ok: true, storagePath };
  }

  async createSignedUrl(storagePath: string, _expiresInSeconds: number) {
    const entry = this.storage.get(storagePath);
    if (!entry) return { ok: false, error: 'Object not found' };
    const blob = new Blob([entry.bytes as any], { type: entry.mime });
    return { ok: true, signedUrl: URL.createObjectURL(blob) };
  }
}

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({
    ok: false,
    error: { code: 'OFFLINE', message: 'Remote persistence is unavailable in browser proof' },
  });
}

function mockCatalogRepository(): CatalogRepository {
  return {
    listCatalogs: () => unavailable(),
    getCatalog: () => unavailable(),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
  };
}

async function initProof() {
  const initialSha = await computeSha256(INITIAL_PNG_BYTES);
  const initialAssetId = '11111111-1111-4111-8111-111111111111';
  const initialAsset: AssetRef = {
    id: initialAssetId,
    version: '1',
    sha256: initialSha,
    mime: 'image/png',
    widthPx: 1,
    heightPx: 1,
    name: 'initial.png',
    alt: 'Initial image',
  };

  const initialDocument: CatalogDocument = {
    schemaVersion: 1,
    id: 'catalog-w3g-proof',
    title: 'Catálogo Prova W3.G',
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, color: '#172033' },
      palette: ['#172033'],
    },
    pages: [
      {
        id: 'page-1',
        widthMm: 210,
        heightMm: 297,
        objects: [
          {
            type: 'image',
            id: 'image-target',
            assetId: initialAssetId,
            frame: { xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 },
            zIndex: 1,
            fit: 'contain',
          },
        ],
      },
    ],
    assets: [initialAsset],
  };

  const repository = new ControlledBrowserAssetRepository();
  const initialStoragePath = `vnext/${initialAssetId}/1.png`;
  await repository.uploadBytes(initialStoragePath, INITIAL_PNG_BYTES, 'image/png');
  await repository.finalizeAsset({
    assetId: initialAssetId,
    version: '1',
    sha256: initialSha,
    mime: 'image/png',
    widthPx: 1,
    heightPx: 1,
    name: 'initial.png',
    alt: 'Initial image',
    fileSize: INITIAL_PNG_BYTES.byteLength,
    storagePath: initialStoragePath,
  });

  const appDeps: ApplicationExecutionDependencies = {
    createId: () => crypto.randomUUID(),
  };
  const session = createDocumentSession(initialDocument, appDeps);

  let runtime: VNextPersistenceRuntime;
  const bridge = new DefaultAssetPersistenceBridge(repository, {
    getActiveLineage: () => {
      const snap = runtime?.workspace.getSnapshot();
      return {
        openSessionId: snap?.binding.openSessionId,
        authLineage: snap?.binding.authLineage ?? 'auth:user-1',
        authorityScopeId: snap?.activeAuthorityScopeId,
      };
    },
  });

  const initialResolution = await bridge.resolve(initialAsset);
  const initialAssetUrls = new Map<string, string>();
  const initialAssetStates = new Map<string, any>();
  if (initialResolution.ok) {
    initialAssetUrls.set(initialAssetId, initialResolution.state.url);
    initialAssetStates.set(initialAssetId, initialResolution.state);
  }

  runtime = new VNextPersistenceRuntime({
    session,
    repository: mockCatalogRepository(),
    applicationDependencies: appDeps,
    createMutationId: () => crypto.randomUUID(),
    createOpenSessionId: () => crypto.randomUUID(),
    authLineage: 'auth:user-1',
    authorityScopeId: 'scope-proof',
    assetUrls: initialAssetUrls,
  });

  runtime.workspace.updateAssetRuntimeStates(initialAssetStates);

  (window as any).__W3G_ASSET_PROOF__ = {
    repository,
    bridge,
    runtime,
    session,
    initialAsset,
    getDocument: () => runtime.workspace.getSnapshot().session.getSnapshot().document,
    getWorkspaceSnapshot: () => runtime.workspace.getSnapshot(),
    forceAssetState: (assetId: string, status: 'unavailable' | 'integrity-failed') => {
      const doc = runtime.workspace.getSnapshot().session.getSnapshot().document;
      const asset = doc.assets.find((a) => a.id === assetId) ?? initialAsset;
      if (status === 'unavailable') {
        runtime.workspace.setAssetRuntimeState(assetId, {
          status: 'unavailable',
          error: 'Remote storage object unavailable',
          asset,
        });
      } else {
        runtime.workspace.setAssetRuntimeState(assetId, {
          status: 'integrity-failed',
          code: 'DURABLE_METADATA_MISMATCH',
          message: 'Durable metadata mismatch',
          asset,
        });
      }
      // Remove resolved URL so image displays degraded state
      const nextUrls = new Map(runtime.workspace.getSnapshot().assetUrls);
      nextUrls.delete(assetId);
      runtime.workspace.setAssetUrl(assetId, '');
    },
    attemptPublication: async () => {
      const doc = runtime.workspace.getSnapshot().session.getSnapshot().document;
      const urls = runtime.workspace.getSnapshot().assetUrls;
      return await resolveAssets(doc, (asset) => urls.get(asset.id));
    },
  };

  const root = document.getElementById('root');
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <VNextApp runtime={runtime} assetBridge={bridge} />
      </React.StrictMode>
    );
  }
}

void initProof();
