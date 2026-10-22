import { describe, expect, it } from 'vitest';
import { validateTable } from '@/vnext/table/table-model';
import {
  describeGrowth,
  detectHeaderRow,
  estimateTableHeightMm,
  growTableModel,
  isTabularClipboardText,
  parsePastedTable,
  pastedTableModel,
  planPasteGrowth,
} from '@/vnext/editor/table-paste-import';
import { tableCellSelection, tableSelectionIdentity } from '@/vnext/editor/table-selection';
import type { TableModel } from '@/vnext/domain';

const limits = { maxRows: 150, maxColumns: 10 };

function parsed(text: string) {
  const result = parsePastedTable(text, limits);
  if (!result.ok) throw new Error(`Expected a table, got ${result.problem}`);
  return result.table;
}

function textOf(table: TableModel, row: number, column: number): string {
  const cell = table.cells.find((entry) => entry.rowId === table.rows[row].id && entry.columnId === table.columns[column].id);
  if (!cell || cell.content.type !== 'richText') return '';
  return cell.content.value.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '').join('')).join('\n');
}

const excelModels = 'Modelo\tFaixa\tExatidão\r\nTA-25N\t-25 °C a 140 °C\t±0,1 °C\r\nTA-50N\t-40 °C a 155 °C\t±0,15 °C\r\n';

describe('FR-31 parsing text copied from Excel', () => {
  it('keeps every value literally (±0,1 °C) and drops the final line break Excel adds', () => {
    const table = parsed(excelModels);
    expect(table.rowCount).toBe(3);
    expect(table.columnCount).toBe(3);
    expect(table.cells[1]).toEqual(['TA-25N', '-25 °C a 140 °C', '±0,1 °C']);
    expect(table.cells[2][2]).toBe('±0,15 °C');
    expect(table.paddedRows).toEqual([]);
  });

  it('detects a header above numeric data and builds a valid table with it', () => {
    const table = parsed(excelModels);
    expect(table.header).toBe(true);
    const model = pastedTableModel(table, { header: table.header });
    expect(validateTable(model).filter((diagnostic) => diagnostic.severity === 'ERROR')).toEqual([]);
    expect(model.rows.map((row) => row.role)).toEqual(['header', 'body', 'body']);
    expect(textOf(model, 1, 2)).toBe('±0,1 °C');
    expect(textOf(model, 0, 2)).toBe('Exatidão');
  });

  it('does not invent a header for a label/value specification table', () => {
    expect(parsed('Faixa de medição\t-25 °C a 140 °C\nExatidão\t±0,1 °C').header).toBe(false);
    expect(parsed('Sensor\tPt-100 a 4 fios\nFaixa\t-25 a 140 °C').header).toBe(false);
    expect(parsed('Peso\tAproximadamente 3 kg\nAlimentação\tBateria').header).toBe(false);
  });

  it('recognises typical two-column titles and text-only tables with title words', () => {
    expect(parsed('Característica\tValor\nFaixa\t-25 a 140 °C').header).toBe(true);
    expect(parsed('Código\tDescrição\nCB-01\tCabo de 2 m').header).toBe(true);
    expect(parsed('Produto\tAplicação\tTipo\nCalibrador\tLaboratório\tPortátil').header).toBe(true);
    expect(detectHeaderRow([['Somente uma linha', 'sem dados']])).toBe(false);
    expect(detectHeaderRow([['', 'Faixa', 'Exatidão'], ['TA-25N', '1', '2']])).toBe(false);
  });

  it('2D: model codes in the first row are data, unless the row names the columns (Modelo | TA-25N | TA-35N)', () => {
    // A list without a header: the first row is the first product (1F review).
    expect(detectHeaderRow([['TA-25N', 'Portátil', 'Pt-100'], ['TA-50N', 'Bancada', '-40 a 155 °C']])).toBe(false);
    expect(detectHeaderRow([['Calibrador', 'Portátil', 'TA-25N'], ['Banho', 'Bancada', '-40 a 155 °C']])).toBe(false);
    expect(parsed('TA-25N\tPortátil\tPt-100\nTA-50N\tBancada\t-40 a 155 °C').header).toBe(false);
    // A comparison: the first cell says what the columns are, the others are the models.
    expect(parsed('Modelo\tTA-25N\tTA-35N\nFaixa\t-25 a 140 °C\t-35 a 140 °C\nExatidão\t±0,1 °C\t±0,1 °C').header).toBe(true);
    expect(parsed('Modelo\tTA-25N\tTA-35N\nAplicação\tBancada\tCampo').header).toBe(true);
    // The same comparison with an empty corner above the row names.
    expect(parsed('\tTA-25N\tTA-35N\nFaixa\t-25 a 140 °C\t-35 a 140 °C').header).toBe(true);
    // Numbered column titles above data stay a header.
    expect(parsed('Faixa 1\tFaixa 2\tFaixa 3\n0 a 10 V\t4 a 20 mA\t0 a 20 mA').header).toBe(true);
    // A code with a word that is not a title is still data.
    expect(detectHeaderRow([['Modelo', 'TA-25N', 'Bancada'], ['Faixa', '1', '2']])).toBe(false);
  });

  it('keeps quoted multi-line cells and quotes exactly like the spreadsheet copied them', () => {
    const table = parsed('Item\tObservação\n1\t"Linha 1\nLinha 2"\n2\t"Diz ""olá"""');
    expect(table.rowCount).toBe(3);
    expect(table.cells[1][1]).toBe('Linha 1\nLinha 2');
    expect(table.cells[2][1]).toBe('Diz "olá"');
    const model = pastedTableModel(table, { header: true });
    const cell = model.cells.find((entry) => entry.rowId === model.rows[1].id && entry.columnId === model.columns[1].id);
    expect(cell?.content.type === 'richText' && cell.content.value.paragraphs).toHaveLength(2);
  });

  it('falls back to a literal split when a stray quote is not valid spreadsheet quoting', () => {
    const table = parsed('"Polegada\t2" nominal\nA\tB');
    expect(table.cells[0]).toEqual(['"Polegada', '2" nominal']);
  });

  it('completes short rows with empty cells and reports which rows were completed', () => {
    const table = parsed('A\tB\tC\nx\ny\tz\n1\t2\t3');
    expect(table.columnCount).toBe(3);
    expect(table.cells[1]).toEqual(['x', '', '']);
    expect(table.cells[2]).toEqual(['y', 'z', '']);
    expect(table.paddedRows).toEqual([2, 3]);
  });

  it('trims trailing empty rows and columns from the copied range', () => {
    const table = parsed('A\tB\t\t\n1\t2\t\t\n\t\t\t\n\t\t\t\n');
    expect(table.rowCount).toBe(2);
    expect(table.columnCount).toBe(2);
  });

  it('removes invisible control characters but keeps tabs inside quoted cells', () => {
    const table = parsed('A\u0007B\t"x\ty"\n1\t2');
    expect(table.cells[0]).toEqual(['AB', 'x\ty']);
  });

  it('refuses empty, too wide and too long pastes with the measured size', () => {
    expect(parsePastedTable('\n\t\n', limits)).toMatchObject({ ok: false, problem: 'EMPTY' });
    expect(parsePastedTable(Array.from({ length: 12 }, (_, index) => `C${index}`).join('\t'), limits))
      .toMatchObject({ ok: false, problem: 'TOO_MANY_COLUMNS', columnCount: 12 });
    expect(parsePastedTable(Array.from({ length: 151 }, (_, index) => `${index}\tx`).join('\n'), limits))
      .toMatchObject({ ok: false, problem: 'TOO_MANY_ROWS', rowCount: 151 });
  });

  it('treats only text with columns (a tab) as a spreadsheet block', () => {
    expect(isTabularClipboardText(excelModels)).toBe(true);
    expect(isTabularClipboardText('Um parágrafo\ncom duas linhas')).toBe(false);
    expect(isTabularClipboardText('\t\n\t')).toBe(false);
  });

  it('gives longer text columns a larger share of the width', () => {
    const model = pastedTableModel(parsed('Código\tDescrição\nCB\tCabo blindado de dois metros com conector para o calibrador'), { header: true });
    expect(model.columns.map((column) => column.width)).toEqual([
      { mode: 'flex', weight: 1 },
      { mode: 'flex', weight: 4 },
    ]);
  });
});

describe('FR-31 height estimate for a new table', () => {
  const style = { fontSizePt: 10, lineHeight: 1.25 };

  it('sizes an empty 6-row table close to one text line per row', () => {
    const empty = pastedTableModel(parsed('A\tB\tC\n\t\tx\n\t\tx\n\t\tx\n\t\tx\n\t\tx'), { header: true });
    const padded = { ...empty, style: { ...empty.style, base: { paddingMm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } } } };
    const height = estimateTableHeightMm(padded, style, 186);
    // 6 × (4.41 mm line + 3 mm padding) = 44.5 mm, plus a small safety margin.
    expect(height).toBeGreaterThanOrEqual(44.5);
    expect(height).toBeLessThanOrEqual(50);
  });

  it('grows when long text wraps in a narrow column', () => {
    const short = pastedTableModel(parsed('A\tB\nx\ty'), { header: false });
    const long = pastedTableModel(parsed(`A\tB\nx\t${'palavra '.repeat(40)}`), { header: false });
    expect(estimateTableHeightMm(long, style, 100)).toBeGreaterThan(estimateTableHeightMm(short, style, 100) + 8);
  });
});

describe('FR-31 growing a table before a larger paste', () => {
  const table = pastedTableModel(parsed('A\tB\n1\t2'), { header: true, idPrefix: 'grid' });
  const identity = tableSelectionIdentity('page', 'object', table.id);
  const at = (row: number, column: number) => tableCellSelection(identity, { rowId: table.rows[row].id, columnId: table.columns[column].id });

  it('counts only the rows and columns missing from the chosen cell', () => {
    expect(planPasteGrowth(table, at(1, 0), 4, 2)).toEqual({
      rowsToAdd: 3, columnsToAdd: 0, lastRowId: table.rows[1].id, lastColumnId: table.columns[1].id,
    });
    expect(planPasteGrowth(table, at(1, 1), 1, 3)).toMatchObject({ rowsToAdd: 0, columnsToAdd: 2 });
    expect(planPasteGrowth(table, at(0, 0), 2, 2)).toBeUndefined();
  });

  it('simulates the growth without touching the original table', () => {
    const before = structuredClone(table);
    const grown = growTableModel(table, { rowsToAdd: 2, columnsToAdd: 1 });
    expect(grown.rows).toHaveLength(4);
    expect(grown.columns).toHaveLength(3);
    expect(grown.cells).toHaveLength(12);
    expect(grown.rows.slice(2).every((row) => row.role === 'body')).toBe(true);
    expect(table).toEqual(before);
  });

  it('describes the growth in plain Portuguese', () => {
    expect(describeGrowth({ rowsToAdd: 1, columnsToAdd: 0 })).toBe('1 linha');
    expect(describeGrowth({ rowsToAdd: 3, columnsToAdd: 0 })).toBe('3 linhas');
    expect(describeGrowth({ rowsToAdd: 2, columnsToAdd: 1 })).toBe('2 linhas e 1 coluna');
    expect(describeGrowth({ rowsToAdd: 0, columnsToAdd: 2 })).toBe('2 colunas');
  });
});
