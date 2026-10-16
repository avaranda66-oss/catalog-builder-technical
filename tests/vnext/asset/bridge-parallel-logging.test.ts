import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_CONCURRENT_DOWNLOADS,
  DefaultAssetPersistenceBridge,
  sanitizedAssetErrorCode,
  type AssetLineageContext,
  type AssetRecord,
  type AssetRepository,
} from '@/vnext/asset';
import { sha256 } from '@/vnext/asset/integrity';
import type { AssetRef, CatalogDocument } from '@/vnext/domain';
import { deferred, documentFixture } from '../persistence/w3h-fixtures';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4c8AAAAASUVORK5CYII=', 'base64'));

function photoId(index: number): string {
  return `a0000000-0000-4000-a000-${String(index).padStart(12, '0')}`;
}

async function photo(index: number): Promise<AssetRef> {
  return {
    id: photoId(index), version: '1', sha256: await sha256(PNG),
    mime: 'image/png', widthPx: 1, heightPx: 1, name: `foto-${index}.png`, alt: `Foto ${index}`,
  };
}

function recordOf(asset: AssetRef): AssetRecord {
  return {
    ...asset, version: '1', storageBucket: 'product-assets', storagePath: `vnext/${asset.id}/1.png`,
    fileSize: PNG.byteLength, createdAt: '2026-10-16T12:00:00.000Z',
  };
}

function repositoryFor(assets: readonly AssetRef[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    getAsset: vi.fn<AssetRepository['getAsset']>(async (id) => ({ ok: true, record: recordOf(byId.get(id)!) })),
    createSignedUrl: vi.fn<AssetRepository['createSignedUrl']>(async (path) => ({ ok: true, signedUrl: `https://storage.test/${path}` })),
    uploadBytes: vi.fn<AssetRepository['uploadBytes']>(async () => ({ ok: true })),
    finalizeAsset: vi.fn<AssetRepository['finalizeAsset']>(async () => ({ ok: false, error: { code: 'UNUSED', message: 'unused' } })),
  } satisfies AssetRepository;
}

/** A catalog whose page shows the photos `used`; `assets` may also list photos no page uses. */
function catalogWith(used: readonly AssetRef[], assets: readonly AssetRef[]): CatalogDocument {
  const base = documentFixture();
  return {
    ...base,
    pages: [{
      ...base.pages[0]!,
      objects: used.map((asset, index) => ({
        id: `photo-${index}`, type: 'image' as const, assetId: asset.id, fit: 'contain' as const, zIndex: index,
        frame: { xMm: 10, yMm: 10 + index * 20, widthMm: 40, heightMm: 15 },
      })),
    }],
    assets: [...assets],
  };
}

async function settle(turns = 20): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

describe('FR-41 photos download together, at most 4 at a time', () => {
  it('starts 4 downloads, starts the next one only when one finishes, and still resolves all of them', async () => {
    const photos = await Promise.all(Array.from({ length: 10 }, (_, index) => photo(index + 1)));
    const repository = repositoryFor(photos);
    const pending = new Map<string, ReturnType<typeof deferred<ArrayBuffer>>>();
    let running = 0;
    let peak = 0;
    let answerAtOnce = false;
    const fetchBytes = vi.fn(async (url: string) => {
      running += 1;
      peak = Math.max(peak, running);
      const wait = deferred<ArrayBuffer>();
      pending.set(url, wait);
      if (answerAtOnce) wait.resolve(PNG.slice().buffer);
      try {
        return await wait.promise;
      } finally {
        running -= 1;
      }
    });
    const bridge = new DefaultAssetPersistenceBridge(repository, { imageReencoder: null, fetchBytes, logFailure: vi.fn() });

    const resolution = bridge.resolveDocumentAssets(catalogWith(photos, photos), undefined, { onlyUsed: true });
    await settle();
    expect(DEFAULT_MAX_CONCURRENT_DOWNLOADS).toBe(4);
    expect(fetchBytes).toHaveBeenCalledTimes(4);
    expect(repository.getAsset).toHaveBeenCalledTimes(4);

    const [first] = [...pending.values()];
    first!.resolve(PNG.slice().buffer);
    await vi.waitFor(() => expect(fetchBytes).toHaveBeenCalledTimes(5));
    expect(repository.getAsset).toHaveBeenCalledTimes(5);

    answerAtOnce = true;
    for (const wait of pending.values()) wait.resolve(PNG.slice().buffer);
    const resolved = await resolution;
    expect(peak).toBe(4);
    expect([...resolved.states.values()].every((state) => state.status === 'resolved')).toBe(true);
    expect(resolved.urls.size).toBe(10);
  });

  it('with onlyUsed, never downloads a photo that is only in the catalog photo list', async () => {
    const used = await photo(1);
    const leftover = await photo(2);
    const repository = repositoryFor([used, leftover]);
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      imageReencoder: null, fetchBytes: async () => PNG.slice().buffer, logFailure: vi.fn(),
    });

    const resolved = await bridge.resolveDocumentAssets(catalogWith([used], [leftover, used]), undefined, { onlyUsed: true });

    expect(repository.getAsset.mock.calls.map(([id]) => id)).toEqual([used.id]);
    expect([...resolved.states.keys()]).toEqual([used.id]);
    expect(resolved.urls.has(leftover.id)).toBe(false);
  });
});

describe('FR-45 bridge residues', () => {
  it('logs only a short sanitized code when a photo fails to load, never the message or the address', async () => {
    const asset = await photo(1);
    const repository = repositoryFor([asset]);
    const logFailure = vi.fn();
    const leaky = Object.assign(new Error('GET https://storage.test/vnext/foto.png?token=secret failed'), { code: 'ECONNRESET' });
    const fetchBytes = vi.fn<(url: string) => Promise<ArrayBuffer>>().mockRejectedValueOnce(leaky);
    const bridge = new DefaultAssetPersistenceBridge(repository, { imageReencoder: null, fetchBytes, logFailure });

    const result = await bridge.resolve(asset);

    expect(result).toMatchObject({ ok: false, state: { status: 'unavailable', asset } });
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure).toHaveBeenCalledWith('ECONNRESET');
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain('token');
  });

  it('writes the code to the console by default, with nothing else from the error', async () => {
    const asset = await photo(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const repository = repositoryFor([asset]);
      repository.getAsset.mockRejectedValueOnce(new TypeError('Failed to fetch https://storage.test/x?token=secret'));
      const bridge = new DefaultAssetPersistenceBridge(repository, { imageReencoder: null, fetchBytes: async () => PNG.slice().buffer });

      await bridge.resolve(asset);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('[vnext asset] photo could not be loaded', { code: 'TypeError' });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps only safe codes: an explicit code, else the error class, else UNKNOWN', () => {
    expect(sanitizedAssetErrorCode({ code: 'storage.object_not_found' })).toBe('storage.object_not_found');
    expect(sanitizedAssetErrorCode({ code: 'https://storage.test/x?token=1' })).toBe('UNKNOWN');
    expect(sanitizedAssetErrorCode(new RangeError('https://storage.test/x'))).toBe('RangeError');
    expect(sanitizedAssetErrorCode('Failed https://storage.test/x')).toBe('UNKNOWN');
    expect(sanitizedAssetErrorCode(undefined)).toBe('UNKNOWN');
  });

  it('reports "Sem conexão" (offline) instead of a broken photo when the browser has no connection', async () => {
    const asset = await photo(1);
    const repository = repositoryFor([asset]);
    repository.getAsset.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      imageReencoder: null, fetchBytes: async () => PNG.slice().buffer, isOffline: () => true, logFailure: vi.fn(),
    });

    expect(await bridge.resolve(asset)).toMatchObject({ ok: false, state: { status: 'offline', asset } });
  });

  it('treats an empty lineage after a real one as lost access: the download in progress is dropped', async () => {
    const asset = await photo(1);
    const repository = repositoryFor([asset]);
    let active: AssetLineageContext = { authLineage: 'user-a:0', authorityScopeId: 'scope-a' };
    const started = deferred<void>();
    const bytes = deferred<ArrayBuffer>();
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      imageReencoder: null,
      fetchBytes: () => { started.resolve(); return bytes.promise; },
      getActiveLineage: () => active,
      logFailure: vi.fn(),
    });

    const resolution = bridge.resolve(asset, { authLineage: 'user-a:0', authorityScopeId: 'scope-a' });
    await started.promise;
    active = { authLineage: '', authorityScopeId: '' };
    bytes.resolve(PNG.slice().buffer);

    expect(await resolution).toMatchObject({ ok: false, state: { status: 'unavailable', error: 'A sessão mudou. Abra o catálogo novamente.' } });
  });
});
