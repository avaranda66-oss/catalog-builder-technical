import { plainRichText, type CatalogDocument, type DocumentStyle, type EditorialObject, type Frame, type Page, type TableModel } from '../domain';
import { presysDocumentStyle } from '../library/presys-archetypes';
import { collectArsenalPayloadAssetIds, type ArsenalPreset, type ArsenalStyle } from './contracts';
import type { ArsenalPreview, ArsenalPreviewBuilder } from './preview';
import { arsenalContentBoxMm, translateFrame } from './arsenal-geometry';
import { materializeArsenalObjects, materializeArsenalTable } from './arsenal-insertion';
import { tableStyleWithDeclaredFonts, textStyleWithDeclaredFonts } from './arsenal-content';

/**
 * Onda 4.5 — what a preset card draws (ADR-arsenal §5): a synthetic A4 page drawn live by the same renderer that
 * prints (`PageThumbnail`), never a stored picture.
 * - `page`: the page itself;
 * - `block`: a blank page with the block at its source frame; `focusMm` = that frame;
 * - `table`: the table at the top of the safe area; `focusMm` = its frame;
 * - `style`: a sample ("Aa Texto de exemplo", a box, a polygon, a line or a small table) wearing the style.
 * Pictures the viewer cannot load are drawn as the "Foto a escolher" frame, as the insertion would leave them, and
 * fonts the preview catalog does not declare fall back to its own (same rules as the insertion).
 */

const PREVIEW_SAFE_AREA = Object.freeze({ topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 });

export interface ArsenalPreviewOptions {
  /** Images the viewer can draw (asset id → URL). Any other picture becomes the "Foto a escolher" frame. */
  readonly assetUrls?: ReadonlyMap<string, string>;
  /** Fonts and default text of the preview; the open catalog's style when there is one, else the PRESYS style. */
  readonly documentStyle?: DocumentStyle;
}

/** The catalog the preview page belongs to: no automatic footer (a preset is not a page of any catalog yet). */
export function arsenalPreviewDocument(preset: ArsenalPreset, options: ArsenalPreviewOptions = {}): CatalogDocument {
  const { pageFooter: _footer, ...style } = options.documentStyle ?? presysDocumentStyle();
  const urls = options.assetUrls ?? new Map<string, string>();
  const assets = preset.payload.kind === 'style' ? [] : preset.payload.assets.filter((asset) => urls.has(asset.id));
  const page: Page = { id: previewPageId(preset), widthMm: 210, heightMm: 297, objects: [] };
  return { schemaVersion: 1, id: `arsenal-preview:${preset.id}`, title: preset.name, locale: 'pt-BR', style, pages: [page], assets };
}

function previewPageId(preset: ArsenalPreset): string {
  return `arsenal-preview-page:${preset.id}:${preset.revision}`;
}

function unavailableIn(preset: ArsenalPreset, urls: ReadonlyMap<string, string>): Set<string> {
  return new Set(collectArsenalPayloadAssetIds(preset.payload).filter((id) => !urls.has(id)));
}

function sampleTable(style: ArsenalStyle & { target: 'table' }, documentStyle: DocumentStyle): TableModel {
  const columns = ['c1', 'c2', 'c3'].map((id) => ({ id: `amostra:${id}`, width: { mode: 'flex' as const, weight: 1 }, minMm: 10 }));
  const rows = [
    { id: 'amostra:r1', role: 'header' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: 'amostra:r2', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: 'amostra:r3', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
  ];
  const words = [['Modelo', 'Faixa', 'Exatidão'], ['A', 'B', 'C'], ['D', 'E', 'F']];
  return {
    id: 'amostra:tabela',
    columns,
    rows,
    cells: rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => {
      const id = `amostra:${rowIndex}-${columnIndex}`;
      return { id, rowId: row.id, columnId: column.id, content: { type: 'richText' as const, value: plainRichText(id, words[rowIndex][columnIndex]) } };
    })),
    style: tableStyleWithDeclaredFonts(style.table, documentStyle),
    annotations: [],
    legend: [],
  };
}

/** The sample object a style preset is drawn on. */
function styleSample(style: ArsenalStyle, documentStyle: DocumentStyle): EditorialObject {
  const left = PREVIEW_SAFE_AREA.leftMm + 8, top = PREVIEW_SAFE_AREA.topMm + 8;
  switch (style.target) {
    case 'text': {
      const text = textStyleWithDeclaredFonts(style.text, documentStyle);
      const sizePt = text.fontSizePt ?? documentStyle.defaultText.fontSizePt ?? 10;
      const lineMm = sizePt * (text.lineHeight ?? 1.2) * 0.3528;
      const pad = style.box ? style.box.paddingMm * 2 : 0;
      return {
        id: 'amostra:texto', type: 'text', zIndex: 0,
        frame: { xMm: left, yMm: top, widthMm: 150, heightMm: Math.max(6, Math.ceil(lineMm + pad + 2)) },
        text: plainRichText('amostra:texto', 'Aa Texto de exemplo'), style: text,
        ...(style.box ? { box: { ...style.box } } : {}),
      };
    }
    case 'shape':
      return { id: 'amostra:forma', type: 'shape', shape: 'rectangle', zIndex: 0, frame: { xMm: left, yMm: top, widthMm: 80, heightMm: 50 }, style: { ...style.shape } };
    case 'polygon':
      return {
        id: 'amostra:poligono', type: 'polygon', zIndex: 0, frame: { xMm: left, yMm: top, widthMm: 80, heightMm: 50 },
        points: [{ x: 0.15, y: 0 }, { x: 1, y: 0 }, { x: 0.85, y: 1 }, { x: 0, y: 1 }], style: { ...style.polygon },
      };
    case 'line':
      return {
        id: 'amostra:linha', type: 'line', axis: 'horizontal', zIndex: 0,
        frame: { xMm: left, yMm: top + 10, widthMm: 120, heightMm: Math.max(0.3, Math.round((style.line.thicknessPt ?? 0.75) * 0.3528 * 100) / 100) },
        ...style.line,
      };
    case 'table':
      return { id: 'amostra:tabela-objeto', type: 'table', zIndex: 0, frame: { xMm: left, yMm: top, widthMm: 120, heightMm: 24 }, table: sampleTable(style, documentStyle) };
  }
}

/** Builds the preview of one preset (pure; the card memoizes it). */
export function buildArsenalPreview(preset: ArsenalPreset, options: ArsenalPreviewOptions = {}): ArsenalPreview {
  const urls = options.assetUrls ?? new Map<string, string>();
  const document = arsenalPreviewDocument(preset, options);
  const unavailable = unavailableIn(preset, urls);
  const base: Page = { id: previewPageId(preset), widthMm: 210, heightMm: 297, safeArea: { ...PREVIEW_SAFE_AREA }, objects: [] };
  const { payload } = preset;
  switch (payload.kind) {
    case 'page': {
      const background = payload.background?.image && unavailable.has(payload.background.image.assetId)
        ? (payload.background.color === undefined ? undefined : { color: payload.background.color })
        : payload.background;
      const objects = materializeArsenalObjects(payload.objects, document, unavailable);
      const { safeArea: _safe, ...rest } = base;
      return {
        page: {
          ...rest,
          ...(payload.safeArea ? { safeArea: { ...payload.safeArea } } : {}),
          ...(background ? { background: { ...background } } : {}),
          objects,
        },
      };
    }
    case 'block': {
      const objects = materializeArsenalObjects(payload.objects, document, unavailable);
      const placed = objects.map((object) => ({ ...object, frame: translateFrame(object.frame, payload.frame.xMm, payload.frame.yMm) }));
      return { page: { ...base, objects: placed }, focusMm: { ...payload.frame } };
    }
    case 'table': {
      const box = arsenalContentBoxMm(base, undefined, 1);
      const frame: Frame = {
        xMm: box.xMm, yMm: box.yMm,
        widthMm: Math.min(payload.sizeMm.widthMm, box.widthMm), heightMm: Math.min(payload.sizeMm.heightMm, box.heightMm),
      };
      const table = materializeArsenalTable(payload.table, document, unavailable);
      return { page: { ...base, objects: [{ id: 'amostra:tabela-preset', type: 'table', zIndex: 0, frame, table }] }, focusMm: frame };
    }
    case 'style': {
      const sample = styleSample(payload.style, document.style);
      return { page: { ...base, objects: [sample] }, focusMm: { ...sample.frame } };
    }
  }
}

/** A builder bound to the viewer's images and the open catalog's style, as `ArsenalPreviewBuilder` expects. */
export function createArsenalPreviewBuilder(options: ArsenalPreviewOptions = {}): ArsenalPreviewBuilder {
  const cache = new WeakMap<ArsenalPreset, ArsenalPreview>();
  return (preset) => {
    const cached = cache.get(preset);
    if (cached) return cached;
    const preview = buildArsenalPreview(preset, options);
    cache.set(preset, preview);
    return preview;
  };
}

/**
 * The part of the page a card shows (mm, page coordinates): `focus` with a margin (the whole sheet when there is no
 * focus), widened to the card's proportions (width / height). It stays on the sheet when it fits there; when it
 * is larger (a whole page in a wide card) it is centred and the card shows a border around the sheet.
 */
export function arsenalPreviewViewport(focus: Frame | undefined, aspectRatio: number, marginMm = 6): Frame {
  const sheet = { xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 };
  const ratio = aspectRatio > 0 && Number.isFinite(aspectRatio) ? aspectRatio : 210 / 297;
  const margin = focus ? marginMm : 0;
  const area = focus ?? sheet;
  const left = Math.max(0, area.xMm - margin), top = Math.max(0, area.yMm - margin);
  const right = Math.min(210, area.xMm + area.widthMm + margin), bottom = Math.min(297, area.yMm + area.heightMm + margin);
  let widthMm = Math.max(1, right - left), heightMm = Math.max(1, bottom - top);
  if (widthMm / heightMm > ratio) heightMm = widthMm / ratio;
  else widthMm = heightMm * ratio;
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  const place = (center: number, size: number, sheetSize: number) =>
    size > sheetSize ? center - size / 2 : Math.min(Math.max(0, center - size / 2), sheetSize - size);
  return { xMm: place(centerX, widthMm, 210), yMm: place(centerY, heightMm, 297), widthMm, heightMm };
}
