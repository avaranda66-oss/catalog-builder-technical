import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument } from '@/vnext/application';
import { plainRichText, type CatalogDocument, type PageFooter } from '@/vnext/domain';
import { contentDiagnostics } from '@/vnext/publication/preflight';
import {
  PAGE_FOOTER_INCOMPLETE_DIAGNOSTIC_CODE, PAGE_FOOTER_OVERLAP_DIAGNOSTIC_CODE, pageFooterContentDiagnostics, pageFooterOverlapDiagnostics,
} from '@/vnext/publication/page-footer-preflight';
import { publicationDiagnosticMessage, publicationDiagnosticText } from '@/vnext/app/publication-diagnostic-presentation';
import { publicationFileTitle } from '@/vnext/app/PublicationReview';

afterEach(() => vi.restoreAllMocks());

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const FOOTER: PageFooter = { documentCode: 'MAN-PCON-XV', revision: '03', issuedOn: '2026-10-22', showOnFirstPage: false };

function catalog(footer: PageFooter | undefined): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'Folder PCON');
  return {
    ...base,
    style: footer ? { ...base.style, pageFooter: footer } : base.style,
    pages: [1, 2].map((n) => ({
      ...base.pages[0], id: `page-${n}`,
      objects: [{ id: `typed-${n}`, type: 'text' as const, frame: { xMm: 170, yMm: 281, widthMm: 24, heightMm: 5 }, zIndex: 0,
        text: plainRichText(`typed-${n}`, `${n} / 2`), style: {} }],
    })),
  };
}

function rect(x: number, y: number, width = 20, height = 4): DOMRect {
  return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) };
}

/** A DOM like the renderer's: page sections, object nodes with inline spans and, on page 2, the footer parts. */
function dom(doc: CatalogDocument, withFooter: (pageId: string) => boolean) {
  const root = document.createElement('div');
  root.innerHTML = doc.pages.map((page) => `<section data-page-id="${page.id}">${page.objects.map((object) =>
    `<div data-object-id="${object.id}"><span data-inline-id="${object.id}:t" data-rect="typed">x</span></div>`).join('')}${withFooter(page.id)
    ? '<div data-page-footer=""><div data-flow-root="" data-page-footer-part="control" data-rect="control">MAN</div><div data-flow-root="" data-page-footer-part="number" data-rect="number">Página 2 de 2</div></div>'
    : ''}</section>`).join('');
  return root;
}

function rects(byKind: Record<string, DOMRect>) {
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    let selected: Element | undefined;
    return {
      selectNodeContents: (node: Element) => { selected = node; },
      getClientRects: () => [byKind[selected?.getAttribute('data-rect') ?? ''] ?? rect(0, 0, 0, 0)],
    } as unknown as Range;
  });
}

describe('FR-55 preflight — printed words under the automatic footer', () => {
  it('blocks a typed page number under "Página x de y" and points at that text', () => {
    const doc = catalog(FOOTER);
    rects({ typed: rect(600, 1000), number: rect(610, 1000), control: rect(60, 1000) });
    const issues = pageFooterOverlapDiagnostics(doc, dom(doc, (id) => id === 'page-2'));
    expect(issues).toEqual([expect.objectContaining({ code: PAGE_FOOTER_OVERLAP_DIAGNOSTIC_CODE, severity: 'ERROR', pageId: 'page-2', objectId: 'typed-2' })]);
    expect(publicationDiagnosticMessage(PAGE_FOOTER_OVERLAP_DIAGNOSTIC_CODE)).toContain('apague');
  });

  it('lets text sit beside the footer words, and ignores hidden texts and catalogs without footer', () => {
    const doc = catalog(FOOTER);
    rects({ typed: rect(300, 1000), number: rect(610, 1000), control: rect(60, 1000) });
    expect(pageFooterOverlapDiagnostics(doc, dom(doc, () => true))).toEqual([]);
    rects({ typed: rect(610, 1000), number: rect(610, 1000), control: rect(60, 1000) });
    const hidden = { ...doc, pages: doc.pages.map((page) => ({ ...page, objects: page.objects.map((object) => ({ ...object, hidden: true })) })) };
    expect(pageFooterOverlapDiagnostics(hidden, dom(hidden, () => true))).toEqual([]);
    const without = catalog(undefined);
    expect(pageFooterOverlapDiagnostics(without, dom(without, () => true))).toEqual([]);
  });
});

describe('FR-55 preflight — incomplete footer is only a point to review', () => {
  it('names what is missing, in plain Portuguese, at the first page that shows the footer', () => {
    const doc = catalog({ showOnFirstPage: false, revision: '03' });
    const [issue] = pageFooterContentDiagnostics(doc);
    expect(issue).toEqual(expect.objectContaining({ code: PAGE_FOOTER_INCOMPLETE_DIAGNOSTIC_CODE, severity: 'WARNING', pageId: 'page-2' }));
    expect(publicationDiagnosticText(issue)).toBe('Faltam o código do documento e a data no rodapé das páginas. Clique na página, sem selecionar nada, e preencha em “Rodapé de todas as páginas”.');
    expect(contentDiagnostics(doc).some((entry) => entry.code === PAGE_FOOTER_INCOMPLETE_DIAGNOSTIC_CODE)).toBe(true);
    const one = pageFooterContentDiagnostics(catalog({ ...FOOTER, issuedOn: undefined }))[0];
    expect(publicationDiagnosticText(one)).toMatch(/^Falta a data no rodapé/);
  });

  it('says nothing when the footer is complete or off', () => {
    expect(pageFooterContentDiagnostics(catalog(FOOTER))).toEqual([]);
    expect(pageFooterContentDiagnostics(catalog(undefined))).toEqual([]);
  });
});

describe('FR-55 PDF file name', () => {
  it('uses <código>-<rev>_<IDIOMA> when the footer has a code, the title otherwise', () => {
    expect(publicationFileTitle(catalog(FOOTER))).toBe('MAN-PCON-XV-03_PT');
    expect(publicationFileTitle(catalog(undefined))).toBe('Folder PCON');
  });
});
