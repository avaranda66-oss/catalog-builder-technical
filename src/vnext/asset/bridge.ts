import type { AssetRef, CatalogDocument } from '../domain/editorial-model';
import type {
  AssetFinalizationResult,
  AssetLineageContext,
  AssetPersistenceBridge,
  AssetRepository,
  AssetResolutionResult,
  AssetRuntimeState,
  AssetUploadInput,
  AssetUploadParams,
  AssetUploadResult,
} from './contracts';
import { sha256, verifyAssetBytes, type AssetIntegrityResult } from './integrity';
import { createBrowserImageReencoder, normalizeImageForUpload, type ImageReencoder } from './normalize-image';
import { referencedAssetIds } from './referenced-assets';
import type { SupportedImageMime } from './sniff';

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface CachedUrlEntry {
  readonly signedUrl: string;
  readonly blobUrl?: string;
  readonly expiresAt: number;
  readonly asset: AssetRef;
}

export interface DefaultAssetPersistenceBridgeOptions {
  /** Downloads the photo bytes; `signal` aborts the download when it takes too long. */
  readonly fetchBytes?: (url: string, signal?: AbortSignal) => Promise<ArrayBuffer>;
  /** FR-45: true when the browser says there is no connection (`navigator.onLine === false`). */
  readonly isOffline?: () => boolean;
  readonly getActiveLineage?: () => AssetLineageContext;
  /** FR-41: photos downloaded and checked at the same time. Default 4. */
  readonly maxConcurrentDownloads?: number;
  /**
   * FR-41: a photo whose download takes longer than this (ms) is reported as not loaded and its
   * download slot is handed on, so one stuck request never blocks the other photos or "Tentar
   * novamente". Default 30 s.
   */
  readonly downloadTimeoutMs?: number;
  /** FR-45: receives a short, sanitized code when a photo could not be loaded (never a URL or message). */
  readonly logFailure?: (code: string) => void;
  /**
   * Re-encodes rotated (EXIF) or oversized photos before hashing. Omit to use the browser
   * re-encoder when available; pass null to keep every upload's original bytes.
   */
  readonly imageReencoder?: ImageReencoder | null;
}

interface PendingFinalizationAttempt {
  readonly assetId: string;
  readonly version: string;
  readonly sha256: string;
  readonly mime: SupportedImageMime;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly name: string;
  readonly alt: string;
  readonly fileSize: number;
  readonly storagePath: string;
}

export const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 4;
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;

/** A photo download that took longer than `downloadTimeoutMs`. Its code is what the log keeps. */
class AssetDownloadTimeout extends Error {
  readonly code = 'TIMEOUT';
  constructor() {
    super('Photo download timed out');
    this.name = 'AssetDownloadTimeout';
  }
}

/**
 * Runs `task` with an abort signal and rejects with AssetDownloadTimeout after `timeoutMs`.
 * The task may still finish later; its result is then ignored.
 */
async function withDownloadTimeout<T>(timeoutMs: number, task: (signal?: AbortSignal) => Promise<T>): Promise<T> {
  const abort = typeof AbortController === 'undefined' ? undefined : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort();
      reject(new AssetDownloadTimeout());
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(abort?.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** At most `max` tasks run at once; the others wait in order. A finished task hands its slot on. */
class ConcurrencyLimit {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active += 1;
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

const SAFE_ERROR_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/**
 * FR-45: a code that is safe to log. Error messages can carry signed URLs, tokens or file names,
 * so only an explicit `code` or the error class name ("TypeError") is kept.
 */
export function sanitizedAssetErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && SAFE_ERROR_CODE.test(code)) return code;
  }
  if (error instanceof Error && SAFE_ERROR_CODE.test(error.name)) return error.name;
  return 'UNKNOWN';
}

function defaultLogFailure(code: string): void {
  console.warn('[vnext asset] photo could not be loaded', { code });
}

export function isTransportAmbiguousCode(code?: string | null): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  return (
    upper === 'AMBIGUOUS_COMMIT_OUTCOME' ||
    upper === 'AMBIGUOUS' ||
    upper === 'REMOTE_FAILURE' ||
    upper === 'TIMEOUT' ||
    upper === 'ETIMEDOUT' ||
    upper === 'NETWORK_ERROR' ||
    upper === 'FETCH_ERROR' ||
    upper === 'ECONNRESET' ||
    upper === 'UND_ERR_CONNECT_TIMEOUT'
  );
}

export function isTransportAmbiguousError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && isTransportAmbiguousCode(code)) return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('timedout') ||
      msg.includes('etimedout') ||
      msg.includes('failed to fetch') ||
      msg.includes('connection')
    );
  }
  return false;
}

function isLineageStale(before?: AssetLineageContext, current?: AssetLineageContext): boolean {
  if (!before || !current) return false;
  // FR-45: an empty lineage after a real one means the authority was lost; it is never "unknown".
  if (
    before.authLineage !== undefined
    && current.authLineage !== undefined
    && before.authLineage !== current.authLineage
  ) {
    return true;
  }
  if (
    before.authorityScopeId &&
    current.authorityScopeId &&
    before.authorityScopeId !== current.authorityScopeId
  ) {
    return true;
  }
  if (
    before.openSessionId &&
    current.openSessionId &&
    before.openSessionId !== current.openSessionId
  ) {
    return true;
  }
  if (before.catalogId && current.catalogId && before.catalogId !== current.catalogId) {
    return true;
  }
  return false;
}

export class DefaultAssetPersistenceBridge implements AssetPersistenceBridge {
  private readonly repository: AssetRepository;
  private readonly options: DefaultAssetPersistenceBridgeOptions;
  private readonly cache = new Map<string, CachedUrlEntry>();
  private readonly inFlight = new Map<string, Promise<AssetResolutionResult>>();
  private readonly activeBlobUrls = new Set<string>();
  private currentAuthLineage?: string;
  private resolutionGeneration = 0;
  private pendingFinalization?: PendingFinalizationAttempt;
  private readonly imageReencoder?: ImageReencoder;
  private readonly downloads: ConcurrencyLimit;

  constructor(repository: AssetRepository, options: DefaultAssetPersistenceBridgeOptions = {}) {
    this.repository = repository;
    this.options = options;
    this.downloads = new ConcurrencyLimit(Math.max(1, options.maxConcurrentDownloads ?? DEFAULT_MAX_CONCURRENT_DOWNLOADS));
    this.imageReencoder = options.imageReencoder === undefined
      ? createBrowserImageReencoder()
      : options.imageReencoder ?? undefined;
  }

  async finalizeUpload(
    input: AssetUploadInput,
    context?: AssetLineageContext
  ): Promise<AssetFinalizationResult> {
    if (this.options.isOffline?.()) {
      return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
    }

    const originalBytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    const lineageBefore = context ?? this.options.getActiveLineage?.();

    // 1-2. Sniff MIME, normalize rotated/oversized photos, and measure the final bytes.
    // HEIC gets its own code so the editor can explain how to send a JPEG instead.
    const normalized = await normalizeImageForUpload(originalBytes, {
      reencoder: this.imageReencoder,
      fileName: input.name,
    });
    if (!normalized.ok) {
      return { ok: false, error: { code: normalized.code, message: normalized.message } };
    }
    if (isLineageStale(lineageBefore, this.options.getActiveLineage?.())) {
      return {
        ok: false,
        error: { code: 'STALE_RESULT', message: 'Lineage or authority changed while preparing the image' },
      };
    }
    const bytes = normalized.bytes;
    const mime = normalized.mime;
    const dimensions = { widthPx: normalized.widthPx, heightPx: normalized.heightPx };

    // 3. Compute SHA-256 of the final bytes
    const hash = await sha256(bytes);

    if (input.version !== undefined && input.version !== '1') {
      return {
        ok: false,
        error: { code: 'INVALID_VERSION', message: 'W3.G accepts only version "1"' },
      };
    }
    const version = '1';

    const name = input.name.trim() || 'imagem';
    const alt = (input.alt && input.alt.trim()) || name;

    // Reconcile pending finalization if exists (Point 5 & 6)
    if (this.pendingFinalization) {
      const pending = this.pendingFinalization;
      const isSameLogicalAttempt =
        pending.sha256 === hash &&
        pending.mime === mime &&
        pending.widthPx === dimensions.widthPx &&
        pending.heightPx === dimensions.heightPx &&
        pending.name === name &&
        pending.alt === alt &&
        pending.version === version &&
        (input.assetId === undefined || input.assetId === pending.assetId);

      const reconciled = await this.reconcilePendingAttempt(pending);

      if (!reconciled.ok) {
        if (reconciled.error.code === 'AMBIGUOUS_COMMIT_OUTCOME') {
          // Rule A: pending attempt remains unresolved. Block allocation of new identity and return AMBIGUOUS_COMMIT_OUTCOME
          return reconciled;
        }
        if (reconciled.error.code === 'CONFLICT') {
          this.pendingFinalization = undefined;
          return reconciled;
        }
        return reconciled;
      }

      // Reconciled successfully!
      if (isSameLogicalAttempt) {
        // Rule B: current invocation is the same logical attempt. Return reconciled exact AssetRef.
        this.pendingFinalization = undefined;
        return reconciled;
      }

      // Rule C: current invocation is a different logical upload. Clear resolved pending attempt and continue normally.
      this.pendingFinalization = undefined;
    }

    // 4. Determine canonical asset UUID
    const assetId =
      input.assetId && CANONICAL_UUID_PATTERN.test(input.assetId)
        ? input.assetId
        : (globalThis.crypto?.randomUUID?.() ?? '');

    if (!assetId || !CANONICAL_UUID_PATTERN.test(assetId)) {
      return {
        ok: false,
        error: { code: 'INVALID_ASSET_ID', message: 'Could not allocate valid canonical lowercase UUID for asset' },
      };
    }

    const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpeg';
    const storagePath = `vnext/${assetId}/1.${extension}`;

    // 5. Lineage was captured before normalization (Point 10)

    // 6. Upload binary bytes to immutable storage path
    const uploadResult = await this.repository.uploadBytes(storagePath, bytes, mime);
    if (!uploadResult.ok) {
      return {
        ok: false,
        error: { code: 'UPLOAD_FAILED', message: uploadResult.error ?? 'Upload to storage failed' },
      };
    }

    // 7. Check lineage before finalization (Point 10)
    const currentLineage = this.options.getActiveLineage?.();
    if (isLineageStale(lineageBefore, currentLineage)) {
      return {
        ok: false,
        error: { code: 'STALE_RESULT', message: 'Lineage or authority changed during asset upload' },
      };
    }

    // 8. Finalize metadata atomically via RPC with ambiguous outcome reconciliation
    const finalizationParams: PendingFinalizationAttempt = {
      assetId,
      version,
      sha256: hash,
      mime,
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      name,
      alt,
      fileSize: bytes.byteLength,
      storagePath,
    };

    let finalizationResult: AssetFinalizationResult;
    try {
      finalizationResult = await this.repository.finalizeAsset(finalizationParams);
    } catch (err) {
      if (isTransportAmbiguousError(err)) {
        finalizationResult = await this.reconcilePendingAttempt(finalizationParams);
      } else {
        return {
          ok: false,
          error: {
            code: 'REMOTE_FAILURE',
            message: err instanceof Error ? err.message : 'Finalization failed',
          },
        };
      }
    }

    if (!finalizationResult.ok && isTransportAmbiguousCode(finalizationResult.error.code)) {
      finalizationResult = await this.reconcilePendingAttempt(finalizationParams);
    }

    if (!finalizationResult.ok && finalizationResult.error.code === 'AMBIGUOUS_COMMIT_OUTCOME') {
      this.pendingFinalization = finalizationParams;
      return finalizationResult;
    } else if (finalizationResult.ok) {
      this.pendingFinalization = undefined;
    }

    // 9. Check lineage after finalization (Point 10)
    const postFinalizeLineage = this.options.getActiveLineage?.();
    if (isLineageStale(lineageBefore, postFinalizeLineage)) {
      return {
        ok: false,
        error: { code: 'STALE_RESULT', message: 'Lineage or authority changed during asset finalization' },
      };
    }

    return finalizationResult;
  }

  private async reconcilePendingAttempt(
    params: PendingFinalizationAttempt
  ): Promise<AssetFinalizationResult> {
    let check;
    try {
      check = await this.repository.getAsset(params.assetId, params.version);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'AMBIGUOUS_COMMIT_OUTCOME',
          message:
            err instanceof Error
              ? `Reconciliation transport failed: ${err.message}`
              : 'Finalization transport failed and reconciliation is unavailable',
        },
      };
    }

    if (!check.ok) {
      return {
        ok: false,
        error: {
          code: 'AMBIGUOUS_COMMIT_OUTCOME',
          message: 'Finalization transport failed and state could not be verified',
        },
      };
    }

    if (check.record === null) {
      // Authoritative NOT_FOUND: metadata did not commit. Replay finalization with SAME attempt
      let replayResult: AssetFinalizationResult;
      try {
        replayResult = await this.repository.finalizeAsset(params);
      } catch (err) {
        if (isTransportAmbiguousError(err)) {
          return {
            ok: false,
            error: {
              code: 'AMBIGUOUS_COMMIT_OUTCOME',
              message: 'Replay finalization transport failed; preserving attempt for reconciliation',
            },
          };
        }
        return {
          ok: false,
          error: {
            code: 'REMOTE_FAILURE',
            message: err instanceof Error ? err.message : 'Replay finalization failed',
          },
        };
      }

      if (!replayResult.ok && isTransportAmbiguousCode(replayResult.error.code)) {
        return {
          ok: false,
          error: {
            code: 'AMBIGUOUS_COMMIT_OUTCOME',
            message: 'Replay finalization returned ambiguous outcome; preserving attempt',
          },
        };
      }

      return replayResult;
    }

    // Durable record exists: verify exact equality
    const r = check.record;
    const matches =
      r.id === params.assetId &&
      r.version === params.version &&
      r.sha256 === params.sha256 &&
      r.mime === params.mime &&
      r.widthPx === params.widthPx &&
      r.heightPx === params.heightPx &&
      r.name === params.name &&
      r.alt === params.alt &&
      r.fileSize === params.fileSize &&
      r.storagePath === params.storagePath;

    if (matches) {
      return {
        ok: true,
        asset: {
          id: params.assetId,
          version: '1',
          sha256: params.sha256,
          mime: params.mime,
          widthPx: params.widthPx,
          heightPx: params.heightPx,
          name: params.name,
          alt: params.alt,
        },
      };
    } else {
      return {
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Durable asset exists with divergent metadata',
        },
      };
    }
  }

  async resolve(
    asset: AssetRef,
    context?: AssetLineageContext & { forceRefresh?: boolean }
  ): Promise<AssetResolutionResult> {
    if (this.options.isOffline?.()) {
      return {
        ok: false,
        state: { status: 'offline', asset },
      };
    }

    const lineageBefore = context ?? this.options.getActiveLineage?.();
    const generation = this.resolutionGeneration;
    const isCurrent = () => generation === this.resolutionGeneration
      && !isLineageStale(lineageBefore, this.options.getActiveLineage?.());
    const staleResult = (): AssetResolutionResult => ({
      ok: false,
      state: { status: 'unavailable', error: 'A sessão mudou. Abra o catálogo novamente.', asset },
    });
    if (!isCurrent()) return staleResult();

    // Cached bytes and in-flight work are valid only for the exact reference and authority.
    const cacheKey = JSON.stringify([
      generation, lineageBefore?.authLineage, lineageBefore?.authorityScopeId,
      lineageBefore?.openSessionId, lineageBefore?.catalogId,
      asset.id, asset.version, asset.sha256, asset.mime, asset.widthPx, asset.heightPx,
      asset.name, asset.alt,
    ]);
    const now = Date.now();

    // 1. Return cached entry if still valid (TTL > 60s remaining)
    if (!context?.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > now + 60_000) {
        return {
          ok: true,
          state: {
            status: 'resolved',
            url: cached.blobUrl ?? cached.signedUrl,
            blobUrl: cached.blobUrl,
            expiresAt: cached.expiresAt,
            asset,
          },
        };
      }
    }

    // 2. Single-flight request deduplication
    const activeFlight = this.inFlight.get(cacheKey);
    if (activeFlight) return await activeFlight;

    const download = async (signal?: AbortSignal): Promise<AssetResolutionResult> => {
        // Fetch durable asset record
        const recordResult = await this.repository.getAsset(asset.id, asset.version);
        if (!isCurrent()) return staleResult();
        if (!recordResult.ok) {
          return {
            ok: false,
            state: {
              status: 'unavailable',
              error: recordResult.error.message,
              asset,
            },
          };
        }

        const record = recordResult.record;
        if (!record) {
          return {
            ok: false,
            state: {
              status: 'unavailable',
              error: `Asset ${asset.id} version ${asset.version} not found in remote repository`,
              asset,
            },
          };
        }

        // Verify all durable metadata matches canonical AssetRef (Point 8)
        const expectedExtension =
          asset.mime === 'image/png' ? 'png' : asset.mime === 'image/webp' ? 'webp' : 'jpeg';
        const expectedPath = `vnext/${asset.id}/${asset.version}.${expectedExtension}`;
        const isCompatiblePath =
          record.storagePath === expectedPath ||
          (asset.mime === 'image/jpeg' && record.storagePath === `vnext/${asset.id}/${asset.version}.jpg`);

        if (
          record.id !== asset.id ||
          record.version !== asset.version ||
          record.sha256 !== asset.sha256 ||
          record.mime !== asset.mime ||
          record.widthPx !== asset.widthPx ||
          record.heightPx !== asset.heightPx ||
          record.name !== asset.name ||
          record.alt !== asset.alt ||
          !isCompatiblePath
        ) {
          return {
            ok: false,
            state: {
              status: 'integrity-failed',
              code: 'DURABLE_METADATA_MISMATCH',
              message: `Durable metadata mismatch for asset ${asset.id}`,
              asset,
            },
          };
        }

        // Request ephemeral signed URL (1 hour validity)
        const signedUrlResult = await this.repository.createSignedUrl(record.storagePath, 3600);
        if (!isCurrent()) return staleResult();
        if (!signedUrlResult.ok || !signedUrlResult.signedUrl) {
          return {
            ok: false,
            state: {
              status: 'unavailable',
              error: signedUrlResult.error ?? 'Could not create signed URL',
              asset,
            },
          };
        }

        const signedUrl = signedUrlResult.signedUrl;

        // Fetch bytes to verify byte integrity
        let bytes: ArrayBuffer;
        if (this.options.fetchBytes) {
          bytes = await this.options.fetchBytes(signedUrl, signal);
        } else if (typeof fetch !== 'undefined') {
          const res = await fetch(signedUrl, { cache: 'no-store', ...(signal ? { signal } : {}) });
          if (!res.ok) {
            return {
              ok: false,
              state: {
                status: 'unavailable',
                error: `HTTP error ${res.status} fetching asset bytes`,
                asset,
              },
            };
          }
          bytes = await res.arrayBuffer();
        } else {
          return {
            ok: false,
            state: {
              status: 'unavailable',
              error: 'Byte fetch transport unavailable in current environment',
              asset,
            },
          };
        }

        // Verify byte-level integrity
        const verification = await verifyAssetBytes(asset, bytes);
        if (!verification.ok) {
          return {
            ok: false,
            state: {
              status: 'integrity-failed',
              code: verification.code,
              message: verification.message,
              asset,
            },
          };
        }

        // Check for stale completion across lineage
        if (!isCurrent()) return staleResult();

        let blobUrl: string | undefined;
        if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
          try {
            blobUrl = URL.createObjectURL(new Blob([bytes], { type: asset.mime }));
            this.activeBlobUrls.add(blobUrl);
          } catch {
            blobUrl = undefined;
          }
        }

        const expiresAt = Date.now() + 50 * 60 * 1000;
        this.cache.set(cacheKey, {
          signedUrl,
          blobUrl,
          expiresAt,
          asset,
        });

        return {
          ok: true,
          state: {
            status: 'resolved',
            url: blobUrl ?? signedUrl,
            blobUrl,
            expiresAt,
            asset,
          },
        };
    };

    const resolutionPromise = (async (): Promise<AssetResolutionResult> => {
      try {
        // FR-41: at most 4 photos are downloaded and checked at the same time, and a stuck
        // download gives its slot back after the time limit (it then counts as not loaded).
        return await this.downloads.run(async () => (isCurrent()
          ? withDownloadTimeout(this.options.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS, download)
          : staleResult()));
      } catch (error) {
        // A failed photo transport must not prevent the catalog from reopening.
        // Keep the canonical reference so the user can retry without uploading again.
        // FR-45: say why in the console, with a sanitized code only.
        (this.options.logFailure ?? defaultLogFailure)(sanitizedAssetErrorCode(error));
        return {
          ok: false,
          state: this.options.isOffline?.()
            ? { status: 'offline', asset }
            : { status: 'unavailable', error: 'Não foi possível carregar esta imagem. Tente novamente.', asset },
        };
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, resolutionPromise);
    return await resolutionPromise;
  }

  async verify(asset: AssetRef, bytes: ArrayBuffer | Uint8Array): Promise<AssetIntegrityResult> {
    return verifyAssetBytes(asset, bytes);
  }

  async resolveDocumentAssets(
    doc: CatalogDocument,
    context?: AssetLineageContext,
    options: { readonly onlyUsed?: boolean } = {}
  ): Promise<{ urls: Map<string, string>; states: Map<string, AssetRuntimeState> }> {
    const urls = new Map<string, string>();
    const states = new Map<string, AssetRuntimeState>();
    // Photos placed on pages or in table cells come first. Unless `onlyUsed`, the others are
    // resolved too, because "Imagem do catálogo" can reuse them; their failures never block the PDF.
    // FR-41: they are requested together; the download limit keeps at most 4 running.
    const used = referencedAssetIds(doc);
    const ordered = [
      ...doc.assets.filter((asset) => used.has(asset.id)),
      ...(options.onlyUsed ? [] : doc.assets.filter((asset) => !used.has(asset.id))),
    ];

    const results = await Promise.all(ordered.map((asset) => this.resolve(asset, context)));
    ordered.forEach((asset, index) => {
      const result = results[index]!;
      states.set(asset.id, result.state);
      if (result.ok && result.state.status === 'resolved') {
        urls.set(asset.id, result.state.url);
      }
    });

    return { urls, states };
  }

  async resolveDocument(
    doc: CatalogDocument,
    context?: AssetLineageContext
  ): Promise<Map<string, AssetRuntimeState>> {
    const res = await this.resolveDocumentAssets(doc, context);
    return res.states;
  }

  async upload(params: AssetUploadParams): Promise<AssetUploadResult> {
    const lineageBefore = params.context ?? this.options.getActiveLineage?.();
    const name = (params.name ?? params.filename ?? 'imagem').trim() || 'imagem';
    const alt = (params.alt ?? params.filename ?? name).trim() || name;

    const finalization = await this.finalizeUpload(
      {
        bytes: params.bytes,
        name,
        alt,
      },
      params.context
    );
    if (!finalization.ok) {
      return { ok: false, error: finalization.error };
    }

    // Check lineage after finalization
    const currentLineage = this.options.getActiveLineage?.();
    if (isLineageStale(lineageBefore, currentLineage)) {
      return {
        ok: false,
        error: { code: 'STALE_RESULT', message: 'Lineage or authority changed during upload' },
      };
    }

    const resolved = await this.resolve(finalization.asset, params.context);
    return {
      ok: true,
      asset: finalization.asset,
      runtimeState: resolved.state,
    };
  }

  revokeObjectURLs(): void {
    this.resolutionGeneration += 1;
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const url of this.activeBlobUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore cleanup failures
        }
      }
    }
    this.activeBlobUrls.clear();
    this.cache.clear();
  }

  invalidateAuth(authLineage: string): void {
    if (this.currentAuthLineage !== authLineage) {
      this.currentAuthLineage = authLineage;
      this.revokeObjectURLs();
      this.inFlight.clear();
    }
  }
}
