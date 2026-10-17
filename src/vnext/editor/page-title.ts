import type { CatalogDocument, Page, RichText, TextObject } from '../domain';
import { walkPageObjects } from '../domain';

/**
 * FR-18: the name shown under a page thumbnail. It is the page's first title:
 * the text written in the largest letters (top-most, then left-most, on a tie),
 * shortened. A page without text has no title, and the panel shows only
 * "Página N".
 */
export const PAGE_TITLE_MAX_LENGTH = 48;

function firstLine(text: RichText): string {
  for (const paragraph of text.paragraphs) {
    const line = paragraph.inlines.map((inline) => (inline.kind === 'text' ? inline.text : ' ')).join('').replace(/\s+/g, ' ').trim();
    if (line) return line;
  }
  return '';
}

export function pageTitle(page: Page, defaultText?: CatalogDocument['style']['defaultText'], maxLength = PAGE_TITLE_MAX_LENGTH): string {
  const baseSize = defaultText?.fontSizePt ?? 10;
  const candidates = walkPageObjects(page)
    .map(({ object }) => object)
    .filter((object): object is TextObject => object.type === 'text')
    .map((object) => ({ object, line: firstLine(object.text), size: object.style.fontSizePt ?? baseSize }))
    .filter((candidate) => candidate.line.length > 0)
    .sort((left, right) => right.size - left.size
      || left.object.frame.yMm - right.object.frame.yMm
      || left.object.frame.xMm - right.object.frame.xMm);
  const line = candidates[0]?.line ?? '';
  return line.length > maxLength ? `${line.slice(0, maxLength - 1).trimEnd()}…` : line;
}
