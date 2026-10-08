import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument } from '@/vnext/application';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { layoutReport, printableContentOverlapDiagnostics } from '@/vnext/publication/preflight';
import { publicationDiagnosticMessage } from '@/vnext/app/publication-diagnostic-presentation';
import { compilePlans, type LayoutSnapshot } from '@/vnext/rendering';
import { createW4F1Document } from '../proof/fixtures/w4f1-table-document';

afterEach(() => vi.restoreAllMocks());
function fixture() {
  let id = 0;
  const doc: CatalogDocument = createCatalogDocument(() => `overlap-${++id}`, 'Revisão técnica');
  doc.pages[0].objects = ['first', 'second'].map((id, index) => ({
    id, type: 'text', frame: { xMm: 10, yMm: 10, widthMm: 180, heightMm: 100 }, zIndex: index,
    text: plainRichText(id, 'Temperatura ±0,1 °C'), style: {},
  }));
  const root = document.createElement('div');
  root.innerHTML = '<div data-object-id="first"><span data-inline-id="first:t">Primeiro</span></div><div data-object-id="second"><span data-inline-id="second:t">Segundo</span></div>';
  return { doc, root };
}
function rect(x: number, y: number, width = 90, height = 12): DOMRect {
  return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) };
}
function textRects(first: DOMRect, second: DOMRect) {
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    let selected: Node;
    return { selectNodeContents: (node: Node) => { selected = node; }, getClientRects: () => [selected.parentElement?.dataset.objectId === 'first' ? first : second] } as unknown as Range;
  });
}
describe('Publication actual printable overlap', () => {
  it('blocks visibly colliding text and locates both objects with actionable language', () => {
    const { doc, root } = fixture(); textRects(rect(10, 10), rect(20, 15));
    const diagnostics = printableContentOverlapDiagnostics(doc, root);
    expect(diagnostics.map(issue => issue.objectId)).toEqual(['first', 'second']);
    expect(diagnostics.every(issue => issue.code === 'PRINTABLE_CONTENT_OVERLAP' && issue.severity === 'ERROR')).toBe(true);
    expect(publicationDiagnosticMessage(diagnostics[0].code)).toContain('Mova os objetos');
  });
  it('allows overlapping empty frame space when actual text runs are separate or merely touch', () => {
    const { doc, root } = fixture(); textRects(rect(10, 10), rect(10, 25));
    expect(printableContentOverlapDiagnostics(doc, root)).toEqual([]);
    textRects(rect(10, 10), rect(100, 10));
    expect(printableContentOverlapDiagnostics(doc, root)).toEqual([]);
  });
  it('keeps intentional decorative shape backgrounds out of overlap errors', () => {
    const { doc, root } = fixture();
    doc.pages[0].objects[1] = { id: 'second', type: 'shape', frame: { xMm: 10, yMm: 10, widthMm: 180, heightMm: 100 }, zIndex: 0, shape: 'rectangle', style: { fill: '#FFFFFF' } };
    expect(printableContentOverlapDiagnostics(doc, root)).toEqual([]);
  });
  it('keeps independent overflow diagnostics when another table has an infeasible blocked layout', () => {
    const doc = createW4F1Document();
    doc.pages[0].objects[1].frame.widthMm = 1;
    const compiled = compilePlans(doc);
    const first = doc.pages[0].objects[0];
    if (first.type !== 'table') throw new Error('Expected table fixture');
    const root = document.createElement('div');
    root.innerHTML = `<div data-object-id="${first.id}"><div data-table-id="${first.table.id}"></div></div><div data-object-id="w4f1-merged-object"><div role="alert">Tabela bloqueada: geometria inviável.</div></div>`;
    const snapshot: LayoutSnapshot = { geometryDiagnostics: [], facts: [{
      kind: 'cell', pageId: doc.pages[0].id, tableId: first.table.id, cellId: first.table.cells[0].id,
      xQ: 0, yQ: 0, widthQ: 10, heightQ: 10, intrinsicContentWidthQ: 100, intrinsicContentHeightQ: 100,
    }] };
    const diagnostics = [...compiled.diagnostics, ...layoutReport(doc, compiled.plans, snapshot, root)];
    expect(diagnostics.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'TABLE_WIDTH_INFEASIBLE', 'CELL_CONTENT_OVERFLOW', 'ROW_CONTENT_OVERFLOW',
    ]));
    expect(diagnostics.some(issue => issue.severity === 'ERROR')).toBe(true);
    root.querySelector('[data-table-id]')!.remove();
    expect(() => layoutReport(doc, compiled.plans, snapshot, root)).toThrow('RENDER_ELEMENT_MISSING');
  });
});
