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
import { sniffImageDimensions, sniffImageMime } from './sniff';

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface CachedUrlEntry {
  readonly signedUrl: string;
  readonly blobUrl?: string;
  readonly expiresAt: number;
  readonly asset: AssetRef;
}

export interface DefaultAssetPersistenceBridgeOptions {
  readonly fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  readonly isOffline?: () => boolean;
  readonly getActiveLineage?: () => AssetLineageContext;
}

export class DefaultAssetPersistenceBridge implements AssetPersistenceBridge {
  private readonly cache = new Map<string, CachedUrlEntry>();
  private readonly inFlight = new Map<string, Promise<AssetResolutionResult>>();
  private readonly activeBlobUrls = new Set<string>();
  private currentAuthLineage: string | undefined;

  constructor(
    private readonly repository: AssetRepository,
    private readonly options: DefaultAssetPersistenceBridgeOptions = {}
  ) {}

  async finalizeUpload(
    input: AssetUploadInput,
    context?: AssetLineageContext
  ): Promise<AssetFinalizationResult> {
    if (this.options.isOffline?.()) {
      return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
    }

    const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);

    // 1. Derive MIME from bytes
    const mime = sniffImageMime(bytes);
    if (!mime) {
      return {
        ok: false,
        error: { code: 'UNSUPPORTED_MEDIA', message: 'Byte sniffing rejected non-supported media format' },
      };
    }

    // 2. Derive dimensions from bytes
    const dimensions = sniffImageDimensions(bytes);
    if (!dimensions) {
      return {
        ok: false,
        error: { code: 'INVALID_DIMENSIONS', message: 'Could not extract intrinsic dimensions from image bytes' },
      };
    }

    // 3. Compute SHA-256
    const hash = await sha256(bytes);

    // 4. Determine canonical asset UUID and version
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

    const version = input.version && input.version.trim() ? input.version.trim() : '1';
    const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpeg';
    const storagePath = `vnext/${assetId}/${version}.${extension}`;

    // 5. Check lineage before upload dispatch
    const lineageBefore = context ?? this.options.getActiveLineage?.();

    // 6. Upload binary bytes to immutable storage path
    const uploadResult = await this.repository.uploadBytes(storagePath, bytes, mime);
    if (!uploadResult.ok) {
      return {
        ok: false,
        error: { code: 'UPLOAD_FAILED', message: uploadResult.error ?? 'Upload to storage failed' },
      };
    }

    // 7. Check lineage before finalization
    const currentLineage = this.options.getActiveLineage?.();
    if (
      lineageBefore?.authLineage &&
      currentLineage?.authLineage &&
      lineageBefore.authLineage !== currentLineage.authLineage
    ) {
      return {
        ok: false,
        error: { code: 'STALE_RESULT', message: 'Auth lineage changed during asset upload' },
      };
    }

    // 8. Finalize metadata atomically via RPC
    const finalizationResult = await this.repository.finalizeAsset({
      assetId,
      version,
      sha256: hash,
      mime,
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      name: input.name.trim() || assetId,
      alt: input.alt?.trim() ?? '',
      fileSize: bytes.byteLength,
      storagePath,
    });

    return finalizationResult;
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

    const cacheKey = `${asset.id}:${asset.version}`;
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

    const lineageBefore = context ?? this.options.getActiveLineage?.();

    const resolutionPromise = (async (): Promise<AssetResolutionResult> => {
      try {
        // Fetch durable asset record
        const recordResult = await this.repository.getAsset(asset.id, asset.version);
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

        // Verify version matches
        if (record.version !== asset.version) {
          return {
            ok: false,
            state: {
              status: 'integrity-failed',
              code: 'ASSET_VERSION_MISMATCH',
              message: `Version mismatch: expected ${asset.version}, found ${record.version}`,
              asset,
            },
          };
        }

        // Request ephemeral signed URL (1 hour validity)
        const signedUrlResult = await this.repository.createSignedUrl(record.storagePath, 3600);
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
          bytes = await this.options.fetchBytes(signedUrl);
        } else if (typeof fetch !== 'undefined') {
          const res = await fetch(signedUrl, { cache: 'no-store' });
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
        const currentLineage = this.options.getActiveLineage?.();
        if (
          lineageBefore?.openSessionId &&
          currentLineage?.openSessionId &&
          lineageBefore.openSessionId !== currentLineage.openSessionId
        ) {
          return {
            ok: false,
            state: {
              status: 'unavailable',
              error: 'Resolution discarded: editing session changed',
              asset,
            },
          };
        }

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
    context?: AssetLineageContext
  ): Promise<{ urls: Map<string, string>; states: Map<string, AssetRuntimeState> }> {
    const urls = new Map<string, string>();
    const states = new Map<string, AssetRuntimeState>();

    for (const asset of doc.assets) {
      const result = await this.resolve(asset, context);
      states.set(asset.id, result.state);
      if (result.ok && result.state.status === 'resolved') {
        urls.set(asset.id, result.state.url);
      }
    }

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
    const finalization = await this.finalizeUpload(
      {
        bytes: params.bytes,
        name: params.name ?? params.filename ?? 'imagem',
        alt: params.alt ?? params.filename ?? 'imagem',
      },
      params.context
    );
    if (!finalization.ok) {
      return { ok: false, error: finalization.error };
    }
    const resolved = await this.resolve(finalization.asset, params.context);
    const runtimeUrl = resolved.ok ? resolved.state.url : '';
    return {
      ok: true,
      record: {
        asset: finalization.asset,
        runtimeUrl,
      },
    };
  }

  revokeObjectURLs(): void {
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
