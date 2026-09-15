/**
 * Pure byte analysis for canonical image formats (PNG, JPEG, WebP).
 * Zero DOM, React, or Supabase dependencies.
 */

export type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export function sniffImageMime(input: Uint8Array | ArrayBuffer): SupportedImageMime | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12) return null;

  // PNG: \x89PNG\r\n\x1a\n
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: \xFF\xD8\xFF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export function sniffImageDimensions(
  input: Uint8Array | ArrayBuffer
): { widthPx: number; heightPx: number } | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const mime = sniffImageMime(bytes);
  if (!mime) return null;

  try {
    if (mime === 'image/png') {
      if (bytes.length < 24) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      // IHDR begins at offset 12; width at 16, height at 20 (big-endian uint32)
      const widthPx = view.getUint32(16, false);
      const heightPx = view.getUint32(20, false);
      if (widthPx > 0 && heightPx > 0) return { widthPx, heightPx };
      return null;
    }

    if (mime === 'image/jpeg') {
      let offset = 2;
      const length = bytes.length;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      while (offset < length - 1) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        offset += 2;

        // End of image or start of scan
        if (marker === 0xd9 || marker === 0xda) break;

        if (offset + 2 > length) break;
        const segmentLength = view.getUint16(offset, false);

        // SOF markers containing dimensions: SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
        const isSof =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);

        if (isSof) {
          if (offset + segmentLength > length || segmentLength < 7) return null;
          const heightPx = view.getUint16(offset + 3, false);
          const widthPx = view.getUint16(offset + 5, false);
          if (widthPx > 0 && heightPx > 0) return { widthPx, heightPx };
          return null;
        }

        offset += segmentLength;
      }
      return null;
    }

    if (mime === 'image/webp') {
      if (bytes.length < 30) return null;
      const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

      if (chunkType === 'VP8X') {
        const widthPx = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const heightPx = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        if (widthPx > 0 && heightPx > 0) return { widthPx, heightPx };
        return null;
      }

      if (chunkType === 'VP8 ') {
        // Keyframe signature 0x9D 0x01 0x2A at offset 23..25
        if (bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
          const widthPx = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
          const heightPx = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
          if (widthPx > 0 && heightPx > 0) return { widthPx, heightPx };
        }
        return null;
      }

      if (chunkType === 'VP8L') {
        if (bytes[20] === 0x2f) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const val = view.getUint32(21, true);
          const widthPx = 1 + (val & 0x3fff);
          const heightPx = 1 + ((val >> 14) & 0x3fff);
          if (widthPx > 0 && heightPx > 0) return { widthPx, heightPx };
        }
        return null;
      }

      return null;
    }
  } catch {
    return null;
  }

  return null;
}
