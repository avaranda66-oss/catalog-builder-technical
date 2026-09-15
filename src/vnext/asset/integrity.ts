import type { AssetRef } from '../domain/editorial-model';
import { sniffImageDimensions, sniffImageMime, type SupportedImageMime } from './sniff';

export type { SupportedImageMime };

export type AssetIntegrityFailureCode =
  | 'ASSET_HASH_MISMATCH'
  | 'ASSET_MIME_MISMATCH'
  | 'ASSET_DIMENSIONS_MISMATCH'
  | 'REQUIRED_ASSET_MISSING'
  | 'UNSUPPORTED_MEDIA'
  | 'CORRUPT_MEDIA';

export interface AssetIntegritySuccess {
  readonly ok: true;
  readonly sha256: string;
  readonly mime: SupportedImageMime;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteLength: number;
}

export interface AssetIntegrityFailure {
  readonly ok: false;
  readonly code: AssetIntegrityFailureCode;
  readonly message: string;
  readonly assetId: string;
}

export type AssetIntegrityResult = AssetIntegritySuccess | AssetIntegrityFailure;

/**
 * Canonical platform-neutral SHA-256 implementation using Web Crypto.
 * Imported and reused by asset bridge, rendering, and publication.
 */
export async function sha256(value: string | ArrayBuffer | Uint8Array): Promise<string> {
  let bytes: Uint8Array;
  if (typeof value === 'string') {
    bytes = new TextEncoder().encode(value);
  } else if (value instanceof Uint8Array) {
    bytes = value;
  } else {
    bytes = new Uint8Array(value);
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates the raw byte payload against a canonical AssetRef.
 * Verifies SHA-256, sniffing-derived MIME, and header-derived dimensions.
 */
export async function verifyAssetBytes(
  asset: AssetRef,
  input: ArrayBuffer | Uint8Array
): Promise<AssetIntegrityResult> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  // 1. Check SHA-256
  const computedHash = await sha256(bytes);
  if (computedHash !== asset.sha256) {
    return {
      ok: false,
      code: 'ASSET_HASH_MISMATCH',
      message: `Asset ${asset.id} hash mismatch: expected ${asset.sha256}, calculated ${computedHash}`,
      assetId: asset.id,
    };
  }

  // 2. Check MIME from bytes
  const detectedMime = sniffImageMime(bytes);
  if (!detectedMime) {
    return {
      ok: false,
      code: 'UNSUPPORTED_MEDIA',
      message: `Asset ${asset.id} contains unsupported or corrupt media bytes`,
      assetId: asset.id,
    };
  }
  if (detectedMime !== asset.mime) {
    return {
      ok: false,
      code: 'ASSET_MIME_MISMATCH',
      message: `Asset ${asset.id} MIME mismatch: expected ${asset.mime}, detected ${detectedMime}`,
      assetId: asset.id,
    };
  }

  // 3. Check dimensions from bytes
  const dimensions = sniffImageDimensions(bytes);
  if (!dimensions) {
    return {
      ok: false,
      code: 'CORRUPT_MEDIA',
      message: `Asset ${asset.id} could not extract intrinsic dimensions from bytes`,
      assetId: asset.id,
    };
  }
  if (dimensions.widthPx !== asset.widthPx || dimensions.heightPx !== asset.heightPx) {
    return {
      ok: false,
      code: 'ASSET_DIMENSIONS_MISMATCH',
      message: `Asset ${asset.id} dimensions mismatch: expected ${asset.widthPx}x${asset.heightPx}, detected ${dimensions.widthPx}x${dimensions.heightPx}`,
      assetId: asset.id,
    };
  }

  return {
    ok: true,
    sha256: computedHash,
    mime: detectedMime,
    widthPx: dimensions.widthPx,
    heightPx: dimensions.heightPx,
    byteLength: bytes.byteLength,
  };
}
