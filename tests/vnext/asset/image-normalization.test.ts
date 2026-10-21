import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DefaultAssetPersistenceBridge,
  type AssetFinalizationResult,
  type AssetRepository,
} from '@/vnext/asset';
import { sha256, verifyAssetBytes } from '@/vnext/asset/integrity';
import {
  HEIC_PHOTO_MESSAGE,
  MAX_UPLOAD_IMAGE_LONG_SIDE_PX,
  detectHeifFamily,
  imageNeedsReencode,
  normalizeImageForUpload,
  normalizedTargetSize,
  readJpegExifOrientation,
  type ImageReencoder,
} from '@/vnext/asset/normalize-image';
import { sniffEncodedImageDimensions, sniffImageDimensions } from '@/vnext/asset/sniff';
import { classifyEditorNotice, editorNoticeTimeoutMs } from '@/vnext/editor/editor-notices';
import { imageUploadErrorMessage } from '@/vnext/app/image-upload';

const fixtureDir = resolve(__dirname, 'fixtures');
/** Real phone-style JPEG: 40×20 pixels stored sideways with EXIF Orientation=6 (shown 20×40). */
const rotatedJpeg = () => new Uint8Array(readFileSync(resolve(fixtureDir, 'phone-portrait-orientation-6.jpg')));
/** Same picture already upright (20×40), no EXIF: what the browser re-encoder produces. */
const uprightJpeg = () => new Uint8Array(readFileSync(resolve(fixtureDir, 'upright-portrait.jpg')));
/** Ordinary 40×20 JPEG without EXIF. */
const plainJpeg = () => new Uint8Array(readFileSync(resolve(fixtureDir, 'plain-landscape.jpg')));

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

/** Minimal JPEG: optional XMP APP1, big-endian ("MM") Exif APP1 with the given orientation, SOF0. */
function bigEndianExifJpeg(orientation: number, width: number, height: number, withXmpFirst = false): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (withXmpFirst) {
    const xmp = [...'http://ns.adobe.com/xap/1.0/\0'].map((c) => c.charCodeAt(0));
    parts.push(0xff, 0xe1, 0x00, xmp.length + 2, ...xmp);
  }
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // next IFD
  ];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  parts.push(0xff, 0xe1, 0x00, app1.length + 2, ...app1);
  parts.push(0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x00, 0x00, 0x00);
  parts.push(0xff, 0xd9);
  return Uint8Array.from(parts);
}

function heicBytes(brand = 'heic', compatible = ['mif1', 'heic']): Uint8Array {
  const brands = [brand, '\0\0\0\0', ...compatible];
  const size = 8 + brands.length * 4;
  const bytes = new Uint8Array(size + 8);
  new DataView(bytes.buffer).setUint32(0, size, false);
  bytes.set([...'ftyp'].map((c) => c.charCodeAt(0)), 4);
  brands.forEach((value, index) => bytes.set([...value].map((c) => c.charCodeAt(0)), 8 + index * 4));
  return bytes;
}

function reencoderReturning(output: Uint8Array) {
  const reencode = vi.fn<ImageReencoder['reencode']>(async () => output);
  return { reencode } satisfies ImageReencoder;
}

function repository() {
  const uploads: { path: string; bytes: Uint8Array; mime: string }[] = [];
  const finalized: Parameters<AssetRepository['finalizeAsset']>[0][] = [];
  const repo: AssetRepository = {
    uploadBytes: vi.fn(async (path: string, bytes: Uint8Array, mime: string) => {
      uploads.push({ path, bytes, mime });
      return { ok: true };
    }),
    finalizeAsset: vi.fn(async (params): Promise<AssetFinalizationResult> => {
      finalized.push(params);
      return {
        ok: true,
        asset: {
          id: params.assetId, version: '1', sha256: params.sha256, mime: params.mime,
          widthPx: params.widthPx, heightPx: params.heightPx, name: params.name, alt: params.alt,
        },
      };
    }),
    getAsset: vi.fn(async () => ({ ok: true as const, record: null })),
    createSignedUrl: vi.fn(async () => ({ ok: false, error: 'not needed' })),
  };
  return { repo, uploads, finalized };
}

describe('FR-40 EXIF orientation reader', () => {
  it('reads Orientation=6 from a real phone-style JPEG and 1 when the tag is absent', () => {
    expect(readJpegExifOrientation(rotatedJpeg())).toBe(6);
    expect(readJpegExifOrientation(plainJpeg())).toBe(1);
    expect(readJpegExifOrientation(uprightJpeg())).toBe(1);
  });

  it('reads big-endian Exif after an XMP segment and ignores PNG, truncated and garbage bytes', () => {
    expect(readJpegExifOrientation(bigEndianExifJpeg(8, 30, 10, true))).toBe(8);
    expect(readJpegExifOrientation(bigEndianExifJpeg(3, 30, 10))).toBe(3);
    expect(readJpegExifOrientation(bigEndianExifJpeg(9, 30, 10))).toBe(1);
    expect(readJpegExifOrientation(pngHeader(10, 10))).toBe(1);
    expect(readJpegExifOrientation(rotatedJpeg().slice(0, 30))).toBe(1);
    expect(readJpegExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]))).toBe(1);
  });

  it('measures the photo as the browser shows it (width and height swapped for orientations 5-8)', () => {
    expect(sniffEncodedImageDimensions(rotatedJpeg())).toEqual({ widthPx: 40, heightPx: 20 });
    expect(sniffImageDimensions(rotatedJpeg())).toEqual({ widthPx: 20, heightPx: 40 });
    expect(sniffImageDimensions(plainJpeg())).toEqual({ widthPx: 40, heightPx: 20 });
    expect(sniffImageDimensions(bigEndianExifJpeg(8, 30, 10))).toEqual({ widthPx: 10, heightPx: 30 });
    expect(sniffImageDimensions(bigEndianExifJpeg(3, 30, 10))).toEqual({ widthPx: 30, heightPx: 10 });
  });
});

describe('FR-40 upload normalization', () => {
  it('keeps the exact original bytes of an ordinary JPEG and never calls the re-encoder', async () => {
    const reencoder = reencoderReturning(uprightJpeg());
    const original = plainJpeg();
    const result = await normalizeImageForUpload(original, { reencoder });
    expect(result).toMatchObject({ ok: true, mime: 'image/jpeg', widthPx: 40, heightPx: 20, reencoded: false });
    expect(result.ok && result.bytes).toBe(original);
    expect(reencoder.reencode).not.toHaveBeenCalled();
  });

  it('re-encodes a rotated phone photo upright and measures the final bytes', async () => {
    const reencoder = reencoderReturning(uprightJpeg());
    const result = await normalizeImageForUpload(rotatedJpeg(), { reencoder });
    expect(result).toMatchObject({ ok: true, mime: 'image/jpeg', widthPx: 20, heightPx: 40, reencoded: true });
    expect(result.ok && Array.from(result.bytes)).toEqual(Array.from(uprightJpeg()));
    expect(reencoder.reencode).toHaveBeenCalledWith(expect.objectContaining({
      mime: 'image/jpeg', maxLongSidePx: 3000, jpegQuality: 0.9,
    }));
  });

  it('falls back to the original bytes measured upright when re-encoding fails or disagrees', async () => {
    const failing: ImageReencoder = { reencode: vi.fn(async () => { throw new Error('decoder unavailable'); }) };
    for (const reencoder of [undefined, failing, reencoderReturning(plainJpeg())]) {
      const original = rotatedJpeg();
      const result = await normalizeImageForUpload(original, { reencoder });
      expect(result).toMatchObject({ ok: true, widthPx: 20, heightPx: 40, reencoded: false });
      expect(result.ok && result.bytes).toBe(original);
    }
  });

  it('shrinks the long side to 3000 px and never upscales', async () => {
    expect(MAX_UPLOAD_IMAGE_LONG_SIDE_PX).toBe(3000);
    expect(normalizedTargetSize(4000, 3000)).toEqual({ widthPx: 3000, heightPx: 2250 });
    expect(normalizedTargetSize(2000, 6000)).toEqual({ widthPx: 1000, heightPx: 3000 });
    expect(normalizedTargetSize(800, 600)).toEqual({ widthPx: 800, heightPx: 600 });
    expect(imageNeedsReencode(1, 3000, 2000)).toBe(false);
    expect(imageNeedsReencode(1, 3001, 2000)).toBe(true);
    expect(imageNeedsReencode(6, 40, 20)).toBe(true);

    const reencoder = reencoderReturning(pngHeader(3000, 2250));
    const result = await normalizeImageForUpload(pngHeader(4000, 3000), { reencoder });
    expect(result).toMatchObject({ ok: true, mime: 'image/png', widthPx: 3000, heightPx: 2250, reencoded: true });
  });

  it('explains HEIC photos in plain Portuguese and rejects other unknown formats', async () => {
    expect(detectHeifFamily(heicBytes())).toBe('heic');
    expect(detectHeifFamily(heicBytes('mif1', ['avif']))).toBe('avif');
    expect(detectHeifFamily(plainJpeg())).toBeNull();

    await expect(normalizeImageForUpload(heicBytes())).resolves.toEqual({
      ok: false, code: 'UNSUPPORTED_HEIC', message: HEIC_PHOTO_MESSAGE,
    });
    await expect(normalizeImageForUpload(new Uint8Array(64), { fileName: 'IMG_2034.HEIC' }))
      .resolves.toMatchObject({ ok: false, code: 'UNSUPPORTED_HEIC' });
    await expect(normalizeImageForUpload(heicBytes('mif1', ['avif'])))
      .resolves.toMatchObject({ ok: false, code: 'UNSUPPORTED_MEDIA' });
    await expect(normalizeImageForUpload(new TextEncoder().encode('%PDF-1.7 fake document')))
      .resolves.toMatchObject({ ok: false, code: 'UNSUPPORTED_MEDIA' });

    expect(HEIC_PHOTO_MESSAGE).toBe('Esta foto está no formato HEIC, do iPhone, que ainda não é aceito. '
      + 'Envie a foto em JPEG ou peça a quem a tirou. Para as próximas fotos, no iPhone: '
      + 'Ajustes > Câmera > Formatos > “Mais compatível”.');
    // C-03: a refusal with an instruction stays on screen until the person closes it.
    expect(classifyEditorNotice(HEIC_PHOTO_MESSAGE)).toBe('error');
    expect(editorNoticeTimeoutMs(HEIC_PHOTO_MESSAGE)).toBeNull();
    expect(imageUploadErrorMessage('UNSUPPORTED_HEIC')).toBe(HEIC_PHOTO_MESSAGE);
  });
});

describe('FR-40 asset bridge stores normalized photos', () => {
  it('uploads, hashes and measures the upright bytes of a rotated phone photo', async () => {
    const { repo, uploads, finalized } = repository();
    const bridge = new DefaultAssetPersistenceBridge(repo, { imageReencoder: reencoderReturning(uprightJpeg()) });

    const result = await bridge.finalizeUpload({ bytes: rotatedJpeg(), name: 'IMG_2034.jpg' });

    expect(result.ok).toBe(true);
    const upright = uprightJpeg();
    expect(uploads).toHaveLength(1);
    expect(Array.from(uploads[0].bytes)).toEqual(Array.from(upright));
    expect(uploads[0].path).toMatch(/^vnext\/[0-9a-f-]{36}\/1\.jpeg$/);
    expect(finalized[0]).toMatchObject({
      sha256: await sha256(upright), mime: 'image/jpeg', widthPx: 20, heightPx: 40, fileSize: upright.byteLength,
    });
    if (!result.ok) return;
    await expect(verifyAssetBytes(result.asset, upright)).resolves.toMatchObject({ ok: true });
  });

  it('keeps a .jfif JPEG byte-for-byte when no normalization is needed', async () => {
    const { repo, uploads, finalized } = repository();
    const reencoder = reencoderReturning(uprightJpeg());
    const bridge = new DefaultAssetPersistenceBridge(repo, { imageReencoder: reencoder });
    const original = plainJpeg();

    const result = await bridge.finalizeUpload({ bytes: original, name: 'foto-do-whatsapp.jfif' });

    expect(result).toMatchObject({ ok: true, asset: { mime: 'image/jpeg', widthPx: 40, heightPx: 20 } });
    expect(uploads[0].bytes).toBe(original);
    expect(finalized[0].sha256).toBe(await sha256(original));
    expect(reencoder.reencode).not.toHaveBeenCalled();
  });

  it('without a re-encoder stores the original rotated bytes with upright size, which reopen verifies', async () => {
    const { repo, uploads } = repository();
    const bridge = new DefaultAssetPersistenceBridge(repo, { imageReencoder: null });
    const original = rotatedJpeg();

    const result = await bridge.finalizeUpload({ bytes: original, name: 'foto.jpg' });

    expect(result).toMatchObject({ ok: true, asset: { widthPx: 20, heightPx: 40 } });
    expect(uploads[0].bytes).toBe(original);
    if (!result.ok) return;
    await expect(verifyAssetBytes(result.asset, original)).resolves.toMatchObject({ ok: true, widthPx: 20, heightPx: 40 });
  });

  it('refuses HEIC before any upload with a code the editor turns into the HEIC message', async () => {
    const { repo } = repository();
    const bridge = new DefaultAssetPersistenceBridge(repo, { imageReencoder: null });

    const result = await bridge.upload({ bytes: heicBytes(), filename: 'IMG_0001.HEIC' });

    expect(result).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_HEIC', message: HEIC_PHOTO_MESSAGE } });
    expect(repo.uploadBytes).not.toHaveBeenCalled();
    expect(repo.finalizeAsset).not.toHaveBeenCalled();
  });
});
