import type { ApplicationAction, DocumentSession } from '../application';
import type { CatalogDocument, PageFooter, RichText } from '../domain';
import { PAGE_FOOTER_LIMITS, PageFooterSchema, pageFooterBandMm, pageFooterShows } from '../domain';

/**
 * Onda 4 (FR-55, audit S21): "Rodapé de todas as páginas". Builds the one command that changes the footer and finds
 * the page numbers typed by hand that the automatic footer replaces, so the father fixes ~100 actions in 2 clicks.
 */

/** The footer a catalog gets when the person turns it on: nothing invented, only the cover choice. */
export const DEFAULT_PAGE_FOOTER: Readonly<PageFooter> = Object.freeze({ showOnFirstPage: false });

/** One undoable change of the footer, prepared against the footer as it is now. */
export function pageFooterAction(document: CatalogDocument, footer: PageFooter | null): ApplicationAction {
  return { type: 'document.setPageFooter', expectedFooter: document.style.pageFooter ?? null, footer };
}

/** What the person typed, as stored: one line, no extra spaces, cut at the limit; empty means "not filled". */
export function normalizeFooterField(value: string, field: keyof typeof PAGE_FOOTER_LIMITS): string | undefined {
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PAGE_FOOTER_LIMITS[field]).trim();
  return clean || undefined;
}

/** The footer with only the filled fields (undefined keys removed), or undefined when it would not be valid. */
export function cleanPageFooter(footer: PageFooter): PageFooter | undefined {
  const next: PageFooter = { showOnFirstPage: footer.showOnFirstPage };
  if (footer.documentCode) next.documentCode = footer.documentCode;
  if (footer.revision) next.revision = footer.revision;
  if (footer.issuedOn) next.issuedOn = footer.issuedOn;
  return PageFooterSchema.safeParse(next).success ? next : undefined;
}

/** Today's date in the person's own time zone, as the footer stores it (aaaa-mm-dd). */
export function todayIsoDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function plainText(rich: RichText): string {
  return rich.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '\n').join('')).join('\n');
}

/** "3", "3 / 11", "3/11", "Página 3 de 11", "Pág. 3", "Page 3 of 11", "- 3 -"… and nothing else. */
const TYPED_PAGE_NUMBER = /^[\s\-–—]*(?:(?:p[áa]g(?:ina|e)?\.?|seite|strona)\s*)?\d{1,3}(?:\s*(?:\/|de|of|sur|di|von|z)\s*\d{1,3})?[\s\-–—]*$/iu;
/** How far above the automatic footer a typed number may sit and still count as a footer (mm). */
const TYPED_NUMBER_ZONE_MM = 15;

export function isTypedPageNumber(text: string): boolean {
  return TYPED_PAGE_NUMBER.test(text);
}

export interface TypedPageNumber {
  readonly pageId: string;
  readonly pageNumber: number;
  readonly objectId: string;
  readonly text: string;
}

/**
 * Texts that only hold a page number, near the bottom of a page that shows the automatic footer. Only top-level,
 * visible, unlocked texts: anything else is left alone (and the preflight still points at it if it collides).
 */
export function typedPageNumbers(document: CatalogDocument, footer: PageFooter = document.style.pageFooter ?? DEFAULT_PAGE_FOOTER): TypedPageNumber[] {
  const found: TypedPageNumber[] = [];
  document.pages.forEach((page, index) => {
    if (!pageFooterShows(footer, index + 1)) return;
    const zoneTop = pageFooterBandMm(page).yMm - TYPED_NUMBER_ZONE_MM;
    for (const object of page.objects) {
      if (object.type !== 'text' || object.locked || object.hidden || object.frame.yMm < zoneTop) continue;
      const text = plainText(object.text).trim();
      if (text && isTypedPageNumber(text)) found.push({ pageId: page.id, pageNumber: index + 1, objectId: object.id, text });
    }
  });
  return found;
}

export type ReplaceTypedPageNumbersOutcome = { ok: true; removed: number } | { ok: false; message: string };

/**
 * Turns the automatic footer on (if needed) and deletes the typed page numbers listed in the preview, as ONE undo
 * step. If anything changed in between, nothing is kept: the partial change is undone and the person tries again.
 */
export function replaceTypedPageNumbers(session: DocumentSession, footer: PageFooter, items: readonly TypedPageNumber[],
  transactionId: string): ReplaceTypedPageNumbersOutcome {
  const before = session.getSnapshot().localSequence;
  const rollback = (): ReplaceTypedPageNumbersOutcome => {
    if (session.getSnapshot().localSequence !== before) session.undo();
    return { ok: false, message: 'O catálogo mudou enquanto você conferia. Nada foi apagado. Tente de novo.' };
  };
  const current = session.getSnapshot().document;
  const expected = new Set(typedPageNumbers(current, footer).map((item) => item.objectId));
  if (items.some((item) => !expected.has(item.objectId))) return rollback();
  const enabled = session.execute(pageFooterAction(current, footer), { transactionId });
  if (!enabled.ok) return rollback();
  for (const item of items) {
    const deleted = session.execute({ type: 'object.delete', objectId: item.objectId }, { transactionId });
    if (!deleted.ok) return rollback();
  }
  return { ok: true, removed: items.length };
}
