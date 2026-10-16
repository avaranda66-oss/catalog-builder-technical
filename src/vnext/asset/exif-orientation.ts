/**
 * Pure EXIF Orientation reader for JPEG bytes (APP1 "Exif" segment, tag 0x0112).
 * Zero DOM, React, or Supabase dependencies; every read is bounds-checked and a
 * malformed or missing tag reads as orientation 1 (no rotation).
 */

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const ORIENTATION_TAG = 0x0112;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function isOrientation(value: number): value is ExifOrientation {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

/** Orientations 5-8 rotate the picture by 90°, so the displayed width is the encoded height. */
export function exifOrientationSwapsAxes(orientation: ExifOrientation): boolean {
  return orientation >= 5;
}

function readTiffOrientation(bytes: Uint8Array, tiffStart: number, tiffEnd: number): ExifOrientation {
  if (tiffStart + 8 > tiffEnd) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = view.getUint16(tiffStart, false);
  if (order !== 0x4949 && order !== 0x4d4d) return 1;
  const little = order === 0x4949;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return 1;
  const ifdOffset = view.getUint32(tiffStart + 4, little);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdOffset < 8 || ifdStart + 2 > tiffEnd) return 1;
  const entries = view.getUint16(ifdStart, little);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (entry + 12 > tiffEnd) return 1;
    if (view.getUint16(entry, little) !== ORIENTATION_TAG) continue;
    const type = view.getUint16(entry + 2, little);
    const count = view.getUint32(entry + 4, little);
    // SHORT (3) with a single value stored inline in the first two value bytes.
    if (type !== 3 || count < 1) return 1;
    const value = view.getUint16(entry + 8, little);
    return isOrientation(value) ? value : 1;
  }
  return 1;
}

/** Reads the EXIF Orientation of a JPEG. Returns 1 for non-JPEG, missing, or malformed data. */
export function readJpegExifOrientation(input: Uint8Array | ArrayBuffer): ExifOrientation {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return 1;
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset += 1; // fill byte
        continue;
      }
      // Start of scan or end of image: metadata segments always precede the scan.
      if (marker === 0xda || marker === 0xd9) return 1;
      // Standalone markers carry no length field.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segmentLength = view.getUint16(offset + 2, false);
      const segmentStart = offset + 4;
      const segmentEnd = offset + 2 + segmentLength;
      if (segmentLength < 2 || segmentEnd > bytes.length) return 1;
      if (
        marker === 0xe1
        && segmentLength >= 2 + EXIF_HEADER.length + 8
        && EXIF_HEADER.every((value, index) => bytes[segmentStart + index] === value)
      ) {
        return readTiffOrientation(bytes, segmentStart + EXIF_HEADER.length, segmentEnd);
      }
      offset = segmentEnd;
    }
  } catch {
    return 1;
  }
  return 1;
}
