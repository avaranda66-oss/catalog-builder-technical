import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createCatalogDocument } from '@/vnext/application';
import { plainRichText, type CatalogDocument, type PageFooter } from '@/vnext/domain';
import {
  BUNDLED_FONT_FACES, DocumentRenderer, DocumentSliceRenderer, fontSampleText, isBundledFontFace, verifyFontManifest,
} from '@/vnext/rendering';
import { createPresysArchetypeDocument, PRESYS_DATASHEET_SEQUENCE } from '@/vnext/library/presys-archetypes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function catalog(footer: PageFooter | undefined, pages = 3): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'Rodapé');
  return {
    ...base,
    style: footer ? { ...base.style, pageFooter: footer } : base.style,
    pages: Array.from({ length: pages }, (_, index) => ({
      ...base.pages[0], id: `page-${index + 1}`,
      objects: [{ id: `text-${index + 1}`, type: 'text' as const, frame: { xMm: 20, yMm: 20, widthMm: 100, heightMm: 10 }, zIndex: 0,
        text: plainRichText(`text-${index + 1}`, `Conteúdo ${index + 1}`), style: {} }],
    })),
  };
}

const FOOTER: PageFooter = { documentCode: 'MAN-PCON-XV', revision: '03', issuedOn: '2026-10-22', showOnFirstPage: true };
const footerTexts = (root: ParentNode) => [...root.querySelectorAll('[data-page-footer]')].map((node) => node.textContent);

describe('FR-55 control footer — drawing (same renderer for screen and PDF)', () => {
  it('prints code, revision, date, language and "Página x de y" on every page', () => {
    const { container } = render(<DocumentRenderer document={catalog(FOOTER)} plans={new Map()} assetUrls={new Map()} />);
    expect(footerTexts(container)).toEqual([1, 2, 3].map((n) => `MAN-PCON-XV · Rev. 03 · 22/10/2026 · PTPágina ${n} de 3`));
    const pages = [...container.querySelectorAll('[data-page-id]')];
    expect(pages.map((page) => page.querySelector('[data-page-footer]') !== null)).toEqual([true, true, true]);
  });

  it('places the footer box inside the page, above every object, and not clickable', () => {
    const { container } = render(<DocumentRenderer document={catalog(FOOTER, 1)} plans={new Map()} assetUrls={new Map()} />);
    const footer = container.querySelector<HTMLElement>('[data-page-footer]')!;
    expect(footer.className).toBe('editorial-page-footer');
    expect(footer.style.left).not.toBe('');
    const parts = [...footer.querySelectorAll<HTMLElement>('[data-flow-root][data-page-footer-part]')];
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(part.style.fontFamily).toBe('"Noto Sans"');
      expect(part.style.fontWeight).toBe('400');
      expect(part.style.fontSize).toBe('7.5pt');
      expect(part.style.color).toBe('rgb(109, 110, 113)');
    }
    expect(footer.closest('[data-object-id]')).toBeNull();
    const css = readFileSync(resolve('src/vnext/rendering/styles.css'), 'utf8');
    expect(css).toMatch(/\.editorial-page-footer \{[^}]*pointer-events:none/);
    expect(css).toMatch(/\.editorial-page-footer \{[^}]*z-index:2147483647/);
  });

  it('keeps the cover free of the footer unless asked, while still counting it as page 1', () => {
    const { container } = render(<DocumentRenderer document={catalog({ ...FOOTER, showOnFirstPage: false })} plans={new Map()} assetUrls={new Map()} />);
    const pages = [...container.querySelectorAll('[data-page-id]')];
    expect(pages[0].querySelector('[data-page-footer]')).toBeNull();
    expect(pages[1].querySelector('[data-page-footer]')?.textContent).toContain('Página 2 de 3');
  });

  it('draws nothing for a catalog without footer (old documents look exactly as before)', () => {
    const { container } = render(<DocumentRenderer document={catalog(undefined)} plans={new Map()} assetUrls={new Map()} />);
    expect(container.querySelector('[data-page-footer]')).toBeNull();
  });

  it('numbers a drawn slice as in the whole catalog (editor page, thumbnails)', () => {
    const whole = catalog(FOOTER, 11);
    const single = { ...whole, pages: [whole.pages[6]] };
    const { container } = render(<DocumentSliceRenderer document={single} plans={new Map()} assetUrls={new Map()} numbering={{ firstPageNumber: 7, pageCount: 11 }} />);
    expect(footerTexts(container)).toEqual(['MAN-PCON-XV · Rev. 03 · 22/10/2026 · PTPágina 7 de 11']);
  });

  it('follows the catalog language', () => {
    const english = { ...catalog(FOOTER, 2), locale: 'en' };
    const { container } = render(<DocumentRenderer document={english} plans={new Map()} assetUrls={new Map()} />);
    expect(footerTexts(container)[1]).toBe('MAN-PCON-XV · Rev. 03 · 2026-10-22 · ENPage 2 of 2');
  });
});

describe('FR-82 brand fonts — embedded, never a stand-in', () => {
  it('checks the footer face like every other printed text', () => {
    // Pages with the footer only: the font check reads computed styles, and the test DOM does not inherit fonts.
    const doc = { ...catalog(FOOTER, 2), pages: catalog(FOOTER, 2).pages.map((page) => ({ ...page, objects: [] })) };
    const { container } = render(<DocumentRenderer document={doc} plans={new Map()} assetUrls={new Map()} />);
    expect(() => verifyFontManifest(doc, container as HTMLElement)).not.toThrow();
    const without400 = { ...doc, style: { ...doc.style, fonts: doc.style.fonts.filter((font) => font.weight !== 400) } };
    const again = render(<DocumentRenderer document={without400} plans={new Map()} assetUrls={new Map()} />);
    expect(() => verifyFontManifest(without400, again.container as HTMLElement)).toThrow(/REQUIRED_FONT_MISSING|Noto Sans/);
  });

  it('loads the glyphs of the computed footer words too', () => {
    const sample = fontSampleText(catalog(FOOTER, 3));
    expect(sample).toContain('Página 3 de 3');
    expect(sample).toContain('22/10/2026');
  });

  it('allows only the faces bundled by the renderer stylesheet', () => {
    const css = readFileSync(resolve('src/vnext/rendering/styles.css'), 'utf8');
    for (const face of BUNDLED_FONT_FACES) {
      const pkg = face.family.toLowerCase().replace(/ /g, '-');
      const file = `${face.weight}${face.style === 'italic' ? '-italic' : ''}.css`;
      expect(css).toContain(`@import '@fontsource/${pkg}/${file}'`);
    }
    expect(isBundledFontFace({ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' })).toBe(true);
    expect(isBundledFontFace({ family: 'Noto Sans JP', revision: '5.3.0', weight: 700, style: 'normal' })).toBe(false);
    expect(isBundledFontFace({ family: 'Barlow Condensed', revision: '5.3.0', weight: 400, style: 'normal' })).toBe(false);
    const pkg = JSON.parse(readFileSync(resolve('node_modules/@fontsource/noto-sans/package.json'), 'utf8')) as { version: string; license: string };
    expect(pkg.version).toBe('5.3.0');
    expect(pkg.license).toBe('OFL-1.1');
  });

  it('PRESYS starters print with bundled faces and the footer on (not on the cover)', () => {
    const doc = createPresysArchetypeDocument({ documentId: 'presys-footer', title: 'Ficha', sequence: PRESYS_DATASHEET_SEQUENCE, variant: 'datasheet' });
    expect(doc.style.fonts.every(isBundledFontFace)).toBe(true);
    expect(doc.style.pageFooter).toEqual({ showOnFirstPage: false });
    const { container } = render(<DocumentRenderer document={doc} plans={new Map()} assetUrls={new Map()} />);
    const pages = [...container.querySelectorAll('[data-page-id]')];
    expect(pages[0].querySelector('[data-page-footer]')).toBeNull();
    expect(pages.slice(1).map((page) => page.querySelector('[data-page-footer-part="number"]')?.textContent))
      .toEqual(['Página 2 de 6', 'Página 3 de 6', 'Página 4 de 6', 'Página 5 de 6', 'Página 6 de 6']);
  });
});
