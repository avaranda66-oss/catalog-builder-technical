import { describe, expect, it } from 'vitest';
import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { publicationDiagnosticLocation, publicationDiagnosticText } from '@/vnext/app/publication-diagnostic-presentation';
import { plainRichText, type CatalogDocument, type TableModel, type TableObject } from '@/vnext/domain';
import { PRESYS_STARTER } from '@/vnext/library/presys-ta25n-starter';
import {
  contentDiagnostics,
  effectivePpi,
  emptyTableRowDiagnostics,
  findPlaceholder,
  imageResolutionDiagnostics,
  layoutReport,
  placeholderDiagnostics,
} from '@/vnext/publication/preflight';

function baseDocument(): CatalogDocument {
  let id = 0;
  const document = createW2CDemoDocument(() => `content-${++id}`);
  document.pages = [{ ...document.pages[0], objects: [] }];
  return document;
}

function cellText(table: TableModel, row: number, column: number, text: string): void {
  const cell = table.cells.find((entry) => entry.rowId === table.rows[row].id && entry.columnId === table.columns[column].id)!;
  cell.content = { type: 'richText', value: plainRichText(`${cell.id}-text`, text) };
}

function tableObject(rows: number, columns: number): TableObject {
  const table = createMinimalW2CTable();
  const columnTemplate = table.columns[0], rowTemplate = table.rows[0];
  table.columns = Array.from({ length: columns }, (_, index) => ({ ...columnTemplate, id: `column-${index}` }));
  table.rows = Array.from({ length: rows }, (_, index) => ({ ...rowTemplate, id: `row-${index}`, role: index === 0 ? 'header' as const : 'body' as const }));
  table.cells = table.rows.flatMap((row) => table.columns.map((column) => ({
    id: `cell-${row.id}-${column.id}`, rowId: row.id, columnId: column.id, content: { type: 'empty' as const },
  })));
  return { id: 'table-object', type: 'table', frame: { xMm: 20, yMm: 20, widthMm: 120, heightMm: 60 }, zIndex: 0, table };
}

describe('FR-51 placeholder detection', () => {
  it.each([
    ['A COMPLETAR', 'A COMPLETAR'],
    ['Faixa: a completar', 'a completar'],
    ['Valor A CONFIRMAR pela fábrica', 'A CONFIRMAR'],
    ['TBD', 'TBD'],
    ['Código XXX', 'XXX'],
    ['A COMPLETAR · revisar com engenharia', 'A COMPLETAR'],
    ['Revisar com engenharia', 'Revisar com engenharia'],
  ])('finds the provisional marker in %j', (text, token) => {
    expect(findPlaceholder(text)).toBe(token);
  });

  it.each([
    'TA-50N-NH-PB-XXXXXXXXXXXX',
    '06.04.0121-00/IN1P/XXX',
    'Completar a calibração em 24 h',
    'Confirmar o pedido com o vendedor',
    'Xxxl',
    '±0,1 °C',
  ])('keeps legitimate content %j publishable', (text) => {
    expect(findPlaceholder(text)).toBeUndefined();
  });

  it('blocks provisional text in text, cells, codes, titles, notes and legends with the exact location', () => {
    const document = baseDocument();
    const table = tableObject(3, 2);
    cellText(table.table, 0, 0, 'Parâmetro');
    cellText(table.table, 1, 1, 'A COMPLETAR');
    table.table.cells.find((cell) => cell.rowId === 'row-2' && cell.columnId === 'column-0')!.content = { type: 'technicalCode', value: 'TBD' };
    table.table.title = plainRichText('title', 'Especificações A CONFIRMAR');
    table.table.annotations = [{ id: 'note-1', kind: 'note', text: plainRichText('note', 'Revisar com engenharia') }];
    table.table.legend = [{ id: 'legend-1', markerCode: '*', text: plainRichText('legend', 'XXX') }];
    document.pages[0].objects = [
      { id: 'text-object', type: 'text', frame: { xMm: 20, yMm: 100, widthMm: 80, heightMm: 10 }, zIndex: 1, text: plainRichText('free', 'Dados divergentes: A COMPLETAR.'), style: {} },
      table,
    ];
    const before = JSON.stringify(document);
    const diagnostics = placeholderDiagnostics(document);
    expect(JSON.stringify(document)).toBe(before);
    expect(diagnostics).toHaveLength(6);
    expect(diagnostics.every((issue) => issue.code === 'UNRESOLVED_PLACEHOLDER' && issue.severity === 'ERROR')).toBe(true);
    expect(diagnostics.map((issue) => publicationDiagnosticLocation(document, issue))).toEqual([
      'Página 1 · texto 1',
      'Página 1 · tabela 1 · título',
      'Página 1 · tabela 1 · linha 2, coluna 2',
      'Página 1 · tabela 1 · linha 3, coluna 1',
      'Página 1 · tabela 1 · nota 1',
      'Página 1 · tabela 1 · legenda',
    ]);
    expect(publicationDiagnosticText(diagnostics[2])).toBe('Ainda está escrito “A COMPLETAR”. Troque pela informação correta antes de publicar.');
    expect(publicationDiagnosticText(diagnostics[1])).toContain('no título da tabela');
    for (const issue of diagnostics) expect(publicationDiagnosticText(issue)).not.toMatch(/UNRESOLVED|surface|token/);
  });

  it('reports the official TA-25N starter as blocked, listing its six pending fields and the source note', () => {
    const document = PRESYS_STARTER.sourceDocument;
    const placeholders = placeholderDiagnostics(document);
    const cells = placeholders.filter((issue) => issue.cellId);
    expect(cells).toHaveLength(6);
    expect(placeholders.filter((issue) => !issue.cellId).map((issue) => issue.objectId)).toEqual(['presys-source-note']);
    expect(placeholders.every((issue) => publicationDiagnosticLocation(document, issue).startsWith('Página '))).toBe(true);
    // The starter photo is about 145 ppi at its printed size: a review point, not a block.
    expect(imageResolutionDiagnostics(document)).toEqual([expect.objectContaining({
      code: 'IMAGE_LOW_RESOLUTION', severity: 'WARNING', objectId: 'presys-product-image', details: 'effectivePpi=145; minimumPpi=150',
    })]);
  });
});

describe('FR-51 empty rows and image resolution', () => {
  it('warns once per table about fully empty rows, ignoring section rows and rows covered by a filled merge', () => {
    const document = baseDocument();
    const table = tableObject(6, 2);
    cellText(table.table, 0, 0, 'Parâmetro');
    cellText(table.table, 1, 0, 'Faixa');
    cellText(table.table, 1, 1, 'mesclado');
    // Row 3 (index 2) only looks empty: its second cell is covered by the filled merge that starts in row 2.
    table.table.cells.find((cell) => cell.rowId === 'row-1' && cell.columnId === 'column-1')!.span = { rows: 2, columns: 1 };
    const covered = table.table.cells.find((cell) => cell.rowId === 'row-2' && cell.columnId === 'column-1')!;
    covered.coveredBy = `cell-row-1-column-1`;
    table.table.rows[3] = { ...table.table.rows[3], role: 'section' };
    document.pages[0].objects = [table];
    const diagnostics = emptyTableRowDiagnostics(document);
    expect(diagnostics).toEqual([expect.objectContaining({
      code: 'EMPTY_TABLE_ROW', severity: 'WARNING', objectId: 'table-object', tableId: table.table.id, rowId: 'row-4', details: 'emptyRows=2',
    })]);
    expect(publicationDiagnosticLocation(document, diagnostics[0])).toBe('Página 1 · tabela 1 · linha 5');
    expect(publicationDiagnosticText(diagnostics[0])).toBe('Esta tabela tem 2 linhas vazias, que sairão em branco no PDF. Preencha as linhas ou remova as que sobraram.');
  });

  it('computes print density for contain and cover images and table image cells', () => {
    expect(Math.floor(effectivePpi({ widthPx: 720, heightPx: 482 }, 126, 84.35, 'contain'))).toBe(145);
    expect(Math.floor(effectivePpi({ widthPx: 1200, heightPx: 600 }, 50.8, 50.8, 'contain'))).toBe(600);
    expect(Math.floor(effectivePpi({ widthPx: 1200, heightPx: 600 }, 50.8, 50.8, 'cover'))).toBe(300);
    const document = baseDocument();
    const asset = { ...document.assets[0], id: 'photo', widthPx: 300, heightPx: 300 };
    document.assets = [asset];
    const table = tableObject(2, 1);
    const cell = table.table.cells[1];
    cell.content = { type: 'image', assetId: 'photo' };
    cell.contentPresentation = { image: { fit: 'contain', targetWidthMm: 25.4, targetHeightMm: 25.4 } };
    document.pages[0].objects = [
      { id: 'sharp', type: 'image', frame: { xMm: 10, yMm: 10, widthMm: 25.4, heightMm: 25.4 }, zIndex: 0, assetId: 'photo', fit: 'contain' },
      { id: 'soft', type: 'image', frame: { xMm: 10, yMm: 50, widthMm: 101.6, heightMm: 101.6 }, zIndex: 0, assetId: 'photo', fit: 'cover' },
      table,
    ];
    expect(imageResolutionDiagnostics(document).map((issue) => [issue.objectId, issue.cellId ?? null, issue.details])).toEqual([
      ['soft', null, 'effectivePpi=75; minimumPpi=150'],
    ]);
    cell.contentPresentation = { image: { fit: 'contain', targetWidthMm: 76.2, targetHeightMm: 76.2 } };
    expect(imageResolutionDiagnostics(document).map((issue) => issue.cellId ?? issue.objectId)).toEqual(['soft', cell.id]);
  });

  it('feeds the publication preflight without changing the document', () => {
    const document = baseDocument();
    const table = tableObject(2, 1);
    cellText(table.table, 0, 0, 'Parâmetro');
    cellText(table.table, 1, 0, 'TBD');
    document.pages[0].objects = [table];
    const before = JSON.stringify(document);
    expect(layoutReport(document, new Map(), { facts: [], geometryDiagnostics: [] }, window.document.createElement('div')))
      .toContainEqual(expect.objectContaining({ code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR', objectId: 'table-object', rowId: 'row-1' }));
    expect(JSON.stringify(document)).toBe(before);
    expect(contentDiagnostics(baseDocument())).toEqual([]);
  });
});
