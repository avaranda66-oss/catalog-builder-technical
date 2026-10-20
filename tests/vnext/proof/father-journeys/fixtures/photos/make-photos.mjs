// Fotos de teste do grupo C (J6/J13). Nenhuma biblioteca de imagem no Node: o JPEG sai de um <canvas> do
// Chromium (Playwright) e o Node monta por cima o segmento EXIF (APP1) com Orientation=6, como uma foto
// retrato de celular. O HEIC é só a assinatura ('ftypheic' nos bytes 4–12): basta para o app reconhecer.
//
//   node tests/vnext/proof/father-journeys/fixtures/photos/make-photos.mjs   → regrava os dois arquivos pequenos
//   import { ensurePhotoFixtures, makeLargeJpegOnPage } from './fixtures/photos/make-photos.mjs'
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHOTOS_DIR = dirname(fileURLToPath(import.meta.url));
export const EXIF6_JPEG = resolve(PHOTOS_DIR, 'celular-retrato-exif6.jpg');
export const FAKE_HEIC = resolve(PHOTOS_DIR, 'foto-iphone.heic');

/** Segmento APP1 (EXIF, big-endian) com uma única entrada IFD0: Orientation (0x0112) = 6 (girar 90° à direita). */
export const APP1_ORIENTATION_6 = Buffer.from([
  0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // APP1, tamanho 34, "Exif\0\0"
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,             // "MM", 42, IFD0 em 8
  0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // 1 entrada: 0x0112 SHORT ×1 = 6
  0x00, 0x00, 0x00, 0x00,                                     // próximo IFD: nenhum
]);

/** Insere o APP1 logo depois do SOI (FF D8). */
export function withOrientation6(jpeg) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('não é um JPEG (sem SOI)');
  return Buffer.concat([jpeg.subarray(0, 2), APP1_ORIENTATION_6, jpeg.subarray(2)]);
}

/**
 * Arquivo HEIF/HEIC mínimo: caixa 'ftyp' com marca principal 'heic' (bytes 4–12 = "ftypheic") e marcas
 * compatíveis 'mif1' e 'heic', mais uma caixa 'mdat' vazia. Não é uma imagem decodificável — é só o que o
 * app precisa para dizer "esta foto está em HEIC".
 */
export function fakeHeicBytes() {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x1c]), Buffer.from('ftyp'), Buffer.from('heic'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('mif1'), Buffer.from('heic'),
  ]);
  const mdat = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x10]), Buffer.from('mdat'), Buffer.alloc(8)]);
  return Buffer.concat([ftyp, mdat]);
}

/**
 * Paisagem 3000×2000 como a foto de teste s13 da Onda 1: terço esquerdo VERMELHO, resto AZUL, uma caixa
 * branca perto da borda esquerda. Com Orientation=6 a borda esquerda vai para o TOPO: a foto certa mostra
 * vermelho em cima e azul embaixo, 2000×3000 (retrato).
 */
export async function makeExifJpegOnPage(page, { width = 3000, height = 2000, quality = 0.85 } = {}) {
  const base64 = await page.evaluate(async ({ width, height, quality }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#1565c0'; g.fillRect(0, 0, width, height);
    g.fillStyle = '#d32f2f'; g.fillRect(0, 0, Math.round(width / 3), height);
    g.fillStyle = '#ffffff'; g.fillRect(Math.round(width * 0.067), Math.round(height * 0.05), Math.round(width * 0.13), Math.round(height * 0.15));
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }, { width, height, quality });
  return withOrientation6(Buffer.from(base64, 'base64'));
}

/**
 * "Foto grande" da J13: 6000×4000 com textura (gradiente + ruído por pixel) para o JPEG pesar 2–4 MB, como
 * uma foto real de celular. Ajusta a amplitude do ruído e a qualidade até cair na faixa. Sem EXIF.
 * Devolve { bytes, width, height, quality, noise, attempts, ms }.
 */
export async function makeLargeJpegOnPage(page, { width = 6000, height = 4000, minBytes = 2_000_000, maxBytes = 4_000_000 } = {}) {
  const startedAt = Date.now();
  const attempts = [];
  const plans = [[12, 0.85], [20, 0.85], [32, 0.85], [48, 0.85], [64, 0.9], [96, 0.9], [8, 0.8], [6, 0.7], [4, 0.6], [3, 0.5]];
  let best;
  const middle = (minBytes + maxBytes) / 2;
  for (const [noise, quality] of plans) {
    const base64 = await page.evaluate(async ({ width, height, noise, quality }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      const image = g.createImageData(width, height);
      const data = image.data;
      let seed = 12345;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let y = 0; y < height; y += 1) {
        const ry = y / height;
        for (let x = 0; x < width; x += 1) {
          const rx = x / width;
          const i = (y * width + x) * 4;
          data[i] = Math.max(0, Math.min(255, 60 + 160 * rx + (rnd() - 0.5) * noise));
          data[i + 1] = Math.max(0, Math.min(255, 90 + 120 * ry + (rnd() - 0.5) * noise));
          data[i + 2] = Math.max(0, Math.min(255, 180 - 100 * rx * ry + (rnd() - 0.5) * noise));
          data[i + 3] = 255;
        }
      }
      g.putImageData(image, 0, 0);
      // Um "produto" no meio, para a foto ter um assunto reconhecível na prévia.
      g.fillStyle = '#f5f5f5'; g.fillRect(width * 0.3, height * 0.25, width * 0.4, height * 0.5);
      g.fillStyle = '#1b2a41'; g.fillRect(width * 0.42, height * 0.3, width * 0.16, height * 0.4);
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const chunk = 0x8000;
      let s = '';
      for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      return btoa(s);
    }, { width, height, noise, quality });
    const bytes = Buffer.from(base64, 'base64');
    attempts.push({ noise, quality, bytes: bytes.length });
    if (!best || Math.abs(bytes.length - middle) < Math.abs(best.bytes.length - middle)) best = { bytes, noise, quality };
    if (bytes.length >= minBytes && bytes.length <= maxBytes) { best = { bytes, noise, quality }; break; }
  }
  return { ...best, width, height, attempts, ms: Date.now() - startedAt };
}

/** Garante os dois arquivos pequenos em fixtures/photos/ (gera com um Chromium próprio se faltarem). */
export async function ensurePhotoFixtures({ force = false } = {}) {
  await mkdir(PHOTOS_DIR, { recursive: true });
  const made = [];
  if (force || !existsSync(FAKE_HEIC)) { await writeFile(FAKE_HEIC, fakeHeicBytes()); made.push(FAKE_HEIC); }
  if (force || !existsSync(EXIF6_JPEG)) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto('about:blank');
      await writeFile(EXIF6_JPEG, await makeExifJpegOnPage(page));
      made.push(EXIF6_JPEG);
    } finally {
      await browser.close();
    }
  }
  return { jpeg: EXIF6_JPEG, heic: FAKE_HEIC, made };
}

/** Lê as marcas de um JPEG até o SOS: tamanho real (SOF) e se há APP1 com Orientation. */
export function inspectJpeg(bytes) {
  const segments = [];
  let i = 2; let sof = null; let orientation = null;
  while (i < bytes.length - 4) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    segments.push(marker.toString(16));
    if (marker >= 0xc0 && marker <= 0xc2) sof = { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    if (marker === 0xe1) {
      const segment = bytes.subarray(i + 4, i + 2 + length);
      for (let k = 0; k < segment.length - 10; k += 1) {
        if ((segment[k] === 0x01 && segment[k + 1] === 0x12) || (segment[k] === 0x12 && segment[k + 1] === 0x01)) {
          orientation = Array.from(segment.subarray(k, k + 12)); break;
        }
      }
    }
    if (marker === 0xda) break;
    i += 2 + length;
  }
  return { size: bytes.length, segments, sof, orientationEntry: orientation };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await ensurePhotoFixtures({ force: true });
  console.log(JSON.stringify(out, null, 2));
}
