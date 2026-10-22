import type { CatalogDocument, EditorialObject, ImageObject, Page, RichText } from '../domain/editorial-model';
import { visualPageObjects } from '../domain/object-tree';
import { mmToU } from '../domain/physical';

/**
 * Onda 3.5 (S1): layers, hit testing and multiple selection, as plain functions over the canonical page.
 * Everything here is in canonical units (U) and top-level objects, the same objects the editor selects.
 */
export interface PointU { xU: number; yU: number }
export interface RectU { xU: number; yU: number; widthU: number; heightU: number }

const frameU = (object: EditorialObject): RectU => ({
  xU: mmToU(object.frame.xMm), yU: mmToU(object.frame.yMm), widthU: mmToU(object.frame.widthMm), heightU: mmToU(object.frame.heightMm),
});

export function objectClosureLocked(object: EditorialObject): boolean {
  return Boolean(object.locked || (object.type === 'group' && object.objects.some((child) => child.locked)));
}

/** Top-level objects in stacking order, the object on top first (the order shown in "Camadas"). */
export function layersTopFirst(page: Page): EditorialObject[] {
  return visualPageObjects(page).map((entry) => entry.object).reverse();
}

/** 1 = the object at the very back. */
export function layerPosition(page: Page, objectId: string): { position: number; count: number } | undefined {
  const visual = visualPageObjects(page);
  const index = visual.findIndex((entry) => entry.object.id === objectId);
  return index < 0 ? undefined : { position: index + 1, count: visual.length };
}

export function rectContainsPoint(rect: RectU, point: PointU): boolean {
  return point.xU >= rect.xU && point.yU >= rect.yU && point.xU <= rect.xU + rect.widthU && point.yU <= rect.yU + rect.heightU;
}

/** Visible top-level objects whose box contains the point, the one on top first. */
export function objectsAtPoint(page: Page, point: PointU): EditorialObject[] {
  return layersTopFirst(page).filter((object) => !object.hidden && rectContainsPoint(frameU(object), point));
}

/** True when the object paints nothing at that point (only images can say so: transparent pixels or letterbox). */
export type TransparencyProbe = (object: EditorialObject, point: PointU) => boolean;

/**
 * What a plain click reaches. Transparent parts of an image (a full-page PNG with callout lines, for example) let
 * the click through, and a locked object lets it through to an unlocked one below: locking the background makes
 * it stop catching clicks. When nothing qualifies, the object on top is chosen (it can then be unlocked).
 */
export function resolvePlainClickTarget(stack: readonly EditorialObject[], isTransparent: TransparencyProbe, point: PointU): EditorialObject | undefined {
  const painted = stack.filter((object) => !isTransparent(object, point));
  return painted.find((object) => !objectClosureLocked(object)) ?? painted[0] ?? stack[0];
}

/** Alt+click: the object right below the selected one under the pointer; from the bottom it wraps to the top. */
export function nextObjectBelow(stack: readonly EditorialObject[], currentId: string | undefined): EditorialObject | undefined {
  if (stack.length === 0) return undefined;
  const index = currentId ? stack.findIndex((object) => object.id === currentId) : -1;
  return index < 0 ? stack[0] : stack[(index + 1) % stack.length];
}

export function normalizeRect(a: PointU, b: PointU): RectU {
  return { xU: Math.min(a.xU, b.xU), yU: Math.min(a.yU, b.yU), widthU: Math.abs(a.xU - b.xU), heightU: Math.abs(a.yU - b.yU) };
}

/** Selection box: visible, unlocked objects that are completely inside it (as in PowerPoint), in stacking order. */
export function objectsInsideRect(page: Page, rect: RectU): string[] {
  return visualPageObjects(page)
    .map((entry) => entry.object)
    .filter((object) => {
      if (object.hidden || objectClosureLocked(object)) return false;
      const f = frameU(object);
      return f.xU >= rect.xU && f.yU >= rect.yU && f.xU + f.widthU <= rect.xU + rect.widthU && f.yU + f.heightU <= rect.yU + rect.heightU;
    })
    .map((object) => object.id);
}

/** An image or shape covering at least 90% of the page: the page background (plates, full-page overlays). */
export function isPageBackground(object: EditorialObject, page: Page): boolean {
  if (object.type !== 'image' && object.type !== 'shape') return false;
  const f = object.frame;
  const left = Math.max(0, f.xMm), top = Math.max(0, f.yMm);
  const right = Math.min(page.widthMm, f.xMm + f.widthMm), bottom = Math.min(page.heightMm, f.yMm + f.heightMm);
  const covered = Math.max(0, right - left) * Math.max(0, bottom - top);
  return covered >= 0.9 * page.widthMm * page.heightMm;
}

/**
 * "Enviar ao fundo" without making the object vanish: it goes behind everything except the page backgrounds that
 * are already below it. A background itself goes to the very back.
 */
export function sendToBackTarget(page: Page, objectId: string): { targetIndex: number; keptAbove?: EditorialObject } {
  const visual = visualPageObjects(page);
  const current = visual.findIndex((entry) => entry.object.id === objectId);
  if (current < 0 || isPageBackground(visual[current].object, page)) return { targetIndex: 0 };
  let highest = -1;
  for (let index = 0; index < current; index += 1) if (isPageBackground(visual[index].object, page)) highest = index;
  return highest < 0 ? { targetIndex: 0 } : { targetIndex: highest + 1, keptAbove: visual[highest].object };
}

/** Images or filled shapes above the object that cover it completely: after a reorder it may be out of sight. */
export function coveringObjectsAbove(page: Page, objectId: string): EditorialObject[] {
  const visual = visualPageObjects(page);
  const index = visual.findIndex((entry) => entry.object.id === objectId);
  if (index < 0) return [];
  const target = frameU(visual[index].object);
  return visual.slice(index + 1).map((entry) => entry.object).filter((object) => {
    if (object.hidden) return false;
    if (object.type !== 'image' && !(object.type === 'shape' && object.style.fill)) return false;
    const f = frameU(object);
    return f.xU <= target.xU && f.yU <= target.yU && f.xU + f.widthU >= target.xU + target.widthU && f.yU + f.heightU >= target.yU + target.heightU;
  });
}

function plainWords(text: RichText, limit = 5): string {
  const words = text.paragraphs
    .flatMap((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : ' '))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, limit).join(' ') + (words.length > limit ? '…' : '');
}

/** A name a person recognizes in "Camadas": the kind of object and its first words or its file name. */
export function layerName(object: EditorialObject, document: Pick<CatalogDocument, 'assets'>): string {
  switch (object.type) {
    case 'text': {
      const words = plainWords(object.text);
      return words ? `Texto “${words}”` : 'Texto vazio';
    }
    case 'image': {
      const name = document.assets.find((asset) => asset.id === object.assetId)?.name;
      return name ? `Imagem ${name}` : 'Imagem';
    }
    case 'table': {
      const title = object.table.title ? plainWords(object.table.title, 4) : '';
      return title ? `Tabela “${title}”` : 'Tabela';
    }
    case 'shape':
      return object.shape === 'ellipse' ? 'Forma (elipse)' : 'Forma (retângulo)';
    case 'line':
      return object.axis === 'vertical' ? 'Linha vertical' : 'Linha horizontal';
    case 'icon':
      return 'Ícone';
    case 'group':
      return `Grupo (${object.objects.length} objetos)`;
  }
}

/** An alpha channel sampled from an image file, row by row (0 = fully transparent). */
export interface AlphaMask { width: number; height: number; alpha: Uint8Array | Uint8ClampedArray }

/**
 * Whether an image paints nothing at `point`, given its alpha mask. Follows the renderer exactly:
 * object-fit contain (centered) or cover (focal point), so letterbox areas of "contain" are transparent too.
 * A few mask pixels around the point count, so a thin callout line is still easy to hit.
 */
export function imageTransparentAt(object: ImageObject, mask: AlphaMask, point: PointU, radiusPx = 2, threshold = 24): boolean {
  const f = frameU(object);
  if (f.widthU <= 0 || f.heightU <= 0 || mask.width <= 0 || mask.height <= 0) return false;
  const scale = object.fit === 'contain'
    ? Math.min(f.widthU / mask.width, f.heightU / mask.height)
    : Math.max(f.widthU / mask.width, f.heightU / mask.height);
  const drawnW = mask.width * scale, drawnH = mask.height * scale;
  const focal = object.fit === 'contain' ? { x: 0.5, y: 0.5 } : object.focalPoint ?? { x: 0.5, y: 0.5 };
  const offsetX = (f.widthU - drawnW) * focal.x, offsetY = (f.heightU - drawnH) * focal.y;
  const u = (point.xU - f.xU - offsetX) / drawnW, v = (point.yU - f.yU - offsetY) / drawnH;
  if (u < 0 || v < 0 || u > 1 || v > 1) return true;
  const cx = Math.min(mask.width - 1, Math.floor(u * mask.width)), cy = Math.min(mask.height - 1, Math.floor(v * mask.height));
  for (let y = Math.max(0, cy - radiusPx); y <= Math.min(mask.height - 1, cy + radiusPx); y += 1) {
    for (let x = Math.max(0, cx - radiusPx); x <= Math.min(mask.width - 1, cx + radiusPx); x += 1) {
      if (mask.alpha[y * mask.width + x] >= threshold) return false;
    }
  }
  return true;
}

/** Plain-words reason why the selection cannot become a group (undefined = it can). */
export function groupRefusal(page: Page, objectIds: readonly string[]): string | undefined {
  if (objectIds.length < 2) return 'Selecione pelo menos dois objetos para agrupar.';
  const objects = objectIds.map((id) => page.objects.find((object) => object.id === id));
  if (objects.some((object) => !object)) return 'Algum objeto selecionado não está mais nesta página. Selecione de novo.';
  const present = objects as EditorialObject[];
  if (present.some((object) => object.type === 'group')) return 'Um dos objetos já é um grupo. Desagrupe-o primeiro e depois agrupe tudo junto.';
  if (present.some((object) => object.locked)) return 'Um dos objetos está travado. Destrave-o (cadeado em Camadas) e tente de novo.';
  return undefined;
}
