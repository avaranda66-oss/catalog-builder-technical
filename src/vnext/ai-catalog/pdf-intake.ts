import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 1000;
export const MAX_PAGE_TEXT = 60_000;

export interface ExtractedPdfPage {
  readonly number: number;
  readonly text: string;
  readonly textLength: number;
  readonly needsVisualExtraction: boolean;
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
export async function extractPdfText(
  fileName: string, bytes: ArrayBuffer, options: { maxPages?: number } = {}
): Promise<ExtractedPdf> {
  if (!fileName.toLowerCase().endsWith('.pdf') || bytes.byteLength < 8 || bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('PDF_INPUT_INVALID');
  }
  const signature = new TextDecoder('ascii').decode(new Uint8Array(bytes, 0, 5));
  if (signature !== '%PDF-') throw new Error('PDF_SIGNATURE_INVALID');
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  const pdf = await getDocument({
    data: new Uint8Array(bytes.slice(0)), // PDF.js takes ownership of its buffer
    useSystemFonts: true, disableFontFace: true, isEvalSupported: false,
    stopAtErrors: true,
  }).promise;
  const pages: ExtractedPdfPage[] = [];
  try {
    const requested = options.maxPages ?? MAX_PDF_PAGES;
    if (!Number.isInteger(requested) || requested < 1 || requested > MAX_PDF_PAGES) {
      throw new Error('PDF_PAGE_LIMIT_INVALID');
    }
    const limit = Math.min(pdf.numPages, requested);
    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
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
        pages.push({
          number: pageNumber,
          text: full.slice(0, MAX_PAGE_TEXT),
          textLength: full.length,
          needsVisualExtraction: full.trim().length < 20,
        });
      } finally {
        page.cleanup();
      }
    }
    return Object.freeze({
      fileName, sha256, pageCount: pdf.numPages, pages,
      truncated: pdf.numPages > requested || pdf.numPages > MAX_PDF_PAGES ||
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
