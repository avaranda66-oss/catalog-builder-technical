import {
  HEIC_PHOTO_MESSAGE, createBrowserImageReencoder, normalizeImageForUpload, type ImageReencoder,
} from '../asset/normalize-image';
import { fileBytes, type SketchImageUpload } from './spec-table/spec-table-gateway';
import { SKETCH_LIMITS } from './sketch-plan';

/**
 * Modo rascunho: the photo of one page drawn on paper, made ready on this computer before anything is sent.
 * Turned upright (EXIF) and reduced to at most 1600 px on its longest side, the same image the AI reads and the
 * review screen shows, so the areas the AI found fall on the drawing. Accepts what the chat accepts: JPG, PNG and
 * WebP; a HEIC photo from an iPhone gets the same plain message as everywhere else in the editor.
 */
export interface PreparedSketchImage extends SketchImageUpload {
  readonly width: number;
  readonly height: number;
}
export type SketchImageOutcome = ({ readonly ok: true } & PreparedSketchImage) | { readonly ok: false; readonly message: string };

/** A photo larger than this is not even opened here (a phone photo has 2–8 MB). */
export const SKETCH_MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const UNCHANGED = ' Nada foi alterado no catálogo.';
const EXTENSION: Readonly<Record<string, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** The file name sent with the image, with the extension of what the bytes really are after the reduction. */
export function sketchUploadName(fileName: string, mime: string): string {
  const base = fileName.trim().replace(/\.[a-z0-9]{1,5}$/iu, '') || 'rascunho';
  return `${base}.${EXTENSION[mime] ?? 'jpg'}`;
}

export async function prepareSketchImage(file: Blob & { readonly name: string },
  options: { readonly reencoder?: ImageReencoder | null } = {}): Promise<SketchImageOutcome> {
  if (file.size > SKETCH_MAX_PHOTO_BYTES) {
    return { ok: false, message: `A foto ${file.name} é grande demais (mais de 30 MB). Tire outra foto do rascunho e tente de novo.${UNCHANGED}` };
  }
  let bytes: ArrayBuffer;
  try { bytes = await fileBytes(file); } catch {
    return { ok: false, message: `Não consegui abrir a foto ${file.name} aqui no computador. Envie de novo.${UNCHANGED}` };
  }
  const reencoder = options.reencoder === undefined ? createBrowserImageReencoder() : options.reencoder ?? undefined;
  const result = await normalizeImageForUpload(bytes, { reencoder, fileName: file.name, maxLongSidePx: SKETCH_LIMITS.maxImageSidePx });
  if (!result.ok) {
    return { ok: false, message: result.code === 'UNSUPPORTED_HEIC' ? `${HEIC_PHOTO_MESSAGE}${UNCHANGED}`
      : `O arquivo ${file.name} não é uma foto que o aplicativo consegue abrir. Use uma foto em JPG ou PNG.${UNCHANGED}` };
  }
  if (Math.max(result.widthPx, result.heightPx) > SKETCH_LIMITS.maxImageSidePx) {
    // Only when this browser cannot reduce photos: the server would refuse it anyway.
    return { ok: false, message: `Este navegador não conseguiu reduzir a foto ${file.name}. Use uma foto de até `
      + `${SKETCH_LIMITS.maxImageSidePx} pixels no lado maior, ou outro navegador.${UNCHANGED}` };
  }
  return { ok: true, name: sketchUploadName(file.name, result.mime), type: result.mime, bytes: result.bytes,
    width: result.widthPx, height: result.heightPx };
}
