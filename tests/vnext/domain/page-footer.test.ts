import { describe, expect, it } from 'vitest';
import { createCatalogDocument } from '@/vnext/application';
import {
  CatalogDocumentSchema, PAGE_FOOTER_GEOMETRY, PageFooterSchema, allPageFooterText, footerDateText, footerLanguageCode, pageFooterBandMm,
  pageFooterControlText, pageFooterFileTitle, pageFooterFont, pageFooterReserveBottomMm, pageFooterShows, pageFooterTexts, pageNumberText,
  type CatalogDocument, type PageFooter,
} from '@/vnext/domain';
import { PRESYS_COLOR_TOKENS, PRESYS_PAGE_TOKENS, PRESYS_TYPE_SCALE } from '@/vnext/library/presys-archetypes';

function ids(prefix = 'footer') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function catalog(footer: PageFooter | undefined, pages = 3, locale = 'pt-BR'): CatalogDocument {
  const base = createCatalogDocument(ids(), 'Rodapé');
  return {
    ...base, locale,
    style: footer ? { ...base.style, pageFooter: footer } : base.style,
    pages: Array.from({ length: pages }, (_, index) => ({ ...base.pages[0], id: `page-${index + 1}` })),
  };
}

const FULL: PageFooter = { documentCode: 'MAN-PCON-XV', revision: '03', issuedOn: '2026-10-22', showOnFirstPage: false };

describe('FR-55 page footer — schema', () => {
  it('accepts a complete footer and the minimal one, and keeps old documents valid', () => {
    expect(PageFooterSchema.safeParse(FULL).success).toBe(true);
    expect(PageFooterSchema.safeParse({ showOnFirstPage: true }).success).toBe(true);
    expect(CatalogDocumentSchema.safeParse(catalog(undefined)).success).toBe(true);
    expect(CatalogDocumentSchema.safeParse(catalog(FULL)).success).toBe(true);
  });

  it('rejects untrimmed, too long, control-character and unknown fields, and impossible dates', () => {
    const bad = (patch: Record<string, unknown>) => PageFooterSchema.safeParse({ ...FULL, ...patch }).success;
    expect(bad({ documentCode: ' MAN' })).toBe(false);
    expect(bad({ documentCode: 'X'.repeat(41) })).toBe(false);
    expect(bad({ documentCode: 'X'.repeat(40) })).toBe(true);
    expect(bad({ revision: '1'.repeat(13) })).toBe(false);
    expect(bad({ revision: 'A\nB' })).toBe(false);
    expect(bad({ documentCode: '' })).toBe(false);
    expect(bad({ issuedOn: '2026-02-30' })).toBe(false);
    expect(bad({ issuedOn: '22/10/2026' })).toBe(false);
    expect(bad({ issuedOn: '1899-12-31' })).toBe(false);
    expect(bad({ issuedOn: '2028-02-29' })).toBe(true);
    expect(bad({ language: 'PT' })).toBe(false);
    expect(PageFooterSchema.safeParse({ documentCode: 'X' }).success).toBe(false);
  });
});

describe('FR-55 page footer — words', () => {
  it('numbers every page, counting the cover, and hides the cover footer unless asked', () => {
    expect(pageFooterShows(undefined, 2)).toBe(false);
    expect(pageFooterShows(FULL, 1)).toBe(false);
    expect(pageFooterShows(FULL, 2)).toBe(true);
    expect(pageFooterShows({ ...FULL, showOnFirstPage: true }, 1)).toBe(true);
    const doc = catalog(FULL, 11);
    expect(pageFooterTexts(doc, 1, 11)).toBeUndefined();
    expect(pageFooterTexts(doc, 4, 11)).toEqual({ control: 'MAN-PCON-XV · Rev. 03 · 22/10/2026 · PT', pageNumber: 'Página 4 de 11' });
  });

  it('prints only what was filled, and always the language', () => {
    expect(pageFooterControlText({ showOnFirstPage: false }, 'pt-BR')).toBe('PT');
    expect(pageFooterControlText({ documentCode: 'FT-01', showOnFirstPage: false }, 'en')).toBe('FT-01 · EN');
    expect(pageFooterControlText({ revision: '2', showOnFirstPage: false }, 'fr-FR')).toBe('Rév. 2 · FR');
  });

  it('writes the page number and the date in the catalog language', () => {
    expect(pageNumberText(2, 11, 'pt-BR')).toBe('Página 2 de 11');
    expect(pageNumberText(2, 11, 'es-ES')).toBe('Página 2 de 11');
    expect(pageNumberText(2, 11, 'en')).toBe('Page 2 of 11');
    expect(pageNumberText(2, 11, 'fr')).toBe('Page 2 sur 11');
    expect(pageNumberText(2, 11, 'it-IT')).toBe('Pagina 2 di 11');
    expect(pageNumberText(2, 11, 'de')).toBe('Seite 2 von 11');
    expect(pageNumberText(2, 11, 'pl-PL')).toBe('Strona 2 z 11');
    expect(pageNumberText(2, 11, 'ja')).toBe('2 / 11');
    expect(footerDateText('2026-10-02', 'pt-BR')).toBe('02/10/2026');
    expect(footerDateText('2026-10-02', 'de-DE')).toBe('02.10.2026');
    expect(footerDateText('2026-10-02', 'en-US')).toBe('2026-10-02');
    expect(footerLanguageCode('pt-BR')).toBe('PT');
    expect(footerLanguageCode('zh_Hans')).toBe('ZH');
    expect(footerLanguageCode('')).toBe('XX');
  });

  it('lists every printed footer string for the font check', () => {
    const text = allPageFooterText(catalog(FULL, 3));
    expect(text).not.toContain('Página 1 de 3');
    expect(text).toContain('Página 2 de 3');
    expect(text).toContain('Página 3 de 3');
    expect(allPageFooterText(catalog(undefined, 3))).toBe('\n\n');
  });

  it('prints with the catalog regular face', () => {
    expect(pageFooterFont(catalog(FULL).style)).toEqual({ family: 'Noto Sans', weight: 400, style: 'normal' });
  });

  it('names the PDF <código>-<rev>_<IDIOMA> and makes it safe for Windows', () => {
    expect(pageFooterFileTitle(catalog(FULL))).toBe('MAN-PCON-XV-03_PT');
    expect(pageFooterFileTitle(catalog({ documentCode: 'FT/01:A', showOnFirstPage: false }, 1, 'en'))).toBe('FT-01-A_EN');
    expect(pageFooterFileTitle(catalog({ revision: '03', showOnFirstPage: false }))).toBeUndefined();
    expect(pageFooterFileTitle(catalog(undefined))).toBeUndefined();
  });
});

describe('FR-55 page footer — geometry and brand (FR-82)', () => {
  const inside = (band: ReturnType<typeof pageFooterBandMm>, safe: { topMm: number; rightMm: number; bottomMm: number; leftMm: number }) => {
    expect(band.xMm).toBeGreaterThanOrEqual(safe.leftMm);
    expect(band.xMm + band.widthMm).toBeLessThanOrEqual(210 - safe.rightMm);
    expect(band.yMm + band.heightMm).toBeLessThanOrEqual(297 - safe.bottomMm);
    expect(band.yMm).toBeGreaterThanOrEqual(safe.topMm);
  };

  it('sits on the PRESYS footer line, inside the safe area', () => {
    const safe = { ...PRESYS_PAGE_TOKENS.safeArea };
    const band = pageFooterBandMm({ widthMm: 210, heightMm: 297, safeArea: safe });
    expect(band).toEqual({ xMm: PRESYS_PAGE_TOKENS.contentLeftMm, yMm: PRESYS_PAGE_TOKENS.footerYMm, widthMm: PRESYS_PAGE_TOKENS.contentWidthMm, heightMm: 5 });
    inside(band, safe);
  });

  it('moves inwards when a page asks for a larger safe area, and keeps 10 mm when it has none', () => {
    const wide = { topMm: 20, rightMm: 25, bottomMm: 20, leftMm: 25 };
    inside(pageFooterBandMm({ widthMm: 210, heightMm: 297, safeArea: wide }), wide);
    inside(pageFooterBandMm({ widthMm: 210, heightMm: 297 }), { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 });
    const blank = createCatalogDocument(ids()).pages[0];
    inside(pageFooterBandMm(blank), blank.safeArea!);
  });

  it('uses the PRESYS tokens: muted colour, note size', () => {
    expect(PAGE_FOOTER_GEOMETRY.color).toBe(PRESYS_COLOR_TOKENS.muted);
    expect(PAGE_FOOTER_GEOMETRY.fontSizePt).toBe(PRESYS_TYPE_SCALE.note);
    expect(210 - PAGE_FOOTER_GEOMETRY.rightMm).toBe(PRESYS_PAGE_TOKENS.contentLeftMm + PRESYS_PAGE_TOKENS.contentWidthMm);
  });

  it('reserves the footer box plus 1 mm only on pages that show it', () => {
    const page = { widthMm: 210, heightMm: 297, safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 } };
    expect(pageFooterReserveBottomMm(page, FULL, 2)).toBe(18);
    expect(pageFooterReserveBottomMm(page, FULL, 1)).toBe(0);
    expect(pageFooterReserveBottomMm(page, undefined, 2)).toBe(0);
  });
});
