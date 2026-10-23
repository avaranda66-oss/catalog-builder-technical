import { projectEditableRichText } from '../application/text-editing';
import type { CatalogDocument, EditorialObject, Page, Paint, RichText } from '../domain';
import { layerName, layersTopFirst } from '../editor/object-layers';
import { effectiveTextStyle } from '../editor/text-style-authoring';
import {
  EDIT_INTENT_LIMITS, maskNumbers, type EditOutline, type OutlineObject, type OutlinePage,
} from './edit-intent-contract';

/**
 * FR-72: a compact picture of the open catalog for the conversation that edits
 * (`edit_intent`). The AI sees:
 * - every page as one line (ref p1.., number, main heading, object count);
 * - the objects of the OPEN page, in the order of "Camadas" (top first), with
 *   the same names the person sees there, short texts, sizes and colours.
 * Texts go with their numbers as markers ({{A}}, listed in `nums`), so the AI
 * can rewrite or translate around them without writing a digit itself.
 *
 * Refs (p1, o1...) are short and local to one request. The browser keeps the
 * map back to the real ids; the AI never sees or writes a document id.
 * Images, file names beyond the Camadas name, PDFs and credentials are never sent.
 */
export interface OutlineObjectRef { readonly pageId: string; readonly objectId: string; readonly groupId?: string }
export interface DocumentOutline {
  readonly outline: EditOutline;
  readonly pages: ReadonlyMap<string, string>;
  readonly objects: ReadonlyMap<string, OutlineObjectRef>;
  /** Document the outline was taken from (refs are meaningless for any other). */
  readonly documentId: string;
}
export interface DocumentOutlineOptions {
  readonly activePageId?: string;
  readonly selectedObjectIds?: readonly string[];
  /** JSON length the browser aims for (the server accepts up to EDIT_INTENT_LIMITS.outlineChars). */
  readonly maxChars?: number;
}
/** Leaves room for the message, the conversation and the instructions inside the 6 000-token input ceiling. */
export const OUTLINE_TARGET_CHARS = 9_000;

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (value: string, max: number) => value.length <= max ? value : value.slice(0, max - 1).trimEnd() + '…';
const hex = (value: string | undefined) => value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : undefined;
const round = (value: number) => Math.round(value);

function plainOf(text: RichText): string {
  return text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : ' ').join(''))
    .join(' ').replace(/\s+/g, ' ').trim();
}
/** A readable hint from meaningful ids ("capa-pcon-hibrido-titulo" -> "titulo"). UUIDs say nothing and are left out. */
function hintOf(object: EditorialObject, page: Page): string | undefined {
  if (UUID_LIKE.test(object.id)) return undefined;
  const local = object.id.startsWith(page.id + '-') ? object.id.slice(page.id.length + 1) : object.id;
  return local && local.length <= EDIT_INTENT_LIMITS.hintChars ? local : undefined;
}
function paintOf(paint: Paint | undefined): string | undefined {
  if (!paint) return undefined;
  if (paint.kind === 'solid') return hex(paint.color);
  if (paint.kind === 'linear') return `degradê ${hex(paint.from)}→${hex(paint.to)}`;
  return `padrão ${paint.pattern} ${hex(paint.color)}`;
}
/** Main heading of a page: the text with the largest letters (first one on ties). */
function headingOf(page: Page, document: CatalogDocument): string | undefined {
  let best: { size: number; text: string } | undefined;
  for (const object of page.objects) {
    if (object.type !== 'text' || object.hidden) continue;
    const text = plainOf(object.text);
    const size = effectiveTextStyle(document.style, object.style).fontSizePt ?? 0;
    if (text && (!best || size > best.size)) best = { size, text };
  }
  return best ? clip(best.text, 80) : undefined;
}

interface Level { textChars: number; frames: boolean; maxObjects: number }
const LEVELS: readonly Level[] = [
  { textChars: EDIT_INTENT_LIMITS.objectTextChars, frames: true, maxObjects: EDIT_INTENT_LIMITS.detailedObjects },
  { textChars: 200, frames: true, maxObjects: 60 },
  { textChars: 140, frames: false, maxObjects: 50 },
  { textChars: 90, frames: false, maxObjects: 36 },
];

/** Masked text of a text object, shortened at a whole marker when needed. */
function textEntry(text: RichText, max: number): Pick<OutlineObject, 'text' | 'nums' | 'cut'> {
  const plain = projectEditableRichText(text);
  if (plain === null) return {};
  const masked = maskNumbers(plain);
  if (!masked) return {};
  if (masked.masked.length <= max) return { text: masked.masked, ...(masked.nums.length ? { nums: masked.nums } : {}) };
  // Shortened: never split a marker. The AI may read it, not rewrite it (cut).
  const cut = masked.masked.slice(0, max - 1).replace(/\{\{?[A-Z]?\}?$/, '').trimEnd() + '…';
  return { text: cut, ...(masked.nums.length ? { nums: masked.nums } : {}), cut: true };
}

function describe(object: EditorialObject, page: Page, document: CatalogDocument, level: Level, inGroup: boolean):
  Omit<OutlineObject, 'ref' | 'group'> {
  const base: Omit<OutlineObject, 'ref' | 'group'> = {
    kind: object.type,
    name: clip(layerName(object, document, inGroup ? undefined : page), EDIT_INTENT_LIMITS.nameChars),
    ...(hintOf(object, page) ? { hint: hintOf(object, page) } : {}),
    ...(object.locked ? { locked: true as const } : {}),
    ...(object.hidden ? { hidden: true as const } : {}),
    ...(level.frames && !inGroup ? { frameMm: [object.frame.xMm, object.frame.yMm, object.frame.widthMm, object.frame.heightMm].map(round) } : {}),
  };
  switch (object.type) {
    case 'text': {
      const style = effectiveTextStyle(document.style, object.style);
      return {
        ...base, ...textEntry(object.text, level.textChars),
        ...(style.fontSizePt ? { sizePt: style.fontSizePt } : {}),
        ...(style.fontWeight === 700 ? { bold: true as const } : {}),
        ...(hex(style.color) ? { color: hex(style.color) } : {}),
        ...(object.box?.fill && hex(object.box.fill) ? { fill: `selo ${hex(object.box.fill)}` } : {}),
      };
    }
    case 'table': {
      const table = object.table;
      const firstRow = table.rows[0];
      const header = firstRow ? table.columns.slice(0, EDIT_INTENT_LIMITS.tableHeader).map(column => {
        const cell = table.cells.find(entry => entry.rowId === firstRow.id && entry.columnId === column.id);
        const content = cell?.content;
        const value = !content ? '' : content.type === 'richText' ? plainOf(content.value)
          : content.type === 'technicalCode' ? content.value : '';
        return clip(value, EDIT_INTENT_LIMITS.tableHeaderChars);
      }) : [];
      return { ...base, table: { rows: table.rows.length, cols: table.columns.length,
        ...(header.some(Boolean) ? { header } : {}),
        ...(table.style.base.fontSizePt ? { sizePt: table.style.base.fontSizePt } : {}) } };
    }
    case 'shape':
      return { ...base, ...(hex(object.style.fill) ? { fill: hex(object.style.fill) } : {}) };
    case 'polygon':
      return { ...base, ...(paintOf(object.style.fill) ? { fill: paintOf(object.style.fill) } : {}) };
    case 'line':
      return { ...base, ...(hex(object.color) ? { color: hex(object.color) } : {}) };
    default:
      return base;
  }
}

function build(document: CatalogDocument, activePage: Page, selected: ReadonlySet<string>, level: Level): DocumentOutline {
  const pages = new Map<string, string>();
  const objects = new Map<string, OutlineObjectRef>();
  const refOfId = new Map<string, string>();
  const detail: OutlineObject[] = [];
  let counter = 0;
  const add = (object: EditorialObject, groupId?: string) => {
    if (detail.length >= level.maxObjects) return undefined;
    const ref = 'o' + ++counter;
    objects.set(ref, { pageId: activePage.id, objectId: object.id, ...(groupId ? { groupId } : {}) });
    refOfId.set(object.id, ref);
    const group = groupId ? refOfId.get(groupId) : undefined;
    detail.push({ ref, ...describe(object, activePage, document, level, Boolean(groupId)), ...(group ? { group } : {}) } as OutlineObject);
    return ref;
  };
  for (const object of layersTopFirst(activePage)) {
    if (!add(object)) break;
    if (object.type === 'group') for (const child of [...object.objects].sort((a, b) => b.zIndex - a.zIndex)) add(child, object.id);
  }
  const summaries: OutlinePage[] = document.pages.slice(0, EDIT_INTENT_LIMITS.pages).map((page, index) => {
    const ref = 'p' + (index + 1);
    pages.set(ref, page.id);
    const heading = headingOf(page, document);
    return { ref, number: index + 1, ...(heading ? { heading } : {}), objects: page.objects.length,
      ...(page.id === activePage.id ? { detail } : {}) };
  });
  const activeRef = [...pages].find(([, id]) => id === activePage.id)?.[0] ?? 'p1';
  return {
    outline: {
      title: clip(document.title || 'Catálogo', EDIT_INTENT_LIMITS.titleChars),
      locale: document.locale.slice(0, 12),
      activePage: activeRef,
      selection: [...selected].map(id => refOfId.get(id)).filter((ref): ref is string => Boolean(ref))
        .slice(0, EDIT_INTENT_LIMITS.selection),
      pages: summaries,
    },
    pages, objects, documentId: document.id,
  };
}

/**
 * Builds the outline for the page on screen. It shrinks texts, drops frames and,
 * only at last, objects at the bottom of "Camadas" until it fits `maxChars`.
 */
export function buildDocumentOutline(document: CatalogDocument, options: DocumentOutlineOptions = {}): DocumentOutline {
  const activePage = document.pages.find(page => page.id === options.activePageId) ?? document.pages[0];
  if (!activePage) throw new Error('OUTLINE_NO_PAGE');
  const selected = new Set(options.selectedObjectIds ?? []);
  const maxChars = Math.min(options.maxChars ?? OUTLINE_TARGET_CHARS, EDIT_INTENT_LIMITS.outlineChars);
  let result: DocumentOutline | undefined;
  for (const level of LEVELS) {
    result = build(document, activePage, selected, level);
    if (JSON.stringify(result.outline).length <= maxChars) return result;
  }
  // Very long documents: fewer page lines, keeping the open page.
  const last = LEVELS[LEVELS.length - 1];
  for (let objects = last.maxObjects - 8; objects >= 8; objects -= 8) {
    result = build(document, activePage, selected, { ...last, maxObjects: objects });
    if (JSON.stringify(result.outline).length <= maxChars) return result;
  }
  throw new Error('OUTLINE_TOO_LARGE');
}
