import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetLineageContext, AssetResolutionResult, AssetRuntimeState } from '@/vnext/asset';
import type { AssetRef, CatalogDocument } from '@/vnext/domain';
import {
  AssetLoadingCoordinator,
  DEFAULT_ASSET_LOADING_CONCURRENCY,
  retryAssetLoad,
  type AssetResolver,
} from '@/vnext/persistence/asset-loading-coordinator';
import {
  StrictCasCatalogRepository,
  deferred,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
} from './w3h-fixtures';

function photo(index: number): AssetRef {
  return {
    id: `a0000000-0000-4000-a000-${String(index).padStart(12, '0')}`,
    version: '1', sha256: String(index % 10).repeat(64), mime: 'image/png',
    widthPx: 10, heightPx: 10, name: `foto-${index}.png`, alt: `Foto ${index}`,
  };
}

/** Page photos `used` (in that order) plus `leftovers` that only sit in the catalog photo list. */
function catalog(used: readonly AssetRef[], leftovers: readonly AssetRef[] = []): CatalogDocument {
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
    assets: [...leftovers, ...used],
  };
}

function resolved(asset: AssetRef, url = `blob:${asset.id}`): AssetResolutionResult {
  return { ok: true, state: { status: 'resolved', url, blobUrl: url, expiresAt: Date.now() + 3_600_000, asset } };
}

function failed(asset: AssetRef, status: 'offline' | 'unavailable' = 'unavailable'): AssetResolutionResult {
  return status === 'offline'
    ? { ok: false, state: { status, asset } }
    : { ok: false, state: { status, error: 'Foto não carregou', asset } };
}

/** A resolver whose answers the test gives one by one. */
function controlledResolver() {
  const waiting = new Map<string, Array<(result: AssetResolutionResult) => void>>();
  const resolve = vi.fn<AssetResolver>((asset) => new Promise<AssetResolutionResult>((done) => {
    waiting.set(asset.id, [...(waiting.get(asset.id) ?? []), done]);
  }));
  const answer = async (asset: AssetRef, result: AssetResolutionResult) => {
    const queue = waiting.get(asset.id) ?? [];
    const next = queue.shift();
    if (!next) throw new Error(`No download waiting for ${asset.id}`);
    next(result);
    await settleAsyncWork();
  };
  return { resolve, answer };
}

function openCatalog(document: CatalogDocument) {
  const repository = new StrictCasCatalogRepository(document);
  return runtimeFixture(repository, document, 900, { autosave: false });
}

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

function startLoader(runtime: ReturnType<typeof openCatalog>['runtime'], resolve: AssetResolver, isActive?: () => boolean) {
  const loader = new AssetLoadingCoordinator({ workspace: runtime.workspace, resolve, ...(isActive ? { isActive } : {}) });
  disposers.push(() => loader.dispose());
  loader.start();
  return loader;
}

describe('FR-41 photos load in the background after the catalog opens', () => {
  it('marks only the photos in use as "loading" and downloads at most 4 at a time', async () => {
    const used = [1, 2, 3, 4, 5, 6].map(photo);
    const leftover = photo(9);
    const { runtime } = openCatalog(catalog(used, [leftover]));
    const { resolve, answer } = controlledResolver();

    startLoader(runtime, resolve);
    await settleAsyncWork();

    const loading = runtime.workspace.getSnapshot().loadingAssetIds;
    expect([...loading].sort()).toEqual(used.map((asset) => asset.id).sort());
    expect(loading.has(leftover.id)).toBe(false);
    expect(DEFAULT_ASSET_LOADING_CONCURRENCY).toBe(4);
    expect(resolve).toHaveBeenCalledTimes(4);
    expect(resolve.mock.calls.map(([asset]) => asset.id)).toEqual(used.slice(0, 4).map((asset) => asset.id));

    await answer(used[0]!, resolved(used[0]!));
    const afterFirst = runtime.workspace.getSnapshot();
    expect(afterFirst.assetUrls.get(used[0]!.id)).toBe(`blob:${used[0]!.id}`);
    expect(afterFirst.assetRuntimeStates.get(used[0]!.id)?.status).toBe('resolved');
    expect(afterFirst.loadingAssetIds.has(used[0]!.id)).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(5);

    // Each finished download hands its place to the next photo waiting in line.
    for (const asset of used.slice(1)) await answer(asset, resolved(asset));
    expect(runtime.workspace.getSnapshot().loadingAssetIds.size).toBe(0);
    expect(resolve).toHaveBeenCalledTimes(6);
    expect(resolve.mock.calls.some(([asset]) => asset.id === leftover.id)).toBe(false);
  });

  it('keeps a failed photo as failed and does not download it again by itself after an edit', async () => {
    const broken = photo(1);
    const { runtime, session } = openCatalog(catalog([broken]));
    const { resolve, answer } = controlledResolver();
    startLoader(runtime, resolve);
    await settleAsyncWork();

    await answer(broken, failed(broken));
    expect(runtime.workspace.getSnapshot().assetRuntimeStates.get(broken.id)?.status).toBe('unavailable');

    expect(session.execute({ type: 'document.rename', title: 'Editado depois' }).ok).toBe(true);
    await settleAsyncWork();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(runtime.workspace.getSnapshot().loadingAssetIds.size).toBe(0);
  });

  it('installs nothing after the person lost access, and nothing new starts', async () => {
    const used = [1, 2].map(photo);
    const { runtime } = openCatalog(catalog(used));
    const { resolve, answer } = controlledResolver();
    let active = true;
    startLoader(runtime, resolve, () => active);
    await settleAsyncWork();

    active = false;
    await answer(used[0]!, resolved(used[0]!));
    expect(runtime.workspace.getSnapshot().assetUrls.has(used[0]!.id)).toBe(false);
  });

  it('tries "Sem conexão" and "Foto não carregou" again when the connection returns, never "Foto com problema"', async () => {
    const offline = photo(1);
    const working = photo(2);
    const droppedMidway = photo(3);
    const corrupt = photo(4);
    const { runtime } = openCatalog(catalog([offline, working, droppedMidway, corrupt]));
    const { resolve, answer } = controlledResolver();
    const loader = startLoader(runtime, resolve);
    await settleAsyncWork();
    await answer(offline, failed(offline, 'offline'));
    await answer(working, resolved(working));
    // The connection dropped during this download while the browser still said "online".
    await answer(droppedMidway, failed(droppedMidway, 'unavailable'));
    await answer(corrupt, { ok: false, state: { status: 'integrity-failed', code: 'SHA256_MISMATCH', message: 'x', asset: corrupt } });
    expect(resolve).toHaveBeenCalledTimes(4);

    const retried = loader.retryAfterReconnect();
    await settleAsyncWork();
    const retriedCalls = resolve.mock.calls.slice(4);
    expect(retriedCalls.map(([asset]) => asset.id).sort()).toEqual([offline.id, droppedMidway.id].sort());
    expect(retriedCalls.every(([, context]) => context.forceRefresh === true)).toBe(true);
    expect(runtime.workspace.getSnapshot().loadingAssetIds.has(offline.id)).toBe(true);
    expect(runtime.workspace.getSnapshot().loadingAssetIds.has(corrupt.id)).toBe(false);
    await answer(offline, resolved(offline));
    await answer(droppedMidway, resolved(droppedMidway));
    await retried;
    expect(runtime.workspace.getSnapshot().assetUrls.get(offline.id)).toBe(`blob:${offline.id}`);
    expect(runtime.workspace.getSnapshot().assetUrls.get(droppedMidway.id)).toBe(`blob:${droppedMidway.id}`);
    expect(runtime.workspace.getSnapshot().assetRuntimeStates.get(corrupt.id)?.status).toBe('integrity-failed');
  });
});

describe('FR-41 "Tentar novamente" on one photo', () => {
  it('downloads the photo again without the cached copy, shows "loading" meanwhile and installs the result', async () => {
    const broken = photo(1);
    const document = catalog([broken]);
    const failedState: AssetRuntimeState = { status: 'unavailable', error: 'Foto não carregou', asset: broken };
    const { runtime } = openCatalog(document);
    runtime.workspace.setAssetRuntimeState(broken.id, failedState);
    const pending = deferred<AssetResolutionResult>();
    const resolve = vi.fn<AssetResolver>(() => pending.promise);
    const context: AssetLineageContext = { authLineage: 'user-a:0', authorityScopeId: 'scope:user-a' };

    const retry = retryAssetLoad({ workspace: runtime.workspace, resolve, assetId: broken.id, context });
    expect(resolve).toHaveBeenCalledWith(broken, { ...context, forceRefresh: true });
    expect(runtime.workspace.getSnapshot().loadingAssetIds.has(broken.id)).toBe(true);
    expect(await retryAssetLoad({ workspace: runtime.workspace, resolve, assetId: broken.id })).toBeUndefined();
    expect(resolve).toHaveBeenCalledTimes(1);

    pending.resolve(resolved(broken, 'blob:fresh'));
    expect(await retry).toMatchObject({ status: 'resolved', url: 'blob:fresh' });
    const snapshot = runtime.workspace.getSnapshot();
    expect(snapshot.assetUrls.get(broken.id)).toBe('blob:fresh');
    expect(snapshot.loadingAssetIds.has(broken.id)).toBe(false);
  });

  it('turns a thrown error into a plain failure the person can try again', async () => {
    const broken = photo(1);
    const { runtime } = openCatalog(catalog([broken]));
    const resolve = vi.fn<AssetResolver>(async () => { throw new Error('boom'); });

    const state = await retryAssetLoad({ workspace: runtime.workspace, resolve, assetId: broken.id });

    expect(state).toMatchObject({ status: 'unavailable', error: 'Não foi possível carregar esta imagem. Tente novamente.' });
    expect(runtime.workspace.getSnapshot().loadingAssetIds.size).toBe(0);
  });

  it('does nothing for a photo that is not in the catalog', async () => {
    const { runtime } = openCatalog(catalog([photo(1)]));
    const resolve = vi.fn<AssetResolver>();
    expect(await retryAssetLoad({ workspace: runtime.workspace, resolve, assetId: 'missing' })).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
  });
});
