/**
 * Upload-time image normalization (FR-40).
 *
 * Phone cameras store portrait photos sideways and add an EXIF Orientation tag. Browsers
 * display them upright, so the stored bytes must either be re-encoded upright or be
 * measured upright; otherwise the PDF check sees a different shape than the editor.
 *
 * Rules:
 * - re-encode only when the EXIF orientation is not 1 or the long side exceeds 3000 px;
 * - every other upload keeps its original bytes (they reach the PDF without resampling);
 * - hash and size are always computed from the final bytes by the caller;
 * - when re-encoding is unavailable or fails, the original bytes are kept and measured
 *   upright (sniffImageDimensions applies the orientation), which matches the browser.
 */
import { readJpegExifOrientation, type ExifOrientation } from './exif-orientation';
import { sniffImageDimensions, sniffImageMime, type SupportedImageMime } from './sniff';

export { exifOrientationSwapsAxes, readJpegExifOrientation, type ExifOrientation } from './exif-orientation';

export const MAX_UPLOAD_IMAGE_LONG_SIDE_PX = 3000;
export const NORMALIZED_JPEG_QUALITY = 0.9;
export const HEIC_PHOTO_MESSAGE = 'Esta foto está em HEIC. No iPhone, use “Mais compatível” ou envie como JPEG.';

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

export interface ImageReencodeRequest {
  readonly bytes: Uint8Array;
  readonly mime: SupportedImageMime;
  readonly maxLongSidePx: number;
  readonly jpegQuality: number;
}

/** Decodes with the EXIF orientation applied, scales down to the limit and re-encodes. */
export interface ImageReencoder {
  reencode(request: ImageReencodeRequest): Promise<Uint8Array>;
}

export interface NormalizedUploadImage {
  readonly ok: true;
  readonly bytes: Uint8Array;
  readonly mime: SupportedImageMime;
  readonly widthPx: number;
  readonly heightPx: number;
  /** True when the bytes were re-encoded; false when the original bytes are kept. */
  readonly reencoded: boolean;
}

export interface ImageNormalizationFailure {
  readonly ok: false;
  readonly code: 'UNSUPPORTED_HEIC' | 'UNSUPPORTED_MEDIA' | 'INVALID_DIMENSIONS';
  readonly message: string;
}

export type ImageNormalizationResult = NormalizedUploadImage | ImageNormalizationFailure;

function ascii(bytes: Uint8Array, start: number): string {
  return String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]);
}

/** Detects ISO-BMFF still images (HEIC/HEIF from iPhones, AVIF) by their `ftyp` brands. */
export function detectHeifFamily(input: Uint8Array | ArrayBuffer): 'heic' | 'avif' | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 16 || ascii(bytes, 4) !== 'ftyp') return null;
  const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  const end = Math.min(bytes.length, boxSize >= 16 ? boxSize : 16);
  const brands = [ascii(bytes, 8)];
  for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(bytes, offset));
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return 'avif';
  if (brands.some((brand) => HEIF_BRANDS.has(brand))) return 'heic';
  return null;
}

function hasHeicExtension(fileName?: string): boolean {
  return /\.(heic|heif)$/i.test(fileName?.trim() ?? '');
}

/** Upright size after scaling the long side down to the limit (never upscales). */
export function normalizedTargetSize(
  widthPx: number,
  heightPx: number,
  maxLongSidePx = MAX_UPLOAD_IMAGE_LONG_SIDE_PX
): { widthPx: number; heightPx: number } {
  const scale = Math.min(1, maxLongSidePx / Math.max(widthPx, heightPx));
  return {
    widthPx: Math.max(1, Math.round(widthPx * scale)),
    heightPx: Math.max(1, Math.round(heightPx * scale)),
  };
}

export function imageNeedsReencode(
  orientation: ExifOrientation,
  widthPx: number,
  heightPx: number,
  maxLongSidePx = MAX_UPLOAD_IMAGE_LONG_SIDE_PX
): boolean {
  return orientation !== 1 || Math.max(widthPx, heightPx) > maxLongSidePx;
}

export async function normalizeImageForUpload(
  input: Uint8Array | ArrayBuffer,
  options: {
    readonly reencoder?: ImageReencoder;
    readonly fileName?: string;
    readonly maxLongSidePx?: number;
  } = {}
): Promise<ImageNormalizationResult> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const maxLongSidePx = options.maxLongSidePx ?? MAX_UPLOAD_IMAGE_LONG_SIDE_PX;
  const mime = sniffImageMime(bytes);
  if (!mime) {
    if (detectHeifFamily(bytes) === 'heic' || hasHeicExtension(options.fileName)) {
      return { ok: false, code: 'UNSUPPORTED_HEIC', message: HEIC_PHOTO_MESSAGE };
    }
    return { ok: false, code: 'UNSUPPORTED_MEDIA', message: 'Byte sniffing rejected non-supported media format' };
  }
  const upright = sniffImageDimensions(bytes);
  if (!upright) {
    return { ok: false, code: 'INVALID_DIMENSIONS', message: 'Could not extract intrinsic dimensions from image bytes' };
  }
  const original: NormalizedUploadImage = { ok: true, bytes, mime, ...upright, reencoded: false };
  const orientation = mime === 'image/jpeg' ? readJpegExifOrientation(bytes) : 1;
  if (!options.reencoder || !imageNeedsReencode(orientation, upright.widthPx, upright.heightPx, maxLongSidePx)) {
    return original;
  }

  let output: Uint8Array;
  try {
    output = await options.reencoder.reencode({
      bytes,
      mime,
      maxLongSidePx,
      jpegQuality: NORMALIZED_JPEG_QUALITY,
    });
  } catch {
    return original;
  }
  const outputMime = sniffImageMime(output);
  const outputSize = outputMime ? sniffImageDimensions(output) : null;
  const expected = normalizedTargetSize(upright.widthPx, upright.heightPx, maxLongSidePx);
  if (
    !outputMime
    || !outputSize
    || (outputMime === 'image/jpeg' && readJpegExifOrientation(output) !== 1)
    || Math.abs(outputSize.widthPx - expected.widthPx) > 1
    || Math.abs(outputSize.heightPx - expected.heightPx) > 1
  ) {
    // The decoder disagreed with the header; keep the bytes the browser already shows correctly.
    return original;
  }
  return { ok: true, bytes: output, mime: outputMime, ...outputSize, reencoded: true };
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createCanvas(widthPx: number, heightPx: number): CanvasLike | undefined {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(widthPx, heightPx);
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    return canvas;
  }
  return undefined;
}

function hasTransparentPixel(context: Context2D, widthPx: number, heightPx: number): boolean {
  const data = context.getImageData(0, 0, widthPx, heightPx).data;
  for (let index = 3; index < data.length; index += 4) if (data[index] < 255) return true;
  return false;
}

async function encodeCanvas(canvas: CanvasLike, mime: 'image/jpeg' | 'image/png', quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: mime, quality });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('IMAGE_ENCODE_FAILED'))), mime, quality);
  });
}

/**
 * Browser re-encoder: createImageBitmap(..., { imageOrientation: 'from-image' }) → canvas →
 * JPEG (q 0.9) for photos, PNG for PNG sources or any transparency. Undefined when the
 * environment has no bitmap decoder or canvas (tests, very old browsers).
 */
export function createBrowserImageReencoder(): ImageReencoder | undefined {
  if (typeof createImageBitmap !== 'function' || typeof Blob === 'undefined') return undefined;
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return undefined;
  return {
    async reencode({ bytes, mime, maxLongSidePx, jpegQuality }) {
      const bitmap = await createImageBitmap(
        new Blob([bytes as unknown as BlobPart], { type: mime }),
        { imageOrientation: 'from-image' }
      );
      try {
        const target = normalizedTargetSize(bitmap.width, bitmap.height, maxLongSidePx);
        const canvas = createCanvas(target.widthPx, target.heightPx);
        const context = canvas?.getContext('2d') as Context2D | null | undefined;
        if (!canvas || !context) throw new Error('IMAGE_CANVAS_UNAVAILABLE');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, target.widthPx, target.heightPx);
        const keepPng = mime === 'image/png'
          || (mime === 'image/webp' && hasTransparentPixel(context, target.widthPx, target.heightPx));
        const blob = await encodeCanvas(canvas, keepPng ? 'image/png' : 'image/jpeg', jpegQuality);
        return new Uint8Array(await blob.arrayBuffer());
      } finally {
        bitmap.close();
      }
    },
  };
}
