import { describe, expect, it } from 'vitest';
import { mmToU, plainRichText, type EditorialObject, type ImageObject, type Page } from '@/vnext/domain';
import {
  coveringObjectsAbove, groupRefusal, imageTransparentAt, isPageBackground, layerName, layerPosition, layersTopFirst,
  nextObjectBelow, objectsAtPoint, objectsInsideRect, resolvePlainClickTarget, sendToBackTarget, shortFileName, type AlphaMask,
} from '@/vnext/editor/object-layers';

const pt = (xMm: number, yMm: number) => ({ xU: mmToU(xMm), yU: mmToU(yMm) });
const image = (id: string, zIndex: number, frame = { xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 }, extra: Partial<ImageObject> = {}): ImageObject =>
  ({ id, type: 'image', frame, zIndex, assetId: 'asset-' + id, fit: 'cover', ...extra });
const text = (id: string, zIndex: number, words: string, frame = { xMm: 20, yMm: 20, widthMm: 60, heightMm: 10 }): EditorialObject =>
  ({ id, type: 'text', frame, zIndex, text: plainRichText(id + ':t', words), style: {} });
const page = (objects: EditorialObject[]): Page => ({ id: 'p', widthMm: 210, heightMm: 297, objects });

/** The PCON covers: plate (full page) → photo → overlay (full page PNG with callouts) → texts, all texts on the same z. */
const cover = () => page([
  image('plate', 0),
  image('photo', 1, { xMm: 40, yMm: 90, widthMm: 130, heightMm: 120 }),
  image('overlay', 2),
  text('title', 3, 'PRESYS DOIS MEIOS UMA PLATAFORMA HÍBRIDA'),
  text('pill', 3, '0 a 250 psi', { xMm: 30, yMm: 230, widthMm: 17, heightMm: 4 }),
]);

describe('Onda 3.5 · layers and hit testing (pure)', () => {
  it('lists the layers with the front object first and reports the position counted from the back', () => {
    expect(layersTopFirst(cover()).map((object) => object.id)).toEqual(['pill', 'title', 'overlay', 'photo', 'plate']);
    expect(layerPosition(cover(), 'photo')).toEqual({ position: 2, count: 5 });
  });

  it('lets a click through the transparent part of the full-page overlay to the photo, but not through painted pixels', () => {
    const p = cover();
    const stack = objectsAtPoint(p, pt(100, 150));
    expect(stack.map((object) => object.id)).toEqual(['overlay', 'photo', 'plate']);
    const transparentOverlay = (object: EditorialObject) => object.id === 'overlay';
    expect(resolvePlainClickTarget(stack, transparentOverlay, pt(100, 150))?.id).toBe('photo');
    expect(resolvePlainClickTarget(stack, () => false, pt(100, 150))?.id).toBe('overlay');
    // Hidden objects are not under the pointer at all.
    const hidden = page(p.objects.map((object) => object.id === 'overlay' ? { ...object, hidden: true } : object));
    expect(objectsAtPoint(hidden, pt(100, 150)).map((object) => object.id)).toEqual(['photo', 'plate']);
  });

  it('a locked object lets the click through to an unlocked one below; alone, it is still reachable', () => {
    const p = page(cover().objects.map((object) => object.id === 'overlay' ? { ...object, locked: true } : object));
    const stack = objectsAtPoint(p, pt(100, 150));
    expect(resolvePlainClickTarget(stack, () => false, pt(100, 150))?.id).toBe('photo');
    const onlyLocked = page([{ ...image('plate', 0), locked: true }]);
    expect(resolvePlainClickTarget(objectsAtPoint(onlyLocked, pt(5, 5)), () => false, pt(5, 5))?.id).toBe('plate');
  });

  it('Alt+click cycles through everything under the pointer, top to bottom, and wraps', () => {
    const stack = objectsAtPoint(cover(), pt(100, 150));
    expect(nextObjectBelow(stack, undefined)?.id).toBe('overlay');
    expect(nextObjectBelow(stack, 'overlay')?.id).toBe('photo');
    expect(nextObjectBelow(stack, 'photo')?.id).toBe('plate');
    expect(nextObjectBelow(stack, 'plate')?.id).toBe('overlay');
    expect(nextObjectBelow([], 'x')).toBeUndefined();
  });

  it('the selection box takes only visible, unlocked objects completely inside it', () => {
    const p = page([...cover().objects, { ...text('locked', 3, 'x', { xMm: 25, yMm: 225, widthMm: 5, heightMm: 5 }), locked: true }]);
    const box = { xU: mmToU(10), yU: mmToU(10), widthU: mmToU(100), heightU: mmToU(240) };
    expect(objectsInsideRect(p, box)).toEqual(['title', 'pill']);
  });

  it('recognises page backgrounds and keeps "Enviar ao fundo" in front of them', () => {
    const p = cover();
    expect(isPageBackground(p.objects[0], p)).toBe(true);
    expect(isPageBackground(p.objects[1], p)).toBe(false);
    expect(sendToBackTarget(p, 'title')).toEqual({ targetIndex: 3, keptAbove: p.objects[2] });
    expect(sendToBackTarget(p, 'photo')).toEqual({ targetIndex: 1, keptAbove: p.objects[0] });
    expect(sendToBackTarget(p, 'overlay')).toEqual({ targetIndex: 0 });
    expect(sendToBackTarget(page([text('a', 0, 'a'), text('b', 1, 'b')]), 'b')).toEqual({ targetIndex: 0 });
  });

  it('warns about images that fully cover an object after a reorder', () => {
    const p = page([text('title', 0, 'Título'), image('plate', 1)]);
    expect(coveringObjectsAbove(p, 'title').map((object) => object.id)).toEqual(['plate']);
    expect(coveringObjectsAbove(cover(), 'title')).toEqual([]);
  });

  it('gives each layer a name a person recognises', () => {
    const doc = { assets: [{ id: 'asset-plate', name: 'hibrido-plate.png' }] } as never;
    const p = cover();
    expect(layerName(p.objects[0], doc)).toBe('Imagem hibrido-plate.png');
    expect(layerName(p.objects[0], doc, p)).toBe('Página inteira hibrido-plate.png');
    expect(shortFileName('pcon-hibrido-PCON-HIBRIDO.overlay-300ppi.png')).toBe('…RIDO.overlay-300ppi.png');
    expect(shortFileName('fotos/logo.png')).toBe('logo.png');
    expect(layerName(p.objects[1], doc)).toBe('Imagem');
    expect(layerName(p.objects[3], doc)).toBe('Texto “PRESYS DOIS MEIOS UMA PLATAFORMA…”');
    expect(layerName({ id: 'g', type: 'group', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 }, objects: [p.objects[3] as never, p.objects[4] as never] }, doc))
      .toBe('Grupo (2 objetos)');
  });

  it('reads the alpha mask the way the image is drawn (contain letterbox, cover with focal point)', () => {
    // 4×2 mask: left half transparent, right half painted.
    const mask: AlphaMask = { width: 4, height: 2, alpha: Uint8Array.from([0, 0, 255, 255, 0, 0, 255, 255]) };
    const contain = image('c', 0, { xMm: 0, yMm: 0, widthMm: 40, heightMm: 40 }, { fit: 'contain' });
    // drawn 40×20 mm, centred: rows 0–10 mm and 30–40 mm are letterbox.
    expect(imageTransparentAt(contain, mask, pt(30, 5), 0)).toBe(true);
    expect(imageTransparentAt(contain, mask, pt(30, 20), 0)).toBe(false);
    expect(imageTransparentAt(contain, mask, pt(5, 20), 0)).toBe(true);
    // A thin line next to the point still counts (radius).
    expect(imageTransparentAt(contain, mask, pt(18, 20), 1)).toBe(false);
    const cover = image('k', 0, { xMm: 0, yMm: 0, widthMm: 20, heightMm: 20 }, { fit: 'cover', focalPoint: { x: 0, y: 0.5 } });
    // cover: drawn 40×20 mm aligned left (focal x = 0) → the visible part is the transparent left half.
    expect(imageTransparentAt(cover, mask, pt(15, 10), 0)).toBe(true);
    const coverRight = { ...cover, focalPoint: { x: 1, y: 0.5 } };
    expect(imageTransparentAt(coverRight, mask, pt(15, 10), 0)).toBe(false);
  });

  it('explains in plain words why a selection cannot be grouped', () => {
    const p = page([text('a', 0, 'a'), { ...text('b', 1, 'b'), locked: true }, text('c', 2, 'c')]);
    expect(groupRefusal(p, ['a'])).toBe('Selecione pelo menos dois objetos para agrupar.');
    expect(groupRefusal(p, ['a', 'b'])).toMatch(/travado/);
    expect(groupRefusal(p, ['a', 'c'])).toBeUndefined();
    expect(groupRefusal(p, ['a', 'zz'])).toMatch(/não está mais nesta página/);
  });
});
