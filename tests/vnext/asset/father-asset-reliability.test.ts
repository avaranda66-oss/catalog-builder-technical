import { describe, expect, it, vi } from 'vitest';
import { DefaultAssetPersistenceBridge, type AssetLineageContext, type AssetRecord, type AssetRepository } from '@/vnext/asset';
import type { AssetRef } from '@/vnext/domain';
import { sha256 } from '@/vnext/asset/integrity';
import { deferred, documentFixture } from '../persistence/w3h-fixtures';

async function fixture() {
  const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4c8AAAAASUVORK5CYII=', 'base64'));
  const asset: AssetRef = {
    id: 'a0000000-0000-4000-a000-000000000001', version: '1', sha256: await sha256(bytes),
    mime: 'image/png', widthPx: 1, heightPx: 1, name: 'foto.png', alt: 'Foto do produto',
  };
  const record: AssetRecord = {
    ...asset, version: '1', storageBucket: 'product-assets',
    storagePath: `vnext/${asset.id}/1.png`, fileSize: bytes.byteLength,
    createdAt: '2026-10-14T12:00:00.000Z',
  };
  const repository = {
    getAsset: vi.fn<AssetRepository['getAsset']>(async () => ({ ok: true, record })),
    createSignedUrl: vi.fn<AssetRepository['createSignedUrl']>(async () => ({ ok: true, signedUrl: 'https://storage.test/foto.png' })),
    uploadBytes: vi.fn<AssetRepository['uploadBytes']>(async () => ({ ok: true })),
    finalizeAsset: vi.fn<AssetRepository['finalizeAsset']>(async () => ({ ok: true, asset })),
  } satisfies AssetRepository;
  const fetchBytes = vi.fn(async () => bytes.slice().buffer);
  return { bytes, asset, repository, fetchBytes };
}

describe('FATHER-PERSISTENCE photo reliability', () => {
  it.each(['metadata', 'signed-url', 'bytes'] as const)('keeps the reference available for retry when %s transport throws', async (step) => {
    const state = await fixture();
    const error = new Error('Failed to fetch');
    if (step === 'metadata') state.repository.getAsset.mockRejectedValueOnce(error);
    if (step === 'signed-url') state.repository.createSignedUrl.mockRejectedValueOnce(error);
    if (step === 'bytes') state.fetchBytes.mockRejectedValueOnce(error);
    const bridge = new DefaultAssetPersistenceBridge(state.repository, { fetchBytes: state.fetchBytes });

    await expect(bridge.resolve(state.asset)).resolves.toMatchObject({
      ok: false, state: { status: 'unavailable', asset: state.asset },
    });
    await expect(bridge.resolve(state.asset)).resolves.toMatchObject({ ok: true });
  });

  it('reopens the document with one unavailable photo while retaining the other photos and authored content', async () => {
    const state = await fixture();
    const missing = { ...state.asset, id: 'a0000000-0000-4000-a000-000000000002' };
    state.repository.getAsset.mockRejectedValueOnce(new Error('Photo service unavailable'));
    const bridge = new DefaultAssetPersistenceBridge(state.repository, { fetchBytes: state.fetchBytes });
    const document = { ...documentFixture(), assets: [missing, state.asset] };
    const before = JSON.stringify(document);

    const resolved = await bridge.resolveDocumentAssets(document);
    expect(resolved.states.get(missing.id)?.status).toBe('unavailable');
    expect(resolved.states.get(state.asset.id)?.status).toBe('resolved');
    expect(resolved.urls.has(missing.id)).toBe(false);
    expect(resolved.urls.has(state.asset.id)).toBe(true);
    expect(JSON.stringify(document)).toBe(before);
  });

  it('does not reuse cached or in-flight verification for a divergent reference with the same id/version', async () => {
    const state = await fixture();
    const bridge = new DefaultAssetPersistenceBridge(state.repository, { fetchBytes: state.fetchBytes });
    const forged = { ...state.asset, sha256: '0'.repeat(64) };
    const [valid, invalid] = await Promise.all([bridge.resolve(state.asset), bridge.resolve(forged)]);
    expect(valid.ok).toBe(true);
    expect(invalid).toMatchObject({ ok: false, state: { status: 'integrity-failed' } });
    expect(await bridge.resolve(forged)).toMatchObject({ ok: false, state: { status: 'integrity-failed' } });
    expect(state.fetchBytes).toHaveBeenCalledTimes(1);
  });

  it.each(['authLineage', 'authorityScopeId'] as const)('discards an image completion when %s changes during byte fetch', async (field) => {
    const state = await fixture();
    let lineage: AssetLineageContext = { openSessionId: 'open-1', authLineage: 'a:0', authorityScopeId: 'a' };
    const started = deferred<void>();
    const pending = deferred<ArrayBuffer>();
    state.fetchBytes.mockImplementationOnce(() => { started.resolve(); return pending.promise; });
    const bridge = new DefaultAssetPersistenceBridge(state.repository, { fetchBytes: state.fetchBytes, getActiveLineage: () => lineage });
    const resolution = bridge.resolve(state.asset);
    await started.promise;
    lineage = { ...lineage, [field]: 'b' };
    pending.resolve(state.bytes.slice().buffer);
    expect(await resolution).toMatchObject({ ok: false, state: { status: 'unavailable' } });

    expect((await bridge.resolve(state.asset)).ok).toBe(true);
    expect(state.fetchBytes).toHaveBeenCalledTimes(2);
  });

  it('cannot repopulate a cleared cache from an earlier in-flight request after auth invalidation', async () => {
    const state = await fixture();
    const started = deferred<void>();
    const pending = deferred<ArrayBuffer>();
    state.fetchBytes.mockImplementationOnce(() => { started.resolve(); return pending.promise; });
    const bridge = new DefaultAssetPersistenceBridge(state.repository, { fetchBytes: state.fetchBytes });
    const resolution = bridge.resolve(state.asset);
    await started.promise;
    bridge.invalidateAuth('b:1');
    pending.resolve(state.bytes.slice().buffer);
    expect(await resolution).toMatchObject({ ok: false });
    expect((await bridge.resolve(state.asset)).ok).toBe(true);
    expect(state.fetchBytes).toHaveBeenCalledTimes(2);
  });
});
