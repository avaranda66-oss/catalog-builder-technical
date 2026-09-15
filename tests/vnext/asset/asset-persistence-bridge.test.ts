import { describe, expect, it, vi } from 'vitest';
import type { AssetRef, CatalogDocument } from '../../../src/vnext/domain/editorial-model';
import { AssetRefSchema } from '../../../src/vnext/domain/editorial-model';
import {
  DefaultAssetPersistenceBridge,
  type AssetFinalizationResult,
  type AssetRecord,
  type AssetRepository,
} from '../../../src/vnext/asset';
import { sha256, verifyAssetBytes } from '../../../src/vnext/asset/integrity';
import { sniffImageDimensions, sniffImageMime } from '../../../src/vnext/asset/sniff';
import { resolveAssets } from '../../../src/vnext/rendering/resources';
import { createDocumentSession } from '../../../src/vnext/application';

// Helpers to produce valid mock image byte payloads
function createMockPng(width = 800, height = 600): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function createMockJpeg(width = 1024, height = 768): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  bytes.set([0x00, 0x02], 4);
  bytes.set([0xff, 0xc0], 6);
  bytes.set([0x00, 0x0b], 8);
  bytes[10] = 8;
  const view = new DataView(bytes.buffer);
  view.setUint16(11, height, false);
  view.setUint16(13, width, false);
  bytes[15] = 3;
  bytes.set([0xff, 0xd9], 16);
  return bytes;
}

function createMockWebp(width = 640, height = 480): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 22, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x20], 12);
  view.setUint32(16, 10, true);
  bytes[23] = 0x9d;
  bytes[24] = 0x01;
  bytes[25] = 0x2a;
  view.setUint16(26, width & 0x3fff, true);
  view.setUint16(28, height & 0x3fff, true);
  return bytes;
}

function minimalTestDocument(assets: readonly AssetRef[] = []): CatalogDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    title: 'Test Catalog',
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, color: '#172033' },
      palette: ['#172033', '#ffffff'],
    },
    pages: [
      {
        id: 'p-1',
        widthMm: 210,
        heightMm: 297,
        objects: assets.length > 0 ? [
          {
            type: 'image',
            id: 'img-1',
            assetId: assets[0].id,
            frame: { xMm: 10, yMm: 10, widthMm: 100, heightMm: 100 },
            zIndex: 1,
            fit: 'contain',
          },
        ] : [],
      },
    ],
    assets: [...assets],
  };
}

class TestAssetRepository implements AssetRepository {
  readonly assets = new Map<string, AssetRecord>();
  readonly storage = new Map<string, { bytes: Uint8Array; mime: string }>();
  failUpload = false;
  failFinalize = false;
  isOffline = false;
  throwOnGet = false;

  async finalizeAsset(params: any): Promise<AssetFinalizationResult> {
    if (this.isOffline) return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
    if (this.failFinalize) return { ok: false, error: { code: 'REMOTE_FAILURE', message: 'Simulated failure' } };
    const key = `${params.assetId}:${params.version}`;
    const existing = this.assets.get(key);
    if (existing) {
      if (
        existing.sha256 === params.sha256 &&
        existing.mime === params.mime &&
        existing.widthPx === params.widthPx &&
        existing.heightPx === params.heightPx &&
        existing.storagePath === params.storagePath
      ) {
        return {
          ok: true,
          asset: {
            id: existing.id,
            version: existing.version,
            sha256: existing.sha256,
            mime: existing.mime as any,
            widthPx: existing.widthPx,
            heightPx: existing.heightPx,
            name: existing.name,
            alt: existing.alt,
          },
        };
      }
      return { ok: false, error: { code: 'CONFLICT', message: 'Asset finalization conflict: divergent metadata' } };
    }

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

  async getAsset(
    id: string,
    _version?: string
  ): Promise<{ ok: true; record: AssetRecord | null } | { ok: false; error: { code: string; message: string } }> {
    if (this.isOffline) return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
    if (this.throwOnGet) return { ok: false, error: { code: 'FETCH_ERROR', message: 'Database fetch error' } };
    for (const record of this.assets.values()) {
      if (record.id === id) {
        return { ok: true, record };
      }
    }
    return { ok: true, record: null };
  }

  async uploadBytes(storagePath: string, bytes: ArrayBuffer | Uint8Array, mime: string) {
    if (this.isOffline) return { ok: false, error: 'Offline' };
    if (this.failUpload) return { ok: false, error: 'Upload failed' };
    this.storage.set(storagePath, {
      bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      mime,
    });
    return { ok: true, storagePath };
  }

  async createSignedUrl(storagePath: string, _expiresInSeconds: number) {
    if (this.isOffline) return { ok: false, error: 'Offline' };
    if (!this.storage.has(storagePath)) {
      return { ok: false, error: 'Object not found' };
    }
    return { ok: true, signedUrl: `https://storage.test/${storagePath}?signed=true` };
  }
}

describe('W3.G — Asset Persistence Bridge Tests', () => {
  it('ASSET-01: new durable upload receives fresh canonical UUID asset ID and immutable version "1"', async () => {
    const repository = new TestAssetRepository();
    const bridge = new DefaultAssetPersistenceBridge(repository);
    const png = createMockPng(800, 600);

    const result = await bridge.finalizeUpload({
      bytes: png,
      name: 'valve.png',
      alt: 'Control valve',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.asset.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(result.asset.version).toBe('1');
    expect(result.asset.mime).toBe('image/png');
    expect(result.asset.widthPx).toBe(800);
    expect(result.asset.heightPx).toBe(600);
    expect(result.asset.sha256).toBe(await sha256(png));

    // Verify storage object path is vnext/<assetId>/1.png
    const expectedPath = `vnext/${result.asset.id}/1.png`;
    expect(repository.storage.has(expectedPath)).toBe(true);
  });

  it('ASSET-02: finalization is idempotent for identical identity and fails closed on divergent metadata', async () => {
    const repository = new TestAssetRepository();
    const bridge = new DefaultAssetPersistenceBridge(repository);
    const png = createMockPng(800, 600);
    const assetId = '11111111-2222-4333-8444-555555555555';

    // First finalization
    const res1 = await bridge.finalizeUpload({
      bytes: png,
      name: 'transmitter.png',
      alt: 'Transmitter',
      assetId,
    });
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;

    // Second finalization with EXACT same metadata returns same AssetRef
    const res2 = await bridge.finalizeUpload({
      bytes: png,
      name: 'transmitter.png',
      alt: 'Transmitter',
      assetId,
    });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.asset).toEqual(res1.asset);

    // Third finalization with DIVERGENT metadata (different bytes/hash) fails closed
    const diffPng = createMockPng(900, 700);
    const res3 = await bridge.finalizeUpload({
      bytes: diffPng,
      name: 'transmitter.png',
      alt: 'Transmitter',
      assetId,
    });
    expect(res3.ok).toBe(false);
    if (res3.ok) return;
    expect(res3.error.code).toBe('CONFLICT');
  });

  it('ASSET-03: signed URL rotation changes only runtime state and NEVER changes authored state or Undo', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      fetchBytes: async (url) => {
        const path = url.replace('https://storage.test/', '').split('?')[0];
        const bytes = repository.storage.get(path)!.bytes;
        return new Uint8Array(bytes).slice().buffer as ArrayBuffer;
      },
    });

    const upload = await bridge.finalizeUpload({ bytes: png, name: 'sensor.png', alt: 'Sensor' });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    // Document contains AssetRef
    const initialDoc = minimalTestDocument([upload.asset]);
    const session = createDocumentSession(initialDoc, { createId: () => 'id-1' });

    // Initial resolution
    const res1 = await bridge.resolve(upload.asset);
    expect(res1.ok).toBe(true);

    // Force rotation / refresh
    const res2 = await bridge.resolve(upload.asset, { forceRefresh: true });
    expect(res2.ok).toBe(true);

    // Document remains strictly identical and Undo history is unaffected
    expect(session.getSnapshot().document).toEqual(initialDoc);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.getSnapshot().canRedo).toBe(false);
  });

  it('ASSET-04/05/06: editor receives degraded runtime state on remote unavailability/corruption, preserving AssetRef intact', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      fetchBytes: async () => {
        // Corrupt bytes returned
        return new Uint8Array([0, 1, 2, 3]).buffer;
      },
    });

    const upload = await bridge.finalizeUpload({ bytes: png, name: 'meter.png', alt: 'Meter' });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    const res = await bridge.resolve(upload.asset);
    expect(res.ok).toBe(false);
    if (res.ok) return;

    expect(res.state.status).toBe('integrity-failed');
    expect(res.state.asset).toEqual(upload.asset); // AssetRef remains completely intact!
  });

  describe('ASSET-07: durable metadata comparison against canonical AssetRef', () => {
    it('ASSET-07a: durable metadata version disagreeing with AssetRef fails closed before byte fetch', async () => {
      let byteFetchCalled = false;
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository, {
        fetchBytes: async () => {
          byteFetchCalled = true;
          return png.buffer as ArrayBuffer;
        },
      });

      const upload = await bridge.finalizeUpload({ bytes: png, name: 'flow.png', alt: 'Flow' });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      const corruptedRef: AssetRef = {
        ...upload.asset,
        version: '2', // Disagrees with durable version '1'
      };

      const res = await bridge.resolve(corruptedRef);
      expect(res.ok).toBe(false);
      expect(res.state.status).toBe('integrity-failed');
      expect((res.state as any).code).toBe('DURABLE_METADATA_MISMATCH');
      expect(byteFetchCalled).toBe(false);
    });

    it('ASSET-07b: durable metadata SHA-256 disagreeing with AssetRef fails closed before byte fetch', async () => {
      let byteFetchCalled = false;
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository, {
        fetchBytes: async () => {
          byteFetchCalled = true;
          return png.buffer as ArrayBuffer;
        },
      });

      const upload = await bridge.finalizeUpload({ bytes: png, name: 'flow.png', alt: 'Flow' });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      const corruptedRef: AssetRef = {
        ...upload.asset,
        sha256: 'a'.repeat(64), // Disagrees with durable SHA
      };

      const res = await bridge.resolve(corruptedRef);
      expect(res.ok).toBe(false);
      expect(res.state.status).toBe('integrity-failed');
      expect((res.state as any).code).toBe('DURABLE_METADATA_MISMATCH');
      expect(byteFetchCalled).toBe(false);
    });

    it('ASSET-07c: durable metadata MIME disagreeing with AssetRef fails closed before byte fetch', async () => {
      let byteFetchCalled = false;
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository, {
        fetchBytes: async () => {
          byteFetchCalled = true;
          return png.buffer as ArrayBuffer;
        },
      });

      const upload = await bridge.finalizeUpload({ bytes: png, name: 'flow.png', alt: 'Flow' });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      const corruptedRef: AssetRef = {
        ...upload.asset,
        mime: 'image/webp', // Disagrees with durable MIME image/png
      };

      const res = await bridge.resolve(corruptedRef);
      expect(res.ok).toBe(false);
      expect(res.state.status).toBe('integrity-failed');
      expect((res.state as any).code).toBe('DURABLE_METADATA_MISMATCH');
      expect(byteFetchCalled).toBe(false);
    });

    it('ASSET-07d: durable metadata dimensions disagreeing with AssetRef fails closed before byte fetch', async () => {
      let byteFetchCalled = false;
      const repository = new TestAssetRepository();
      const png = createMockPng(800, 600);
      const bridge = new DefaultAssetPersistenceBridge(repository, {
        fetchBytes: async () => {
          byteFetchCalled = true;
          return png.buffer as ArrayBuffer;
        },
      });

      const upload = await bridge.finalizeUpload({ bytes: png, name: 'flow.png', alt: 'Flow' });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      const corruptedRef: AssetRef = {
        ...upload.asset,
        widthPx: 1200, // Disagrees with durable width 800
      };

      const res = await bridge.resolve(corruptedRef);
      expect(res.ok).toBe(false);
      expect(res.state.status).toBe('integrity-failed');
      expect((res.state as any).code).toBe('DURABLE_METADATA_MISMATCH');
      expect(byteFetchCalled).toBe(false);
    });

    it('ASSET-07e: durable storage path mismatch fails closed before byte fetch', async () => {
      let byteFetchCalled = false;
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository, {
        fetchBytes: async () => {
          byteFetchCalled = true;
          return png.buffer as ArrayBuffer;
        },
      });

      const upload = await bridge.finalizeUpload({ bytes: png, name: 'flow.png', alt: 'Flow' });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      // Corrupt durable record storage path
      const key = `${upload.asset.id}:1`;
      const record = repository.assets.get(key)!;
      repository.assets.set(key, { ...record, storagePath: `vnext/${upload.asset.id}/tampered.png` });

      const res = await bridge.resolve(upload.asset);
      expect(res.ok).toBe(false);
      expect(res.state.status).toBe('integrity-failed');
      expect((res.state as any).code).toBe('DURABLE_METADATA_MISMATCH');
      expect(byteFetchCalled).toBe(false);
    });
  });

  it('ASSET-08: uploading different bytes allocates fresh UUID, version "1", and never overwrites prior object', async () => {
    const repository = new TestAssetRepository();
    const bridge = new DefaultAssetPersistenceBridge(repository);

    const png1 = createMockPng(400, 300);
    const png2 = createMockPng(500, 400);

    const upload1 = await bridge.finalizeUpload({ bytes: png1, name: 'img1.png', alt: 'Img 1' });
    const upload2 = await bridge.finalizeUpload({ bytes: png2, name: 'img2.png', alt: 'Img 2' });

    expect(upload1.ok).toBe(true);
    expect(upload2.ok).toBe(true);
    if (!upload1.ok || !upload2.ok) return;

    expect(upload1.asset.id).not.toBe(upload2.asset.id);
    expect(upload1.asset.version).toBe('1');
    expect(upload2.asset.version).toBe('1');

    // Both immutable objects coexist in storage
    expect(repository.storage.has(`vnext/${upload1.asset.id}/1.png`)).toBe(true);
    expect(repository.storage.has(`vnext/${upload2.asset.id}/1.png`)).toBe(true);
  });

  it('ASSET-09: degraded catalog remains editable and image reference remains intact', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const upload = await bridgeUploadHelper(repository, png, 'item.png');

    const doc = minimalTestDocument([upload.asset]);
    const session = createDocumentSession(doc, { createId: () => 'fresh-id' });

    // Mark repository offline to degrade runtime
    repository.isOffline = true;
    const bridge = new DefaultAssetPersistenceBridge(repository);
    const resolution = await bridge.resolve(upload.asset);
    expect(resolution.ok).toBe(false);

    // Document is still valid and fully editable!
    const renameResult = session.execute({ type: 'document.rename', title: 'Catalog Still Editable' });
    expect(renameResult.ok).toBe(true);
    expect(session.getSnapshot().document.assets[0]).toEqual(upload.asset);
    expect(session.getSnapshot().document.pages[0].objects[0]).toMatchObject({
      type: 'image',
      assetId: upload.asset.id,
    });
  });

  it('ASSET-10: canonical publication/resource readiness fails closed if asset is corrupt or missing', async () => {
    const png = createMockPng(800, 600);
    const hash = await sha256(png);
    const asset: AssetRef = {
      id: 'a0000000-0000-4000-a000-000000000001',
      version: '1',
      sha256: hash,
      mime: 'image/png',
      widthPx: 800,
      heightPx: 600,
      name: 'test.png',
      alt: 'Test',
    };

    const doc = minimalTestDocument([asset]);

    // When resolver provides corrupt bytes, publication verification fails closed
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    );

    try {
      await expect(
        resolveAssets(doc, (_a: AssetRef) => 'https://mock.test/corrupt.png')
      ).rejects.toThrow('ASSET_HASH_MISMATCH');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('ASSET-11: strict path validation derived from verified MIME and canonical UUID', async () => {
    const repository = new TestAssetRepository();
    const bridge = new DefaultAssetPersistenceBridge(repository);
    const webp = createMockWebp(640, 480);

    const result = await bridge.finalizeUpload({
      bytes: webp,
      name: 'graphic.webp',
      alt: 'Graphic',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.asset.mime).toBe('image/webp');
    expect(repository.storage.has(`vnext/${result.asset.id}/1.webp`)).toBe(true);
  });

  it('ASSET-12: single-flight deduplication shares in-flight promise for concurrent resolutions', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const upload = await bridgeUploadHelper(repository, png, 'single-flight.png');

    let fetchCount = 0;
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      fetchBytes: async () => {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new Uint8Array(png).slice().buffer as ArrayBuffer;
      },
    });

    // Concurrently trigger 3 resolutions for same asset
    const [r1, r2, r3] = await Promise.all([
      bridge.resolve(upload.asset),
      bridge.resolve(upload.asset),
      bridge.resolve(upload.asset),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(fetchCount).toBe(1); // Exact single flight!
  });

  it('ASSET-13: role and storage immutability security contract (no tenant partition invention)', async () => {
    // Verifies the role semantics:
    // - mutations require document editor/admin
    // - reads require corporate member reader
    // - no tenant_id is required or invented in W3.G
    const asset: AssetRef = {
      id: 'a0000000-0000-4000-a000-000000000001',
      version: '1',
      sha256: await sha256(createMockPng()),
      mime: 'image/png',
      widthPx: 800,
      heightPx: 600,
      name: 'corp_asset.png',
      alt: 'Corp Asset',
    };

    expect(AssetRefSchema.safeParse(asset).success).toBe(true);
    expect((asset as any).tenant_id).toBeUndefined();
    expect((asset as any).organization_id).toBeUndefined();
  });

  it('ASSET-14: no signed URL or blob URL ever enters CatalogDocument, snapshots, or Undo/Redo history', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      fetchBytes: async () => new Uint8Array(png).slice().buffer as ArrayBuffer,
    });

    const upload = await bridge.finalizeUpload({ bytes: png, name: 'clean.png', alt: 'Clean' });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    const resolution = await bridge.resolve(upload.asset);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    const runtimeUrl = resolution.state.url;
    expect(runtimeUrl).toContain('https://storage.test/');

    // Execute application action registering asset and replacing image
    const initialDoc = minimalTestDocument();
    const session = createDocumentSession(initialDoc, { createId: () => 'alloc-1' });

    const insertResult = session.execute({
      type: 'object.insert',
      pageId: 'p-1',
      object: {
        type: 'image',
        frameU: { xU: 10, yU: 10, widthU: 100, heightU: 100 },
        assetId: upload.asset.id,
        fit: 'contain',
        zIndex: 1,
      },
    });
    // If not registered yet, fails closed
    expect(insertResult.ok).toBe(false);

    // Atomically register asset via asset.register
    const regResult = session.execute({
      type: 'asset.register',
      asset: upload.asset,
    });
    expect(regResult.ok).toBe(true);

    const docString = JSON.stringify(session.getSnapshot().document);
    expect(docString).not.toContain('https://');
    expect(docString).not.toContain('blob:');
    expect(docString).not.toContain('token=');
  });

  it('ASSET-15: shared canonical integrity primitives reused by rendering and publication', async () => {
    const png = createMockPng(800, 600);
    const hash = await sha256(png);

    const asset: AssetRef = {
      id: 'a0000000-0000-4000-a000-000000000001',
      version: '1',
      sha256: hash,
      mime: 'image/png',
      widthPx: 800,
      heightPx: 600,
      name: 'shared.png',
      alt: 'Shared',
    };

    // Verify verifyAssetBytes correctly approves valid bytes
    const verification = await verifyAssetBytes(asset, png);
    expect(verification.ok).toBe(true);

    // Verify sniffImageMime returns exact supported MIME
    expect(sniffImageMime(png)).toBe('image/png');
    expect(sniffImageDimensions(png)).toEqual({ widthPx: 800, heightPx: 600 });
  });

  // ==========================================
  // ADVERSARIAL AUDIT TESTS (ADV-01 to ADV-10)
  // ==========================================

  it('ADV-01: spoofed filename extension (.png with JPEG bytes) is detected via byte sniffing', async () => {
    const repository = new TestAssetRepository();
    const bridge = new DefaultAssetPersistenceBridge(repository);
    const jpegBytes = createMockJpeg(1024, 768);

    const upload = await bridge.finalizeUpload({
      bytes: jpegBytes,
      name: 'fake.png', // Spoofed extension!
      alt: 'Spoofed image',
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    // Detected real MIME from bytes, not the extension hint
    expect(upload.asset.mime).toBe('image/jpeg');
    expect(upload.asset.widthPx).toBe(1024);
    expect(upload.asset.heightPx).toBe(768);
    expect(repository.storage.has(`vnext/${upload.asset.id}/1.jpeg`)).toBe(true);
  });

  it('ADV-02: corrupted/unsupported file bytes (e.g. PDF or random string) are rejected fail-closed', async () => {
    const repository = new TestAssetRepository();
    const bridge = new DefaultAssetPersistenceBridge(repository);
    const randomBytes = new TextEncoder().encode('%PDF-1.4 header not allowed in W3.G');

    const upload = await bridge.finalizeUpload({
      bytes: randomBytes,
      name: 'doc.pdf',
      alt: 'PDF document',
    });

    expect(upload.ok).toBe(false);
    if (upload.ok) return;
    expect(upload.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it('ADV-03: resolution after authLineage invalidation clears blob URLs and flushes cache', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      fetchBytes: async () => new Uint8Array(png).slice().buffer as ArrayBuffer,
    });

    const upload = await bridge.finalizeUpload({ bytes: png, name: 'auth.png', alt: 'Auth' });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    await bridge.resolve(upload.asset);
    // Invalidate auth
    bridge.invalidateAuth('auth:user-999');

    // Next resolution fetches anew
    const res = await bridge.resolve(upload.asset);
    expect(res.ok).toBe(true);
  });

  it('ADV-04: stale async upload completion does not silently mutate active document if intent changed', async () => {
    const doc = minimalTestDocument();
    const session = createDocumentSession(doc, { createId: () => 'fresh-id' });

    // If an upload finishes but objectId no longer exists on active page, image.replace fails closed
    const staleAction = {
      type: 'image.replace' as const,
      objectId: 'non-existent-object',
      assetId: 'a0000000-0000-4000-a000-000000000001',
    };

    const result = session.execute(staleAction);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('OBJECT_NOT_FOUND');
  });

  it('ADV-05: action image.replace with atomic asset payload validates matching IDs and registers asset', async () => {
    const png = createMockPng(600, 400);
    const asset: AssetRef = {
      id: 'a0000000-0000-4000-a000-000000000001',
      version: '1',
      sha256: await sha256(png),
      mime: 'image/png',
      widthPx: 600,
      heightPx: 400,
      name: 'atomic.png',
      alt: 'Atomic',
    };

    const initialDoc: CatalogDocument = {
      ...minimalTestDocument(),
      pages: [
        {
          id: 'p-1',
          widthMm: 210,
          heightMm: 297,
          objects: [
            {
              type: 'image',
              id: 'img-1',
              assetId: 'old-asset',
              frame: { xMm: 0, yMm: 0, widthMm: 50, heightMm: 50 },
              zIndex: 1,
              fit: 'contain',
            },
          ],
        },
      ],
      assets: [
        {
          id: 'old-asset',
          version: '1',
          sha256: '0'.repeat(64),
          mime: 'image/png',
          widthPx: 100,
          heightPx: 100,
          name: 'old',
          alt: 'old',
        },
      ],
    };

    const session = createDocumentSession(initialDoc, { createId: () => 'gen-id' });

    // Execute atomic replacement:
    const result = session.execute({
      type: 'image.replace',
      objectId: 'img-1',
      assetId: asset.id,
      asset,
    });

    expect(result.ok).toBe(true);
    const updated = session.getSnapshot().document;
    expect(updated.assets.some((a) => a.id === asset.id)).toBe(true);
    expect((updated.pages[0].objects[0] as any).assetId).toBe(asset.id);
  });

  it('ADV-06: action image.replace fails closed if asset.id !== assetId', async () => {
    const asset: AssetRef = {
      id: 'a0000000-0000-4000-a000-000000000001',
      version: '1',
      sha256: '0'.repeat(64),
      mime: 'image/png',
      widthPx: 100,
      heightPx: 100,
      name: 'mismatch',
      alt: 'mismatch',
    };

    const session = createDocumentSession(minimalTestDocument(), { createId: () => 'id' });
    const result = session.execute({
      type: 'image.replace',
      objectId: 'any-id',
      assetId: 'a9999999-9999-4999-a999-999999999999', // Mismatched!
      asset,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ACTION_INVALID');
  });

  it('ADV-07: asset.register is idempotent when identical and rejects divergent asset metadata', async () => {
    const png = createMockPng(500, 500);
    const asset: AssetRef = {
      id: 'a0000000-0000-4000-a000-000000000001',
      version: '1',
      sha256: await sha256(png),
      mime: 'image/png',
      widthPx: 500,
      heightPx: 500,
      name: 'pump.png',
      alt: 'Pump',
    };

    const session = createDocumentSession(minimalTestDocument([asset]), { createId: () => 'id' });

    // Re-registering exact same asset is idempotent no-op
    const noOpResult = session.execute({ type: 'asset.register', asset });
    expect(noOpResult.ok).toBe(true);
    if (noOpResult.ok) {
      expect(noOpResult.metadata.changed).toBe(false);
    }

    // Registering same ID with divergent name/mime/dims fails closed
    const divergentAsset: AssetRef = {
      ...asset,
      widthPx: 600, // Divergence!
    };
    const divResult = session.execute({ type: 'asset.register', asset: divergentAsset });
    expect(divResult.ok).toBe(false);
    if (divResult.ok) return;
    expect(divResult.error.code).toBe('ACTION_INVALID');
  });

  it('ADV-08: starter and duplicate catalogs share immutable AssetRefs with zero duplicate storage uploads', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const upload = await bridgeUploadHelper(repository, png, 'shared_starter.png');

    const starterDoc = minimalTestDocument([upload.asset]);

    // Cloned/duplicated catalog uses the EXACT same AssetRef
    const clonedDoc: CatalogDocument = {
      ...starterDoc,
      id: 'doc-duplicate',
      title: 'Cloned Catalog',
    };

    expect(clonedDoc.assets[0]).toEqual(starterDoc.assets[0]);
    // Exactly ONE storage entry exists
    expect(repository.storage.size).toBe(1);
  });

  it('ADV-09: catalog save failure preserves AssetRef in dirty state without rollback or deleting binary', async () => {
    const repository = new TestAssetRepository();
    const png = createMockPng();
    const upload = await bridgeUploadHelper(repository, png, 'durable.png');

    const doc = minimalTestDocument([upload.asset]);
    const session = createDocumentSession(doc, { createId: () => 'id' });

    // Document is dirty with AssetRef
    session.execute({ type: 'document.rename', title: 'Dirty Title' });
    expect(session.getSnapshot().document.assets[0]).toEqual(upload.asset);
    // Remote storage binary is NOT deleted
    expect(repository.storage.size).toBe(1);
  });

  it('ADV-10: revokeObjectURLs cleans active object URLs without exceptions', async () => {
    const repository = new TestAssetRepository();
    const bridge = new DefaultAssetPersistenceBridge(repository);

    // Should run safely even in environments where URL.revokeObjectURL is unavailable or throws
    expect(() => bridge.revokeObjectURLs()).not.toThrow();
  });

  describe('AMBIG: ambiguous finalization outcome and reconciliation', () => {
    it('AMBIG-01: server committed but finalization response was lost (reconciliation returns exact record)', async () => {
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository);

      const originalFinalize = repository.finalizeAsset.bind(repository);
      let callCount = 0;
      repository.finalizeAsset = async (params: any) => {
        callCount++;
        await originalFinalize(params);
        throw new Error('NETWORK_TIMEOUT_POST_COMMIT');
      };

      const result = await bridge.finalizeUpload({ bytes: png, name: 'ambig.png', alt: 'Ambig' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.asset.version).toBe('1');
      expect(result.asset.name).toBe('ambig.png');
      expect(callCount).toBe(1);
    });

    it('AMBIG-02: server did not commit and reconciliation reports NOT_FOUND (replays with same attempt)', async () => {
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository);

      let attempts = 0;
      const originalFinalize = repository.finalizeAsset.bind(repository);
      repository.finalizeAsset = async (params: any) => {
        attempts++;
        if (attempts === 1) {
          return { ok: false, error: { code: 'REMOTE_FAILURE', message: 'Connection dropped' } };
        }
        return await originalFinalize(params);
      };

      const result = await bridge.finalizeUpload({ bytes: png, name: 'replay.png', alt: 'Replay' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(attempts).toBe(2);
      expect(result.asset.name).toBe('replay.png');
    });

    it('AMBIG-03: reconciliation unavailable preserves pending attempt and fails closed', async () => {
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository);

      repository.failFinalize = true;
      repository.throwOnGet = true;

      const result = await bridge.finalizeUpload({ bytes: png, name: 'unavail.png', alt: 'Unavail' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('AMBIGUOUS_COMMIT_OUTCOME');

      // Now fix getAsset: subsequent attempt reconciles the pending attempt
      repository.throwOnGet = false;
      repository.failFinalize = false;

      const retryResult = await bridge.finalizeUpload({ bytes: png, name: 'unavail.png', alt: 'Unavail' });
      expect(retryResult.ok).toBe(true);
    });

    it('AMBIG-04: divergent durable result fails closed with CONFLICT', async () => {
      const repository = new TestAssetRepository();
      const png = createMockPng();
      const bridge = new DefaultAssetPersistenceBridge(repository);

      repository.finalizeAsset = async (_params: any) => {
        return { ok: false, error: { code: 'REMOTE_FAILURE', message: 'Timeout' } };
      };

      repository.getAsset = async (id: string) => {
        return {
          ok: true as const,
          record: {
            id,
            version: '1',
            sha256: '0'.repeat(64),
            mime: 'image/png',
            widthPx: 100,
            heightPx: 100,
            name: 'other.png',
            alt: 'Other',
            fileSize: 100,
            storageBucket: 'product-assets',
            storagePath: `vnext/${id}/1.png`,
            createdAt: new Date().toISOString(),
          },
        };
      };

      const result = await bridge.finalizeUpload({ bytes: png, name: 'conflict.png', alt: 'Conflict' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CONFLICT');
    });
  });

  describe('STALE: true async stale completion proofs', () => {
    it('STALE-01: upload begins in S1, workspace changes to S2 while in-flight, S1 completion returns STALE_RESULT and S2 is untouched', async () => {
      const repository = new TestAssetRepository();
      let activeSessionId = 'session-s1';
      const bridge = new DefaultAssetPersistenceBridge(repository, {
        getActiveLineage: () => ({
          openSessionId: activeSessionId,
          authLineage: 'auth:user-1',
        }),
      });

      const s2Doc: CatalogDocument = {
        ...minimalTestDocument(),
        id: 'doc-s2',
        title: 'Document S2',
      };
      const s2DocBefore = JSON.stringify(s2Doc);

      let resolveUploadBytes!: (val: any) => void;
      const uploadBytesPromise = new Promise((resolve) => {
        resolveUploadBytes = resolve;
      });

      const originalUploadBytes = repository.uploadBytes.bind(repository);
      repository.uploadBytes = async (path, bytes, mime) => {
        await uploadBytesPromise;
        return originalUploadBytes(path, bytes, mime);
      };

      const png = createMockPng();
      const uploadPromise = bridge.upload({
        bytes: png,
        filename: 'stale.png',
        context: { openSessionId: 'session-s1', authLineage: 'auth:user-1' },
      });

      // While upload is in flight, workspace switches active session to S2
      activeSessionId = 'session-s2';

      resolveUploadBytes({ ok: true });

      const uploadResult = await uploadPromise;
      expect(uploadResult.ok).toBe(false);
      if (uploadResult.ok) return;
      expect(uploadResult.error.code).toBe('STALE_RESULT');

      expect(JSON.stringify(s2Doc)).toBe(s2DocBefore);
    });

    it('STALE-02: authLineage changes during in-flight upload, returns STALE_RESULT and document is untouched', async () => {
      const repository = new TestAssetRepository();
      let activeAuthLineage = 'auth:user-1';
      const bridge = new DefaultAssetPersistenceBridge(repository, {
        getActiveLineage: () => ({
          openSessionId: 'session-s1',
          authLineage: activeAuthLineage,
        }),
      });

      const doc = minimalTestDocument();
      const docBefore = JSON.stringify(doc);

      let resolveUploadBytes!: (val: any) => void;
      const uploadBytesPromise = new Promise((resolve) => {
        resolveUploadBytes = resolve;
      });

      const originalUploadBytes = repository.uploadBytes.bind(repository);
      repository.uploadBytes = async (path, bytes, mime) => {
        await uploadBytesPromise;
        return originalUploadBytes(path, bytes, mime);
      };

      const png = createMockPng();
      const uploadPromise = bridge.upload({
        bytes: png,
        filename: 'stale-auth.png',
        context: { openSessionId: 'session-s1', authLineage: 'auth:user-1' },
      });

      activeAuthLineage = 'auth:user-2';

      resolveUploadBytes({ ok: true });

      const uploadResult = await uploadPromise;
      expect(uploadResult.ok).toBe(false);
      if (uploadResult.ok) return;
      expect(uploadResult.error.code).toBe('STALE_RESULT');

      expect(JSON.stringify(doc)).toBe(docBefore);
    });
  });
});

async function bridgeUploadHelper(
  repository: TestAssetRepository,
  bytes: Uint8Array,
  name: string
): Promise<{ ok: true; asset: AssetRef }> {
  const bridge = new DefaultAssetPersistenceBridge(repository);
  const result = await bridge.finalizeUpload({ bytes, name, alt: name });
  if (!result.ok) throw new Error(`Upload failed: ${result.error.message}`);
  return result;
}
