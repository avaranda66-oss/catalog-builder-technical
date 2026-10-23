import { describe, expect, it, vi } from 'vitest';
import { HEIC_PHOTO_MESSAGE, type ImageReencoder } from '@/vnext/asset/normalize-image';
import { prepareSketchImage, sketchUploadName } from '@/vnext/ai-catalog/sketch-image';
import { pngBytes } from './sketch-fixtures';

const file = (bytes: Uint8Array, name: string, type = '') => new File([bytes.slice().buffer as ArrayBuffer], name, { type });
/** A HEIC (iPhone) header: ftyp box with the heic brand. */
const heic = () => new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0, 109, 105, 102, 49, 104, 101, 105, 99]);

describe('foto do rascunho preparada no computador', () => {
  it('keeps a photo that is already upright and up to 1600 px, with its real kind in the name', async () => {
    const prepared = await prepareSketchImage(file(pngBytes(1131, 1600), 'Capa do rascunho.PNG'), { reencoder: null });
    expect(prepared).toMatchObject({ ok: true, name: 'Capa do rascunho.png', type: 'image/png', width: 1131, height: 1600 });
    expect(sketchUploadName('rascunho.webp', 'image/jpeg')).toBe('rascunho.jpg');
    expect(sketchUploadName('.heic', 'image/png')).toBe('rascunho.png');
  });

  it('reduces a large photo to 1600 px on the longest side before anything is sent', async () => {
    const reencode = vi.fn<ImageReencoder['reencode']>(async () => pngBytes(1131, 1600));
    const prepared = await prepareSketchImage(file(pngBytes(1240, 1754), 'rascunho.png'), { reencoder: { reencode } });
    expect(reencode).toHaveBeenCalledWith(expect.objectContaining({ maxLongSidePx: 1600 }));
    expect(prepared).toMatchObject({ ok: true, width: 1131, height: 1600 });
  });

  it('says in plain words when it cannot use the photo, before sending anything', async () => {
    const iphone = await prepareSketchImage(file(heic(), 'IMG_0001.HEIC', 'image/heic'), { reencoder: null });
    expect(iphone).toEqual({ ok: false, message: `${HEIC_PHOTO_MESSAGE} Nada foi alterado no catálogo.` });
    const big = await prepareSketchImage(file(pngBytes(4032, 3024), 'grande.png'), { reencoder: null });
    expect(big.ok).toBe(false);
    expect(!big.ok && big.message).toMatch(/^Este navegador não conseguiu reduzir a foto grande\.png\. Use uma foto de até 1600 pixels/);
    const text = await prepareSketchImage(file(new TextEncoder().encode('não é foto'), 'nota.jpg'), { reencoder: null });
    expect(!text.ok && text.message).toBe('O arquivo nota.jpg não é uma foto que o aplicativo consegue abrir. Use uma foto em JPG ou PNG. Nada foi alterado no catálogo.');
  });
});
