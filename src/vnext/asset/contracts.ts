import type { AssetRef, CatalogDocument } from '../domain/editorial-model';
import type { AssetIntegrityResult } from './integrity';
import type { SupportedImageMime } from './sniff';

export type { AssetRef } from '../domain/editorial-model';
export type { AssetIntegrityResult } from './integrity';
export type { SupportedImageMime } from './sniff';

export interface AssetRecord {
  readonly id: string;
  readonly version: string;
  readonly sha256: string;
  readonly mime: SupportedImageMime;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly name: string;
  readonly alt: string;
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly fileSize: number;
  readonly createdAt: string;
}

export interface AssetUploadInput {
  readonly bytes: ArrayBuffer | Uint8Array;
  readonly name: string;
  readonly alt?: string;
  readonly assetId?: string;
  readonly version?: string;
}

export type AssetRuntimeState =
  | {
      readonly status: 'resolved';
      readonly url: string;
      readonly blobUrl?: string;
      readonly expiresAt: number;
      readonly asset: AssetRef;
    }
  | {
      readonly status: 'unavailable';
      readonly error: string;
      readonly asset: AssetRef;
    }
  | {
      readonly status: 'offline';
      readonly asset: AssetRef;
    }
  | {
      readonly status: 'integrity-failed';
      readonly code: string;
      readonly message: string;
      readonly asset: AssetRef;
    };

export type AssetResolutionResult =
  | { readonly ok: true; readonly state: AssetRuntimeState & { readonly status: 'resolved' } }
  | {
      readonly ok: false;
      readonly state: AssetRuntimeState & { readonly status: 'unavailable' | 'offline' | 'integrity-failed' };
    };

export type AssetFinalizationResult =
  | { readonly ok: true; readonly asset: AssetRef }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export interface VNextAssetRpcResponse<T = unknown> {
  readonly data: T | null;
  readonly error: {
    readonly code?: string | null;
    readonly message?: string | null;
    readonly details?: string | null;
    readonly hint?: string | null;
  } | null;
}

export interface VNextAssetRpcClient {
  rpc(functionName: string, args?: Record<string, unknown>): Promise<VNextAssetRpcResponse>;
}

export interface VNextAssetStorageClient {
  upload(
    storagePath: string,
    bytes: ArrayBuffer | Uint8Array,
    mime: string
  ): Promise<{ ok: boolean; path?: string; error?: string }>;
  createSignedUrl(
    storagePath: string,
    expiresInSeconds: number
  ): Promise<{ ok: boolean; signedUrl?: string; error?: string }>;
}

export interface AssetRepository {
  finalizeAsset(params: {
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
  }): Promise<AssetFinalizationResult>;

  getAsset(
    id: string,
    version?: string
  ): Promise<{ ok: true; record: AssetRecord | null } | { ok: false; error: { code: string; message: string } }>;

  uploadBytes(
    storagePath: string,
    bytes: ArrayBuffer | Uint8Array,
    mime: string
  ): Promise<{ ok: boolean; storagePath?: string; error?: string }>;

  createSignedUrl(
    storagePath: string,
    expiresInSeconds: number
  ): Promise<{ ok: boolean; signedUrl?: string; error?: string }>;
}

export interface AssetLineageContext {
  readonly authLineage?: string;
  readonly openSessionId?: string;
  readonly catalogId?: string;
  readonly authorityScopeId?: string;
}

export interface AssetUploadParams {
  readonly bytes: ArrayBuffer | Uint8Array;
  readonly filename?: string;
  readonly name?: string;
  readonly alt?: string;
  readonly mimeHint?: string;
  readonly context?: AssetLineageContext;
}

export type AssetUploadResult =
  | { readonly ok: true; readonly record: { readonly asset: AssetRef; readonly runtimeUrl: string } }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export interface AssetPersistenceBridge {
  finalizeUpload(input: AssetUploadInput, context?: AssetLineageContext): Promise<AssetFinalizationResult>;
  upload(params: AssetUploadParams): Promise<AssetUploadResult>;
  resolve(asset: AssetRef, context?: AssetLineageContext & { forceRefresh?: boolean }): Promise<AssetResolutionResult>;
  verify(asset: AssetRef, bytes: ArrayBuffer | Uint8Array): Promise<AssetIntegrityResult>;
  resolveDocumentAssets(
    doc: CatalogDocument,
    context?: AssetLineageContext
  ): Promise<{ urls: Map<string, string>; states: Map<string, AssetRuntimeState> }>;
  resolveDocument(
    doc: CatalogDocument,
    context?: AssetLineageContext
  ): Promise<Map<string, AssetRuntimeState>>;
  revokeObjectURLs(): void;
  invalidateAuth(authLineage: string): void;
}
