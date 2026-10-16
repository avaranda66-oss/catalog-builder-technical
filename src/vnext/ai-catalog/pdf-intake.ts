import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Vite does not inject the default PDF.js worker path. Configure only in a
// real browser; Node-side tests continue using PDF.js's own worker fallback.
if (typeof Worker !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = workerUrl;
}

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 1000;
export const MAX_PAGE_TEXT = 60_000;

/**
 * Why a page probably holds content that text extraction cannot read:
 * - no-text: (almost) no searchable text;
 * - unreadable-glyphs: text uses private-use or replacement characters (broken font mapping);
 * - large-image: little text and an image covering half of the page or more (scan with a digital footer);
 * - vector-graphics: little text and many drawn paths (text converted to curves, drawings).
 */
export type PdfVisualReason = 'no-text' | 'unreadable-glyphs' | 'large-image' | 'vector-graphics';
/** Pages with less text than this are checked for images and drawings when `visualTriage` is on. */
export const LOW_TEXT_CHARACTERS = 200;

export interface ExtractedPdfPage {
  readonly number: number;
  readonly text: string;
  readonly textLength: number;
  /** True when the text layer is unusable (empty or mostly unreadable glyphs). */
  readonly needsVisualExtraction: boolean;
  /** Triage signals; a page can have text (e.g. a footer) and still need visual reading. */
  readonly visualReasons?: readonly PdfVisualReason[];
  /** Native text positions for a reviewable layout suggestion, never certification. */
  readonly runs?: readonly { text: string; x: number; y: number; width: number }[];
}
export interface ExtractedPdf {
  readonly fileName: string;
  readonly sha256: string;
  readonly pageCount: number;
  readonly pages: readonly ExtractedPdfPage[];
  readonly truncated: boolean;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Share of visible characters that are private-use (U+E000–U+F8FF, planes 15–16) or U+FFFD. */
export function unreadableGlyphRatio(text: string): number {
  let visible = 0, unreadable = 0;
  for (const char of text) {
    if (/\s/.test(char)) continue;
    visible++;
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0xe000 && code <= 0xf8ff) || code >= 0xf0000 || code === 0xfffd) unreadable++;
  }
  return visible ? unreadable / visible : 0;
}

/** Text-only triage, cheap enough for every page. */
export function textVisualReasons(text: string): PdfVisualReason[] {
  const reasons: PdfVisualReason[] = [];
  if (text.trim().length < 20) reasons.push('no-text');
  if (unreadableGlyphRatio(text) > 0.05) reasons.push('unreadable-glyphs');
  return reasons;
}

type Matrix = [number, number, number, number, number, number];
const multiply = (m1: Matrix, m2: readonly number[]): Matrix => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const isMatrix = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 6 && value.every(Number.isFinite);

interface OperatorListPage {
  readonly view: number[];
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

/**
 * Image coverage (0..1 of the page box) and drawn-path count from the operator list.
 * Images are unit squares mapped by the current transform; overlaps may double count.
 */
export async function pageGraphics(page: OperatorListPage): Promise<{ imageCoverage: number; paths: number }> {
  const [x0, y0, x1, y1] = page.view;
  const left = Math.min(x0, x1), right = Math.max(x0, x1), bottom = Math.min(y0, y1), top = Math.max(y0, y1);
  const area = (right - left) * (top - bottom);
  if (!(area > 0)) return { imageCoverage: 0, paths: 0 };
  const list = await page.getOperatorList();
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let covered = 0, paths = 0;
  for (let index = 0; index < list.fnArray.length; index++) {
    const fn = list.fnArray[index], args = list.argsArray[index];
    if (fn === OPS.save) stack.push(matrix);
    else if (fn === OPS.restore) matrix = stack.pop() ?? matrix;
    else if (fn === OPS.transform && isMatrix(args)) matrix = multiply(matrix, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(matrix);
      const form = Array.isArray(args) ? args[0] : undefined;
      if (isMatrix(form)) matrix = multiply(matrix, form);
    } else if (fn === OPS.paintFormXObjectEnd) matrix = stack.pop() ?? matrix;
    else if (fn === OPS.constructPath) paths++;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      const xs = [matrix[4], matrix[0] + matrix[4], matrix[2] + matrix[4], matrix[0] + matrix[2] + matrix[4]];
      const ys = [matrix[5], matrix[1] + matrix[5], matrix[3] + matrix[5], matrix[1] + matrix[3] + matrix[5]];
      const width = Math.min(right, Math.max(...xs)) - Math.max(left, Math.min(...xs));
      const height = Math.min(top, Math.max(...ys)) - Math.max(bottom, Math.min(...ys));
      if (width > 0 && height > 0) covered += width * height;
    }
  }
  return { imageCoverage: Math.min(1, covered / area), paths };
}

export interface ExtractPdfOptions {
  /** How many pages to read, counted from `firstPage`. */
  readonly maxPages?: number;
  /** First page to read (1-based, default 1). */
  readonly firstPage?: number;
  /** Also inspect images and drawings of low-text pages (slower; used by source intake). */
  readonly visualTriage?: boolean;
}

export async function extractPdfText(
  fileName: string, bytes: ArrayBuffer, options: ExtractPdfOptions = {}
): Promise<ExtractedPdf> {
  if (!fileName.toLowerCase().endsWith('.pdf') || bytes.byteLength < 8 || bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('PDF_INPUT_INVALID');
  }
  // Capture once before yielding: callers can still mutate their ArrayBuffer
  // while digest awaits. Hash and parser must observe the same document.
  const sourceBytes = bytes.slice(0);
  const signature = new TextDecoder('ascii').decode(new Uint8Array(sourceBytes, 0, 5));
  if (signature !== '%PDF-') throw new Error('PDF_SIGNATURE_INVALID');
  const sha256 = hex(await crypto.subtle.digest('SHA-256', sourceBytes));
  const pdf = await getDocument({
    data: new Uint8Array(sourceBytes), // PDF.js owns the captured, already-hashed buffer
    useSystemFonts: true, disableFontFace: true, isEvalSupported: false,
    stopAtErrors: true,
  }).promise;
  const pages: ExtractedPdfPage[] = [];
  try {
    const requested = options.maxPages ?? MAX_PDF_PAGES;
    const firstPage = options.firstPage ?? 1;
    if (!Number.isInteger(requested) || requested < 1 || requested > MAX_PDF_PAGES ||
        !Number.isInteger(firstPage) || firstPage < 1) {
      throw new Error('PDF_PAGE_LIMIT_INVALID');
    }
    const limit = Math.min(pdf.numPages, firstPage + requested - 1);
    for (let pageNumber = firstPage; pageNumber <= limit; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        // Retain line breaks in addition to text. This is a discovery index,
        // not a certified extraction of table cell geometry or reading order.
        const segments = content.items.flatMap(item => {
          if (!('str' in item)) return [];
          return [item.str + (item.hasEOL ? '\n' : ' ')];
        });
        const full = segments.join('').trim();
        const visualReasons = textVisualReasons(full);
        if (options.visualTriage && full.length < LOW_TEXT_CHARACTERS) {
          try {
            const graphics = await pageGraphics(page as unknown as OperatorListPage);
            if (graphics.imageCoverage >= 0.5) visualReasons.push('large-image');
            if (graphics.paths >= 300) visualReasons.push('vector-graphics');
          } catch { /* triage is advisory: keep the text result */ }
        }
        pages.push({
          number: pageNumber,
          text: full.slice(0, MAX_PAGE_TEXT),
          textLength: full.length,
          needsVisualExtraction: full.length < 20 || unreadableGlyphRatio(full) > 0.3,
          visualReasons,
          runs: page.rotate === 0 ? content.items.flatMap(item => {
            if (!('str' in item) || !item.str.trim() || item.transform[1] !== 0 ||
                item.transform[2] !== 0 || ![item.transform[4], item.transform[5], item.width].every(Number.isFinite)) return [];
            return [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }];
          }) : [],
        });
      } finally {
        page.cleanup();
      }
    }
    return Object.freeze({
      fileName, sha256, pageCount: pdf.numPages, pages,
      truncated: firstPage > 1 || limit < pdf.numPages || pdf.numPages > MAX_PDF_PAGES ||
        pages.some(page => page.textLength > MAX_PAGE_TEXT),
    });
  } finally {
    await pdf.destroy();
  }
}

/**
 * Bounded page-aware context selection. Large documents are indexed locally;
 * only explicitly chosen page excerpts should enter a separately authorized AI call.
 */
export function selectPdfContext(
  pdf: ExtractedPdf, query: string, maxCharacters = 8000, maxPages = 8
): { page: number; quote: string }[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 50000 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30) throw new Error('PDF_CONTEXT_BUDGET_INVALID');
  const terms = [...new Set(query.toLocaleLowerCase('pt-BR')
    .split(/[^\p{L}\p{N}-]+/u).filter(term => term.length >= 4).slice(0, 20))];
  return [...pdf.pages]
    .filter(page => !page.needsVisualExtraction && page.text)
    .map(page => ({
      page, score: terms.filter(term => page.text.toLocaleLowerCase('pt-BR').includes(term)).length,
    }))
    .sort((a, b) => b.score - a.score || a.page.number - b.page.number)
    .slice(0, maxPages)
    .reduce((state, item) => {
      const remaining = maxCharacters - state.used;
      if (remaining <= 0) return state;
      const text = item.page.text.slice(0, remaining);
      state.chunks.push({ page: item.page.number, quote: text });
      state.used += text.length;
      return state;
    }, { used: 0, chunks: [] as { page: number; quote: string }[] }).chunks;
}
