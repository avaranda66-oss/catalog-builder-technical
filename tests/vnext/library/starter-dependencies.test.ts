// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPersistenceBridge, AssetResolutionResult, AssetRef } from '@/vnext/asset';
import { CatalogLibraryService, createDefaultCatalogStarterRegistry } from '@/vnext/library';
import { DefaultStarterDependencyPreparer } from '@/vnext/library/starter-dependencies';
import { PRESYS_IMAGE_MANIFEST, PRESYS_STARTER, PRESYS_STARTER_ID } from '@/vnext/library/presys-ta25n-starter';
import { StrictCasCatalogRepository, documentFixture, idSequence, uuid } from '../persistence/w3h-fixtures';

const bytes = new Uint8Array(readFileSync('public/assets/presys/ta-25n-starter-v1.png'));
const asset: AssetRef = { ...PRESYS_STARTER.sourceDocument.assets[0], id: uuid(25) };
function setup(input = bytes) {
  const finalizeUpload = vi.fn(async () => ({ ok: true as const, asset }));
  const resolve = vi.fn(async (): Promise<AssetResolutionResult> => ({ ok: true, state: { status: 'resolved', asset, url: 'blob:durable-test', expiresAt: Date.now() + 60000 } }));
  const bridge = { finalizeUpload, resolve } as unknown as AssetPersistenceBridge;
  const fetchBytes = vi.fn(async () => input);
  const preparer = new DefaultStarterDependencyPreparer(bridge, fetchBytes);
  const repository = new StrictCasCatalogRepository(documentFixture(uuid(40000)));
  const createId = vi.fn(idSequence(1000));
  let active = 'A:1';
  const library = new CatalogLibraryService({ repository, applicationDependencies: { createId: idSequence(50000) }, createId,
    createMutationId: idSequence(60000), createOpenSessionId: idSequence(70000), authLineage: () => active,
    authorityScopeId: () => active === 'A:1' ? 'scope:A' : 'scope:B', starterRegistry: createDefaultCatalogStarterRegistry(), starterDependencies: preparer });
  return { finalizeUpload, resolve, fetchBytes, preparer, repository, createId, library, switchAuthority: () => { active = 'B:2'; } };
}

describe('PILOT.C.1 required dependencies', () => {
  it.each(['missing', 'hash', 'MIME', 'dimensions'] as const)('C1-04/15 rejects %s bytes before upload/IDs/CREATE', async kind => {
    const invalid = bytes.slice();
    if (kind === 'hash') invalid[invalid.length - 1] ^= 1;
    if (kind === 'MIME') invalid[0] = 0;
    if (kind === 'dimensions') new DataView(invalid.buffer).setUint32(16, 721);
    const f = setup(kind === 'missing' ? new Uint8Array() : invalid);
    expect(await f.library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false, error: { code: 'STARTER_DEPENDENCY_UNAVAILABLE' } });
    expect(f.repository.createCatalog).not.toHaveBeenCalled(); expect(f.createId).not.toHaveBeenCalled();
    expect(f.finalizeUpload).not.toHaveBeenCalled();
  });

  it.each(['hash', 'MIME', 'dimensions', 'identity', 'version'] as const)('C1-04/15 rejects finalized %s mismatch before CREATE', async kind => {
    const f = setup();
    const changed = { ...asset, ...(kind === 'hash' ? { sha256: '0'.repeat(64) } : kind === 'MIME' ? { mime: 'image/jpeg' as const }
      : kind === 'dimensions' ? { widthPx: 1 } : kind === 'identity' ? { id: PRESYS_IMAGE_MANIFEST.seedAssetId } : { version: '2' }) };
    f.finalizeUpload.mockResolvedValue({ ok: true, asset: changed });
    expect(await f.library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false, error: { code: 'STARTER_DEPENDENCY_UNAVAILABLE' } });
    expect(f.repository.createCatalog).not.toHaveBeenCalled(); expect(f.createId).not.toHaveBeenCalled();
  });

  it('C1-04/13/15 finalized upload without resolution fails closed and retry resolves same asset without upload', async () => {
    const f = setup();
    f.resolve.mockResolvedValueOnce({ ok: false, state: { status: 'unavailable', asset, error: 'Unavailable' } });
    expect(await f.library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false, error: { code: 'STARTER_DEPENDENCY_UNAVAILABLE' } });
    expect(f.repository.createCatalog).not.toHaveBeenCalled();
    expect((await f.library.createFromStarter(PRESYS_STARTER_ID)).ok).toBe(true);
    expect(f.finalizeUpload).toHaveBeenCalledTimes(1); expect(f.fetchBytes).toHaveBeenCalledTimes(1);
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
  });

  it('C1-15 a resolved runtime state with divergent metadata is rejected', async () => {
    const f = setup();
    f.resolve.mockResolvedValueOnce({ ok: true, state: { status: 'resolved', url: 'blob:test', expiresAt: 1, asset: { ...asset, heightPx: 1 } } });
    expect(await f.library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false });
    expect(f.repository.createCatalog).not.toHaveBeenCalled();
  });

  it('C1-13 pending blank create is reconciled before official manifest preparation', async () => {
    const f = setup();
    f.repository.ambiguousCreateOnce = true;
    f.repository.getOverride = async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    expect(await f.library.createBlank('Pending blank')).toMatchObject({ ok: false });
    const first = f.repository.createCatalog.mock.calls[0][0];
    const resumed = await f.library.createFromStarter(PRESYS_STARTER_ID);
    expect(resumed.ok && resumed.value.catalogId).toBe(first.documentSnapshot.id);
    expect(f.fetchBytes).not.toHaveBeenCalled(); expect(f.finalizeUpload).not.toHaveBeenCalled();
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
  });

  it('C1-14 authority loss after durable finalization prevents resolution and CREATE', async () => {
    const f = setup();
    f.finalizeUpload.mockImplementationOnce(async () => { f.switchAuthority(); return { ok: true, asset }; });
    expect(await f.library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(f.resolve).not.toHaveBeenCalled(); expect(f.repository.createCatalog).not.toHaveBeenCalled(); expect(f.createId).not.toHaveBeenCalled();
  });

  it('C1-14 authority loss after resolution prevents clone and CREATE', async () => {
    const f = setup();
    f.resolve.mockImplementationOnce(async () => { f.switchAuthority(); return { ok: true, state: { status: 'resolved', url: 'blob:test', expiresAt: 1, asset } }; });
    expect(await f.library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(f.repository.createCatalog).not.toHaveBeenCalled(); expect(f.createId).not.toHaveBeenCalled();
  });

  it('C1-04 required starter cannot bypass dependencies when service composition omits the preparer', async () => {
    const f = setup();
    const library = new CatalogLibraryService({ repository: f.repository, applicationDependencies: { createId: idSequence(1) }, createId: f.createId,
      createMutationId: idSequence(6000), createOpenSessionId: idSequence(7000), authLineage: () => 'A', authorityScopeId: () => 'scope:A', starterRegistry: createDefaultCatalogStarterRegistry() });
    expect(await library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false, error: { code: 'STARTER_DEPENDENCY_UNAVAILABLE' } });
    expect(f.repository.createCatalog).not.toHaveBeenCalled();
  });
});
