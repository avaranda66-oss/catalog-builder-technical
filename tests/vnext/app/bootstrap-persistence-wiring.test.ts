import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INVALIDATED_ASSET_LINEAGE,
  OPEN_PHOTO_WAIT_MS,
  browserIsOffline,
  settleWithin,
} from '@/vnext/app/bootstrap';
import { DefaultAssetPersistenceBridge, type AssetLineageContext, type AssetRepository } from '@/vnext/asset';
import type { AssetRef } from '@/vnext/domain';
import { deferred } from '../persistence/w3h-fixtures';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('FR-45 the photo bridge knows about the connection and lost access', () => {
  it('reads "offline" only from navigator.onLine === false', () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get');
    onLine.mockReturnValue(false);
    expect(browserIsOffline()).toBe(true);
    onLine.mockReturnValue(true);
    expect(browserIsOffline()).toBe(false);
  });

  it('reports lost access with a non-empty lineage, so a download that started before is dropped', async () => {
    expect(INVALIDATED_ASSET_LINEAGE.authLineage).not.toBe('');
    expect(INVALIDATED_ASSET_LINEAGE.authorityScopeId).not.toBe('');
    expect(Object.isFrozen(INVALIDATED_ASSET_LINEAGE)).toBe(true);

    const asset: AssetRef = {
      id: 'a0000000-0000-4000-a000-000000000001', version: '1', sha256: 'a'.repeat(64),
      mime: 'image/png', widthPx: 1, heightPx: 1, name: 'foto.png', alt: 'Foto',
    };
    const metadata = deferred<Awaited<ReturnType<AssetRepository['getAsset']>>>();
    const repository: AssetRepository = {
      getAsset: vi.fn(() => metadata.promise),
      createSignedUrl: vi.fn(async () => ({ ok: true as const, signedUrl: 'https://storage.test/foto.png' })),
      uploadBytes: vi.fn(async () => ({ ok: true as const })),
      finalizeAsset: vi.fn(async () => ({ ok: true as const, asset })),
    };
    let active: AssetLineageContext = { authLineage: 'user-a:0', authorityScopeId: 'scope-a' };
    const bridge = new DefaultAssetPersistenceBridge(repository, { imageReencoder: null, getActiveLineage: () => active, logFailure: vi.fn() });

    const resolution = bridge.resolve(asset, { authLineage: 'user-a:0', authorityScopeId: 'scope-a' });
    active = INVALIDATED_ASSET_LINEAGE;
    bridge.invalidateAuth(INVALIDATED_ASSET_LINEAGE.authLineage!);
    metadata.resolve({ ok: true, record: { ...asset, version: '1' as const, storageBucket: 'product-assets', storagePath: 'vnext/x/1.png', fileSize: 1, createdAt: '2026-10-16T00:00:00.000Z' } });

    expect(await resolution).toMatchObject({ ok: false, state: { status: 'unavailable', error: 'A sessão mudou. Abra o catálogo novamente.' } });
    expect(repository.createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('FR-41 opening a catalog does not wait for every photo', () => {
  it('waits at most a short moment for the photos, then goes on without them', async () => {
    vi.useFakeTimers();
    const slow = deferred<string>();
    const opened = settleWithin(slow.promise, OPEN_PHOTO_WAIT_MS);
    await vi.advanceTimersByTimeAsync(OPEN_PHOTO_WAIT_MS - 1);
    let settled = false;
    void opened.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(opened).resolves.toBeUndefined();
    slow.resolve('late');
  });

  it('uses the photos that arrived in time and passes on a failure', async () => {
    await expect(settleWithin(Promise.resolve('fotos'), OPEN_PHOTO_WAIT_MS)).resolves.toBe('fotos');
    await expect(settleWithin(Promise.reject(new Error('falhou')), OPEN_PHOTO_WAIT_MS)).rejects.toThrow('falhou');
    expect(OPEN_PHOTO_WAIT_MS).toBeLessThanOrEqual(1500);
  });
});
