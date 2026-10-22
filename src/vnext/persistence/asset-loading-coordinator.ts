import type { AssetLineageContext, AssetResolutionResult, AssetRuntimeState } from '../asset/contracts';
import { referencedAssetIds } from '../asset/referenced-assets';
import type { AssetRef, CatalogDocument } from '../domain';
import type { PersistenceWorkspace } from './workspace';

/** Downloads and checks one photo; `forceRefresh` skips any cached copy (used by "Tentar novamente"). */
export type AssetResolver = (
  asset: AssetRef,
  context: AssetLineageContext & { readonly forceRefresh?: boolean }
) => Promise<AssetResolutionResult>;

export const DEFAULT_ASSET_LOADING_CONCURRENCY = 4;

const LOAD_FAILED_MESSAGE = 'Não foi possível carregar esta imagem. Tente novamente.';

function activeLineage(workspace: PersistenceWorkspace): AssetLineageContext {
  const snapshot = workspace.getSnapshot();
  return {
    authLineage: snapshot.binding.authLineage,
    authorityScopeId: snapshot.activeAuthorityScopeId,
    openSessionId: snapshot.binding.openSessionId,
    catalogId: snapshot.binding.kind === 'PERSISTED' ? snapshot.binding.catalogId : undefined,
  };
}

async function resolveSafely(
  resolve: AssetResolver,
  asset: AssetRef,
  context: AssetLineageContext & { readonly forceRefresh?: boolean }
): Promise<AssetRuntimeState> {
  try {
    return (await resolve(asset, context)).state;
  } catch {
    return { status: 'unavailable', error: LOAD_FAILED_MESSAGE, asset };
  }
}

/**
 * FR-41 "Tentar novamente": downloads one photo again, skipping cached copies, and installs the
 * result only if the same catalog session is still open. Returns undefined when nothing changed
 * (the photo is not in the catalog, it is already loading, or the session changed meanwhile).
 */
export async function retryAssetLoad(input: {
  readonly workspace: PersistenceWorkspace;
  readonly resolve: AssetResolver;
  readonly assetId: string;
  readonly context?: AssetLineageContext;
}): Promise<AssetRuntimeState | undefined> {
  const { workspace } = input;
  const before = workspace.getSnapshot();
  const asset = before.session.getSnapshot().document.assets.find((candidate) => candidate.id === input.assetId);
  if (!asset || before.loadingAssetIds.has(asset.id)) return undefined;
  const openSessionId = before.binding.openSessionId;
  workspace.markAssetsLoading([asset.id]);
  const state = await resolveSafely(input.resolve, asset, {
    ...(input.context ?? activeLineage(workspace)),
    forceRefresh: true,
  });
  if (workspace.getSnapshot().binding.openSessionId !== openSessionId) return undefined;
  return workspace.settleAssetLoad(asset.id, state) ? state : undefined;
}

export interface AssetLoadingCoordinatorOptions {
  readonly workspace: PersistenceWorkspace;
  readonly resolve: AssetResolver;
  /** Lineage sent with every download. Default: the open session's lineage. */
  readonly getContext?: () => AssetLineageContext;
  /** Downloads started at once. Default 4. */
  readonly concurrency?: number;
  /** False after the person lost access: nothing new starts and nothing is installed. */
  readonly isActive?: () => boolean;
}

/**
 * FR-41: the catalog opens before its photos. Each photo in use (pages, groups and table cells)
 * that has no picture yet is marked "loading" and downloaded in the background, at most 4 at a
 * time, and appears as soon as it arrives. Photos only listed in the catalog are not downloaded
 * until they are used. A photo that fails keeps its failure state until "Tentar novamente" or until
 * the connection returns (retryAfterReconnect).
 */
export class AssetLoadingCoordinator {
  private readonly concurrency: number;
  private unsubscribe: (() => void) | undefined;
  private scanQueued = false;
  private lastSessionKey: string | undefined;
  private lastDocument: CatalogDocument | undefined;
  private generation = 0;
  private readonly queue: AssetRef[] = [];
  private readonly queued = new Set<string>();
  private active = 0;
  private disposed = false;

  constructor(private readonly options: AssetLoadingCoordinatorOptions) {
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_ASSET_LOADING_CONCURRENCY);
  }

  start(): void {
    if (this.unsubscribe || this.disposed) return;
    // Scans run after the current change finishes, so photos installed right after an edit
    // (an upload or a reused PRESYS page) are not downloaded a second time.
    this.unsubscribe = this.options.workspace.subscribe(() => this.requestScan());
    this.requestScan();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.queue.length = 0;
    this.queued.clear();
  }

  /**
   * When the connection returns, photos in use that did not load are tried again: "Sem conexão"
   * and also "Foto não carregou", because the connection may have dropped in the middle of a
   * download while the browser still said it was online. "Foto com problema" (the bytes do not
   * match) is never retried: downloading it again gives the same bytes.
   */
  retryAfterReconnect(): Promise<void> {
    const snapshot = this.options.workspace.getSnapshot();
    const used = referencedAssetIds(snapshot.session.getSnapshot().document);
    const failed = [...snapshot.assetRuntimeStates.entries()]
      .filter(([assetId, state]) => (state.status === 'offline' || state.status === 'unavailable') && used.has(assetId))
      .map(([assetId]) => assetId);
    return Promise.all(failed.map((assetId) => this.retry(assetId))).then(() => undefined);
  }

  retry(assetId: string): Promise<AssetRuntimeState | undefined> {
    if (!this.isActive()) return Promise.resolve(undefined);
    return retryAssetLoad({
      workspace: this.options.workspace,
      resolve: this.options.resolve,
      assetId,
      context: this.context(),
    });
  }

  private isActive(): boolean {
    return !this.disposed && (this.options.isActive?.() ?? true);
  }

  private context(): AssetLineageContext {
    return this.options.getContext?.() ?? activeLineage(this.options.workspace);
  }

  private requestScan(): void {
    if (this.scanQueued || this.disposed) return;
    this.scanQueued = true;
    void Promise.resolve().then(() => {
      this.scanQueued = false;
      this.scan();
    });
  }

  private scan(): void {
    if (!this.isActive()) return;
    const snapshot = this.options.workspace.getSnapshot();
    const sessionKey = JSON.stringify([
      snapshot.binding.openSessionId,
      snapshot.binding.authLineage,
      snapshot.activeAuthorityScopeId,
    ]);
    if (sessionKey !== this.lastSessionKey) {
      // Another catalog or session: results still on their way belong to the previous one.
      this.lastSessionKey = sessionKey;
      this.lastDocument = undefined;
      this.generation += 1;
      this.queue.length = 0;
      this.queued.clear();
    }
    const document = snapshot.session.getSnapshot().document;
    if (document === this.lastDocument) return;
    this.lastDocument = document;

    const used = referencedAssetIds(document);
    const missing = document.assets.filter((asset) => used.has(asset.id)
      && !snapshot.assetUrls.has(asset.id)
      && !snapshot.assetRuntimeStates.has(asset.id)
      && !snapshot.loadingAssetIds.has(asset.id)
      && !this.queued.has(asset.id));
    if (missing.length === 0) return;
    for (const asset of missing) {
      this.queued.add(asset.id);
      this.queue.push(asset);
    }
    this.options.workspace.markAssetsLoading(missing.map((asset) => asset.id));
    this.pump();
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0 && this.isActive()) {
      const asset = this.queue.shift()!;
      const generation = this.generation;
      this.active += 1;
      void this.load(asset, generation).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async load(asset: AssetRef, generation: number): Promise<void> {
    const state = await resolveSafely(this.options.resolve, asset, this.context());
    if (generation !== this.generation || !this.isActive()) return;
    this.queued.delete(asset.id);
    this.options.workspace.settleAssetLoad(asset.id, state);
  }
}
