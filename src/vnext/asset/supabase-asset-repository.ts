import { AssetRefSchema } from '../domain/editorial-model';
import type {
  AssetFinalizationResult,
  AssetRecord,
  AssetRepository,
  VNextAssetRpcClient,
  VNextAssetRpcResponse,
  VNextAssetStorageClient,
} from './contracts';

export interface SupabaseAssetRepositoryOptions {
  readonly isOffline?: () => boolean;
}

function rpcMessage(error: NonNullable<VNextAssetRpcResponse['error']>): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(' | ');
}

export class SupabaseAssetRepository implements AssetRepository {
  constructor(
    private readonly rpcClient: VNextAssetRpcClient,
    private readonly storageClient: VNextAssetStorageClient,
    private readonly options: SupabaseAssetRepositoryOptions = {}
  ) {}

  async finalizeAsset(params: {
    readonly assetId: string;
    readonly version: string;
    readonly sha256: string;
    readonly mime: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly name: string;
    readonly alt: string;
    readonly fileSize: number;
    readonly storagePath: string;
  }): Promise<AssetFinalizationResult> {
    if (this.options.isOffline?.()) {
      return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
    }

    const response = await this.rpcClient.rpc('finalize_vnext_asset_v1', {
      p_asset_id: params.assetId,
      p_version: params.version,
      p_sha256: params.sha256,
      p_mime: params.mime,
      p_width_px: params.widthPx,
      p_height_px: params.heightPx,
      p_name: params.name,
      p_alt: params.alt,
      p_file_size: params.fileSize,
      p_storage_path: params.storagePath,
    });

    if (response.error) {
      const code = response.error.code === '40001' ? 'CONFLICT' : response.error.code ?? 'REMOTE_FAILURE';
      return { ok: false, error: { code, message: rpcMessage(response.error) } };
    }

    const parsed = AssetRefSchema.safeParse(response.data);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'INVALID_METADATA', message: parsed.error.message },
      };
    }

    return { ok: true, asset: parsed.data };
  }

  async getAsset(
    id: string,
    version?: string
  ): Promise<{ ok: true; record: AssetRecord | null } | { ok: false; error: { code: string; message: string } }> {
    if (this.options.isOffline?.()) {
      return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
    }

    const response = await this.rpcClient.rpc('get_vnext_asset_v1', {
      p_asset_id: id,
      p_version: version ?? null,
    });

    if (response.error) {
      return {
        ok: false,
        error: { code: response.error.code ?? 'REMOTE_FAILURE', message: rpcMessage(response.error) },
      };
    }

    if (!response.data) {
      return { ok: true, record: null };
    }

    const record = response.data as AssetRecord;
    return { ok: true, record };
  }

  async uploadBytes(
    storagePath: string,
    bytes: ArrayBuffer | Uint8Array,
    mime: string
  ): Promise<{ ok: boolean; storagePath?: string; error?: string }> {
    if (this.options.isOffline?.()) {
      return { ok: false, error: 'Offline' };
    }

    const result = await this.storageClient.upload(storagePath, bytes, mime);
    return { ok: result.ok, storagePath: result.path, error: result.error };
  }

  async createSignedUrl(
    storagePath: string,
    expiresInSeconds: number
  ): Promise<{ ok: boolean; signedUrl?: string; error?: string }> {
    if (this.options.isOffline?.()) {
      return { ok: false, error: 'Offline' };
    }

    const result = await this.storageClient.createSignedUrl(storagePath, expiresInSeconds);
    return { ok: result.ok, signedUrl: result.signedUrl, error: result.error };
  }
}

interface SupabaseBucketStorage {
  upload(
    path: string,
    fileBody: ArrayBuffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: { path?: string } | null; error: { message: string } | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
}

export function supabaseStorageClientFromSupabase(
  storage: { from(bucket: string): SupabaseBucketStorage },
  bucket = 'product-assets'
): VNextAssetStorageClient {
  return {
    async upload(storagePath: string, bytes: ArrayBuffer | Uint8Array, mime: string) {
      const { data, error } = await storage.from(bucket).upload(storagePath, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true, path: data?.path ?? storagePath };
    },
    async createSignedUrl(storagePath: string, expiresInSeconds: number) {
      const { data, error } = await storage.from(bucket).createSignedUrl(storagePath, expiresInSeconds);
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true, signedUrl: data?.signedUrl };
    },
  };
}
