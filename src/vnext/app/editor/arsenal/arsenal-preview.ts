import { plainRichText } from '../../../domain';
import type { AssetRef, EditorialObject, Frame, Page, TableModel } from '../../../domain';
import type { ArsenalPreset, ArsenalPreview, ArsenalPreviewBuilder, ArsenalStyle } from '../../../arsenal';
import type { PageThumbnailDocument } from '../PageThumbnail';

/**
 * Onda 4.5 — the picture of a preset (ADR-arsenal §5): a synthetic A4 page drawn live by the existing
 * `PageThumbnail` (screen = PDF), never a stored image.
 * - page: the page itself;
 * - block: a blank page with the block where it was captured (`focusMm` = its frame);
 * - table: the table at the top of the page (`focusMm` = its frame);
 * - style: a sample ("Aa", a box, a line or a small table) wearing the style.
 * The capture/insertion slice may supply its own builder through the runtime; this one is the default.
 */

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const TABLE_MARGIN_MM = 15;

function blankPage(id: string, objects: EditorialObject[], extra: Pick<Page, 'safeArea' | 'background'> = {}): Page {
  return {
    id,
    widthMm: PAGE_WIDTH_MM,
    heightMm: PAGE_HEIGHT_MM,
    ...(extra.safeArea ? { safeArea: extra.safeArea } : {}),
    ...(extra.background ? { background: extra.background } : {}),
    objects,
  };
}

function sampleTable(id: string, style: TableModel['style']): TableModel {
  const columns = [0, 1, 2].map((index) => ({ id: `${id}:c${index}`, width: { mode: 'flex' as const, weight: 1 }, minMm: 10 }));
  const rows = (['header', 'body', 'body'] as const).map((role, index) => ({
    id: `${id}:r${index}`, role, heightPolicy: { mode: 'AUTO' as const },
  }));
  const cells = rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => {
    const cellId = `${id}:r${rowIndex}c${columnIndex}`;
    return {
      id: cellId,
      rowId: row.id,
      columnId: column.id,
      content: rowIndex === 0 || columnIndex === 0
        ? { type: 'richText' as const, value: plainRichText(cellId, rowIndex === 0 ? `Título ${columnIndex + 1}` : `Linha ${rowIndex}`) }
        : { type: 'empty' as const },
    };
  }));
  return { id, columns, rows, cells, style, annotations: [], legend: [] };
}

function styleSample(id: string, style: ArsenalStyle): { object: EditorialObject; frame: Frame } {
  switch (style.target) {
    case 'text': {
      const frame = { xMm: 25, yMm: 30, widthMm: 160, heightMm: 26 };
      return {
        frame,
        object: {
          id, type: 'text', frame, zIndex: 0, text: plainRichText(id, 'Aa Título de exemplo'), style: style.text,
          ...(style.box ? { box: style.box } : {}),
        },
      };
    }
    case 'shape': {
      const frame = { xMm: 45, yMm: 30, widthMm: 120, heightMm: 70 };
      return { frame, object: { id, type: 'shape', frame, zIndex: 0, shape: 'rectangle', style: style.shape } };
    }
    case 'polygon': {
      const frame = { xMm: 55, yMm: 30, widthMm: 100, heightMm: 80 };
      return {
        frame,
        object: {
          id, type: 'polygon', frame, zIndex: 0, style: style.polygon,
          points: [{ x: 0.5, y: 0 }, { x: 1, y: 0.38 }, { x: 0.81, y: 1 }, { x: 0.19, y: 1 }, { x: 0, y: 0.38 }],
        },
      };
    }
    case 'line': {
      const frame = { xMm: 25, yMm: 50, widthMm: 160, heightMm: 2 };
      return {
        frame: { xMm: 25, yMm: 40, widthMm: 160, heightMm: 22 },
        object: {
          id, type: 'line', frame, zIndex: 0, axis: 'horizontal', color: style.line.color,
          ...(style.line.thicknessPt !== undefined ? { thicknessPt: style.line.thicknessPt } : {}),
          ...(style.line.dash ? { dash: style.line.dash } : {}),
          ...(style.line.opacity !== undefined ? { opacity: style.line.opacity } : {}),
        },
      };
    }
    case 'table': {
      const frame = { xMm: 25, yMm: 30, widthMm: 160, heightMm: 30 };
      return { frame, object: { id, type: 'table', frame, zIndex: 0, table: sampleTable(`${id}:table`, style.table) } };
    }
  }
}

/** The default builder of the gallery cards. */
export const buildArsenalPreview: ArsenalPreviewBuilder = (preset: ArsenalPreset): ArsenalPreview => {
  const pageId = `arsenal-preview:${preset.id}`;
  const { payload } = preset;
  switch (payload.kind) {
    case 'page':
      return { page: blankPage(pageId, payload.objects, { safeArea: payload.safeArea, background: payload.background }) };
    case 'block': {
      const { frame } = payload;
      const objects = payload.objects.map((object) => ({
        ...object,
        frame: { ...object.frame, xMm: frame.xMm + object.frame.xMm, yMm: frame.yMm + object.frame.yMm },
      })) as EditorialObject[];
      return { page: blankPage(pageId, objects), focusMm: frame };
    }
    case 'table': {
      const widthMm = Math.min(payload.sizeMm.widthMm, PAGE_WIDTH_MM);
      const xMm = widthMm <= PAGE_WIDTH_MM - 2 * TABLE_MARGIN_MM ? TABLE_MARGIN_MM : (PAGE_WIDTH_MM - widthMm) / 2;
      const frame = { xMm, yMm: TABLE_MARGIN_MM, widthMm, heightMm: Math.min(payload.sizeMm.heightMm, PAGE_HEIGHT_MM - TABLE_MARGIN_MM) };
      const object: EditorialObject = { id: `${pageId}:table`, type: 'table', frame, zIndex: 0, table: payload.table };
      return { page: blankPage(pageId, [object]), focusMm: frame };
    }
    case 'style': {
      const sample = styleSample(`${pageId}:sample`, payload.style);
      return { page: blankPage(pageId, [sample.object]), focusMm: sample.frame };
    }
  }
};

/**
 * The part of the page a card shows: the focus with a small margin, widened or heightened so the card is never a
 * thin strip (height between 0,4 and 1,414 of the width), kept inside the page. Whole page without a focus.
 */
export function arsenalPreviewViewport(focus: Frame | undefined): Frame {
  const whole = { xMm: 0, yMm: 0, widthMm: PAGE_WIDTH_MM, heightMm: PAGE_HEIGHT_MM };
  if (!focus) return whole;
  const margin = 6;
  let widthMm = Math.min(PAGE_WIDTH_MM, focus.widthMm + 2 * margin);
  let heightMm = Math.min(PAGE_HEIGHT_MM, focus.heightMm + 2 * margin);
  const minRatio = 0.4;
  const maxRatio = PAGE_HEIGHT_MM / PAGE_WIDTH_MM;
  if (heightMm / widthMm < minRatio) heightMm = Math.min(PAGE_HEIGHT_MM, widthMm * minRatio);
  if (heightMm / widthMm > maxRatio) widthMm = Math.min(PAGE_WIDTH_MM, heightMm / maxRatio);
  if (heightMm / widthMm > maxRatio) heightMm = widthMm * maxRatio;
  const centreX = focus.xMm + focus.widthMm / 2;
  const centreY = focus.yMm + focus.heightMm / 2;
  const clamp = (value: number, size: number, limit: number) => Math.min(Math.max(value, 0), Math.max(0, limit - size));
  return {
    xMm: clamp(centreX - widthMm / 2, widthMm, PAGE_WIDTH_MM),
    yMm: clamp(centreY - heightMm / 2, heightMm, PAGE_HEIGHT_MM),
    widthMm,
    heightMm,
  };
}

const PLACEHOLDER_STYLE = Object.freeze({
  fill: '#f1f5f9',
  stroke: Object.freeze({ pattern: 'solid' as const, thicknessPt: 0.75, color: '#94a3b8' }),
  strokeDash: 'dashed' as const,
});

function placeholderFor(object: Extract<EditorialObject, { type: 'image' | 'icon' }>): EditorialObject {
  return { id: object.id, type: 'shape', frame: object.frame, zIndex: object.zIndex, shape: 'rectangle', style: PLACEHOLDER_STYLE };
}

/**
 * Images whose address the viewer does not have draw as the "Foto a escolher" frame (a dashed box), like the
 * insertion would put them; a page background image without address is left out.
 */
export function withArsenalImagePlaceholders(page: Page, hasUrl: (assetId: string) => boolean): Page {
  let changed = false;
  const replaceLeaf = <T extends EditorialObject>(object: T): EditorialObject => {
    if ((object.type === 'image' || object.type === 'icon') && !hasUrl(object.assetId)) {
      changed = true;
      return placeholderFor(object);
    }
    return object;
  };
  const objects = page.objects.map((object) => object.type === 'group'
    ? { ...object, objects: object.objects.map((child) => replaceLeaf(child)) } as EditorialObject
    : replaceLeaf(object));
  let background = page.background;
  if (background?.image && !hasUrl(background.image.assetId)) {
    changed = true;
    background = background.color !== undefined ? { color: background.color } : undefined;
  }
  if (!changed) return page;
  const next: Page = { ...page, objects };
  if (background) next.background = background;
  else delete next.background;
  return next;
}

/** The open catalog's look (style, language) with the preset's images, so the renderer finds every asset. */
export function arsenalPreviewDocument(document: PageThumbnailDocument, presetAssets: readonly AssetRef[]): PageThumbnailDocument {
  if (presetAssets.length === 0) return document;
  const known = new Set(document.assets.map((asset) => asset.id));
  const extra = presetAssets.filter((asset) => !known.has(asset.id));
  return extra.length === 0 ? document : { ...document, assets: [...document.assets, ...extra] };
}

export function arsenalPayloadAssets(preset: Pick<ArsenalPreset, 'payload'>): readonly AssetRef[] {
  return preset.payload.kind === 'style' ? [] : preset.payload.assets;
}

