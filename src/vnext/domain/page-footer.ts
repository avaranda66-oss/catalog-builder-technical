import type { CatalogDocument, DocumentStyle, Page, PageFooter } from './editorial-model';

/**
 * Onda 4 (FR-55): the control footer drawn at the bottom of every page from `style.pageFooter` of the catalog.
 * Pure functions only, shared by the renderer (screen and PDF), the font check, the preflight and the editor, so
 * every place prints exactly the same words in exactly the same box.
 *
 * Layout (A4, the PRESYS grid of the archetypes): one line, 5 mm high, from 18 mm to 194 mm, top at 280 mm.
 * Left: "<código> · Rev. <rev> · <data> · <IDIOMA>"; right: "Página 2 de 11". The PRESYS archetypes keep the
 * site address centred in the same line, so the three never collide.
 */
export const PAGE_FOOTER_GEOMETRY = Object.freeze({
  leftMm: 18,
  rightMm: 16,
  topMm: 280,
  heightMm: 5,
  /** Inset kept inside the page's safe area even when the page declares none. */
  minimumSafeMm: 10,
  fontSizePt: 7.5,
  lineHeight: 1.2,
  /** PRESYS "muted" token (blueprint §3). */
  color: '#6D6E71',
  /** Space kept free above the footer by layout helpers (table continuation). */
  clearanceMm: 1,
});

/** Any page box (the schema fixes A4; layout helpers pass plain numbers). */
export interface PageFooterPageBox {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly safeArea?: Page['safeArea'];
}

export interface PageFooterBandMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** The footer box on one page, always inside the page's safe area (or 10 mm when the page has none). */
export function pageFooterBandMm(page: PageFooterPageBox): PageFooterBandMm {
  const g = PAGE_FOOTER_GEOMETRY;
  const safe = page.safeArea;
  const left = Math.max(g.leftMm, safe?.leftMm ?? 0, g.minimumSafeMm);
  const right = Math.max(g.rightMm, safe?.rightMm ?? 0, g.minimumSafeMm);
  const bottom = Math.max(safe?.bottomMm ?? 0, g.minimumSafeMm);
  const yMm = Math.min(g.topMm, page.heightMm - bottom - g.heightMm);
  return { xMm: left, yMm, widthMm: page.widthMm - left - right, heightMm: g.heightMm };
}

/**
 * Bottom margin (mm) content must keep on page `pageNumber` so it never runs under the automatic footer: the footer
 * box plus a small clearance, or 0 when that page shows no footer. Layout helpers use the larger of this and the
 * page's own safe area.
 */
export function pageFooterReserveBottomMm(page: PageFooterPageBox, footer: PageFooter | undefined, pageNumber: number): number {
  if (!pageFooterShows(footer, pageNumber)) return 0;
  return page.heightMm - pageFooterBandMm(page).yMm + PAGE_FOOTER_GEOMETRY.clearanceMm;
}

/** Page numbers count every page (the cover is page 1), even when the cover hides the footer. */
export function pageFooterShows(footer: PageFooter | undefined, pageNumber: number): footer is PageFooter {
  return Boolean(footer) && (pageNumber > 1 || footer!.showOnFirstPage);
}

function primaryLanguage(locale: string): string {
  return (locale.split(/[-_]/)[0] ?? '').toLowerCase();
}

/** "pt-BR" → "PT": the language as printed in the footer and in the PDF file name. */
export function footerLanguageCode(locale: string): string {
  const code = primaryLanguage(locale).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
  return code || 'XX';
}

const PAGE_WORDS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  pt: ['Página', 'de'], es: ['Página', 'de'], en: ['Page', 'of'], fr: ['Page', 'sur'],
  it: ['Pagina', 'di'], de: ['Seite', 'von'], pl: ['Strona', 'z'],
});

/** "Página 2 de 11" in the catalog's language; "2 / 11" for a language without its own words. */
export function pageNumberText(pageNumber: number, pageCount: number, locale: string): string {
  const words = PAGE_WORDS[primaryLanguage(locale)];
  return words ? `${words[0]} ${pageNumber} ${words[1]} ${pageCount}` : `${pageNumber} / ${pageCount}`;
}

/** Fixed, locale-aware date: dd/mm/aaaa (pt, es, fr, it), dd.mm.aaaa (de, pl), aaaa-mm-dd otherwise (ISO, unambiguous). */
export function footerDateText(isoDate: string, locale: string): string {
  const [year, month, day] = isoDate.split('-');
  const language = primaryLanguage(locale);
  if (['pt', 'es', 'fr', 'it'].includes(language)) return `${day}/${month}/${year}`;
  if (['de', 'pl'].includes(language)) return `${day}.${month}.${year}`;
  return isoDate;
}

function revisionLabel(locale: string): string {
  return primaryLanguage(locale) === 'fr' ? 'Rév.' : 'Rev.';
}

/** The left part: only what the person filled, then the language (always). */
export function pageFooterControlText(footer: PageFooter, locale: string): string {
  return [
    footer.documentCode,
    footer.revision ? `${revisionLabel(locale)} ${footer.revision}` : undefined,
    footer.issuedOn ? footerDateText(footer.issuedOn, locale) : undefined,
    footerLanguageCode(locale),
  ].filter((part): part is string => Boolean(part)).join(' · ');
}

export interface PageFooterTexts {
  readonly control: string;
  readonly pageNumber: string;
}

/** What the footer prints on page `pageNumber` of `pageCount`, or undefined when that page shows no footer. */
export function pageFooterTexts(catalog: Pick<CatalogDocument, 'locale' | 'style'>, pageNumber: number, pageCount: number): PageFooterTexts | undefined {
  const footer = catalog.style.pageFooter;
  if (!pageFooterShows(footer, pageNumber)) return undefined;
  return { control: pageFooterControlText(footer, catalog.locale), pageNumber: pageNumberText(pageNumber, pageCount, catalog.locale) };
}

/** Every string the footer prints in the whole catalog (the font check loads the glyphs these need). */
export function allPageFooterText(catalog: Pick<CatalogDocument, 'locale' | 'style' | 'pages'>): string {
  const count = catalog.pages.length;
  return catalog.pages.map((_, index) => {
    const texts = pageFooterTexts(catalog, index + 1, count);
    return texts ? `${texts.control} ${texts.pageNumber}` : '';
  }).join('\n');
}

/** The face the footer is printed with: the catalog's regular (400, upright) face of its default family. */
export function pageFooterFont(style: DocumentStyle): { family: string; weight: 400; style: 'normal' } {
  const family = style.defaultText.fontFamily ?? style.fonts.find((font) => font.weight === 400 && font.style === 'normal')?.family
    ?? style.fonts[0].family;
  return { family, weight: 400, style: 'normal' };
}

/**
 * FR-55: the PDF file name "<código>-<rev>_<IDIOMA>" (without ".pdf"), or undefined when the footer has no code.
 * Characters Windows forbids in file names are replaced by "-".
 */
export function pageFooterFileTitle(catalog: Pick<CatalogDocument, 'locale' | 'style'>): string | undefined {
  const footer = catalog.style.pageFooter;
  if (!footer?.documentCode) return undefined;
  const safe = (value: string) => value.replace(/[<>:"/\\|?*]|\p{Cc}/gu, '-').replace(/\s+/g, ' ').trim();
  const code = safe(footer.documentCode), revision = footer.revision ? safe(footer.revision) : '';
  return `${code}${revision ? `-${revision}` : ''}_${footerLanguageCode(catalog.locale)}`;
}
