import type { CatalogDocument } from '../domain/editorial-model';
import { diagnostic, type Diagnostic } from '../domain/diagnostics';
import { walkPageObjects } from '../domain/object-tree';
import { pageFooterShows } from '../domain/page-footer';

/**
 * Onda 4 (FR-55): checks of the automatic control footer.
 *
 * - PAGE_FOOTER_OVERLAP (blocks): the printed words of a visible text or table touch the footer words on the same
 *   page — typically a page number or code typed by hand before the automatic footer existed. Reported at that
 *   object, so "Corrigir este item" goes straight to it. Like PRINTABLE_CONTENT_OVERLAP it compares printed glyph
 *   boxes, not generous frames: an empty corner of a text box under the footer is fine.
 * - PAGE_FOOTER_INCOMPLETE (review only): the footer is on but has no code, revision or date.
 *
 * The footer box itself is always inside the safe area (domain/page-footer.ts), so it never needs a page-edge check.
 */
export const PAGE_FOOTER_OVERLAP_DIAGNOSTIC_CODE = 'PAGE_FOOTER_OVERLAP';
export const PAGE_FOOTER_INCOMPLETE_DIAGNOSTIC_CODE = 'PAGE_FOOTER_INCOMPLETE';

function pageElement(root: HTMLElement, pageId: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[data-page-id]')].find((node) => node.getAttribute('data-page-id') === pageId);
}

function objectElement(scope: HTMLElement, objectId: string): HTMLElement | undefined {
  return [...scope.querySelectorAll<HTMLElement>('[data-object-id]')].find((node) => node.getAttribute('data-object-id') === objectId);
}

function textRects(node: Element): DOMRect[] {
  if (!node.textContent?.trim()) return [];
  const range = document.createRange();
  range.selectNodeContents(node);
  return [...range.getClientRects()];
}

const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
  && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

export function pageFooterOverlapDiagnostics(doc: CatalogDocument, root: HTMLElement): Diagnostic[] {
  if (!doc.style.pageFooter) return [];
  const result: Diagnostic[] = [];
  for (const page of doc.pages) {
    const section = pageElement(root, page.id);
    const footer = section?.querySelector<HTMLElement>('[data-page-footer]');
    if (!section || !footer) continue;
    const footerRects = [...footer.querySelectorAll('[data-page-footer-part]')].flatMap(textRects);
    if (!footerRects.length) continue;
    for (const { object, parentGroup } of walkPageObjects(page)) {
      if ((object.type !== 'text' && object.type !== 'table') || object.hidden || parentGroup?.hidden) continue;
      const node = objectElement(section, object.id);
      if (!node) continue;
      const rects = [...node.querySelectorAll('[data-inline-id]')].flatMap(textRects);
      if (rects.some((rect) => footerRects.some((footerRect) => intersects(rect, footerRect)))) {
        result.push(diagnostic(PAGE_FOOTER_OVERLAP_DIAGNOSTIC_CODE, 'Printed content intersects the automatic page footer',
          { pageId: page.id, objectId: object.id }));
      }
    }
  }
  return result;
}

export function pageFooterContentDiagnostics(doc: CatalogDocument): Diagnostic[] {
  const footer = doc.style.pageFooter;
  if (!footer) return [];
  const missing = [
    footer.documentCode ? undefined : 'documentCode',
    footer.revision ? undefined : 'revision',
    footer.issuedOn ? undefined : 'issuedOn',
  ].filter(Boolean);
  if (!missing.length) return [];
  const firstShown = doc.pages.find((_, index) => pageFooterShows(footer, index + 1)) ?? doc.pages[0];
  return [diagnostic(PAGE_FOOTER_INCOMPLETE_DIAGNOSTIC_CODE, `missing=${missing.join(',')}`, { pageId: firstShown.id, severity: 'WARNING' })];
}
