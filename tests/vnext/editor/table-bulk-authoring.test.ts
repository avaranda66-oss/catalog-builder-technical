import { describe, expect, it } from 'vitest';
import { plainRichText } from '@/vnext/domain';
import {
  prepareBulkClear,
  prepareExistingMarkerAssignment,
  prepareExternalTsvPaste,
  prepareNewMarkerAssignment,
  prepareTypedTablePaste,
  TableBulkAuthoringError,
} from '@/vnext/editor/table-bulk-authoring';
import {
  prepareTableClipboard,
  parseTypedTableClipboard,
} from '@/vnext/editor/table-clipboard';
import {
  tableCellSelection,
  tableColumnSelection,
  tableRangeSelection,
  tableRowSelection,
  tableSelectionIdentity,
  wholeTableSelection,
} from '@/vnext/editor/table-selection';
import { mergeCells } from '@/vnext/table';
import { emptyTable } from '../proof/test-data';

const identity = tableSelectionIdentity('page', 'object', 'table');
const point = (row: number, column: number) => ({ rowId: `r${row}`, columnId: `c${column}` });

describe('W4.D clipboard preparation', () => {
  it('serializes semantic cell content to text/plain TSV and typed payload without styles/IDs', () => {
    const table = emptyTable(2, 3);
    table.cells[0].content = { type: 'richText', value: plainRichText('rt', 'Texto') };
    table.cells[1].content = { type: 'technicalCode', value: 'TC-01' };
    table.cells[2].content = { type: 'measurement', valueText: '0.010', unit: 'V', qualifier: 'min' };
    table.cells[3].content = { type: 'marker', legendEntryId: 'legend-a' };
    table.legend = [{ id: 'legend-a', markerCode: '*', text: plainRichText('lg', 'Opcional') }];
    const selection = tableRangeSelection(identity, point(0, 0), point(1, 2));
    const clipboard = prepareTableClipboard(table, selection, []);
    expect(clipboard.tsv).toBe('Texto\tTC-01\t≥ 0.010 V\n*\t\t');
    expect(parseTypedTableClipboard(clipboard.typedText)).toEqual(clipboard.payload);
    expect(clipboard.payload.cells[3]).toMatchObject({
      type: 'marker',
      sourceLegendEntryId: 'legend-a',
      markerCode: '*',
    });
  });
  it('exports image alt text to TSV but typed image paste remains representational only', () => {
    const table = emptyTable(1, 1);
    table.cells[0].content = { type: 'image', assetId: 'asset' };
    table.cells[0].contentPresentation = {
      image: { fit: 'contain', targetWidthMm: 5, targetHeightMm: 5 },
    };
    const clipboard = prepareTableClipboard(
      table,
      tableCellSelection(identity, point(0, 0)),
      [{
        id: 'asset', version: '1', sha256: 'a'.repeat(64), mime: 'image/png',
        widthPx: 10, heightPx: 10, name: 'a.png', alt: 'Imagem técnica',
      }]
    );
    expect(clipboard.tsv).toBe('Imagem técnica');
    expect(clipboard.payload.cells[0]).toEqual({ type: 'image', alt: 'Imagem técnica' });
    expect(() => prepareTypedTablePaste(table, tableCellSelection(identity, point(0, 0)), clipboard.payload))
      .toThrowError(TableBulkAuthoringError);
  });

  it('allows one merged semantic owner as 1x1 copy and rejects multi-cell copy crossing spans', () => {
    const table = mergeCells(emptyTable(), 'cell0-0', 1, 2);
    table.cells[0].content = { type: 'technicalCode', value: 'MERGED' };
    const one = prepareTableClipboard(table, tableCellSelection(identity, point(0, 1)), []);
    expect(one.payload).toMatchObject({ rows: 1, columns: 1 });
    expect(one.tsv).toBe('MERGED');
    expect(() => prepareTableClipboard(
      table,
      tableRangeSelection(identity, point(0, 0), point(0, 1)),
      []
    )).toThrow('Multi-cell copy cannot intersect merged Table topology');
    expect(() => prepareTableClipboard(
      table,
      tableRangeSelection(identity, point(0, 0), point(1, 1)),
      []
    )).toThrow('Multi-cell copy cannot intersect merged Table topology');
  });
});

describe('W4.D deterministic paste geometry', () => {
  it('expands MxN from one ordinary cell, accepts exact range, and rejects larger mismatches/no tiling', () => {
    const table = emptyTable(4, 4);
    const matrix = [['A', 'B', 'C'], ['D', 'E', 'F']];
    const fromCell = prepareExternalTsvPaste(table, tableCellSelection(identity, point(1, 0)), matrix);
    expect(fromCell.geometry).toEqual({ rowIds: ['r1', 'r2'], columnIds: ['c0', 'c1', 'c2'] });
    expect(fromCell.targets.map((target) => target.cellId)).toEqual([
      'cell1-0','cell1-1','cell1-2','cell2-0','cell2-1','cell2-2',
    ]);
    const exact = prepareExternalTsvPaste(
      table,
      tableRangeSelection(identity, point(0, 1), point(1, 3)),
      matrix
    );
    expect(exact.geometry).toEqual({ rowIds: ['r0', 'r1'], columnIds: ['c1', 'c2', 'c3'] });
    expect(() => prepareExternalTsvPaste(
      table,
      tableRangeSelection(identity, point(0, 0), point(3, 3)),
      [['A','B'],['C','D']]
    )).toThrowError(TableBulkAuthoringError);
  });

  it('broadcasts only 1x1 across range/rows/columns/table and maps external values only to empty/RichText', () => {
    const table = emptyTable(2, 2);
    for (const selection of [
      tableRangeSelection(identity, point(0, 0), point(1, 1)),
      tableRowSelection(identity, 'r0', 'r1'),
      tableColumnSelection(identity, 'c0', 'c1'),
      wholeTableSelection(identity),
    ]) {
      const prepared = prepareExternalTsvPaste(table, selection, [['12.5 V']]);
      expect(prepared.targets).toHaveLength(4);
      expect(prepared.targets.every((target) =>
        target.content.type === 'richTextPlain' && target.content.plainText === '12.5 V'
      )).toBe(true);
    }
    const empty = prepareExternalTsvPaste(table, tableCellSelection(identity, point(0, 0)), [['']]);
    expect(empty.targets[0].content).toEqual({ type: 'empty' });
  });
  it('rejects out-of-bounds and merged matrix/clear/marker operations but allows scalar paste to merged owner', () => {
    const ordinary = emptyTable(2, 2);
    expect(() => prepareExternalTsvPaste(
      ordinary,
      tableCellSelection(identity, point(1, 1)),
      [['A','B']]
    )).toThrowError(TableBulkAuthoringError);

    const merged = mergeCells(emptyTable(), 'cell0-0', 1, 2);
    const mergedSelection = tableCellSelection(identity, point(0, 1));
    const scalar = prepareExternalTsvPaste(merged, mergedSelection, [['A']]);
    expect(scalar.targets.map((target) => target.cellId)).toEqual(['cell0-0']);
    expect(() => prepareExternalTsvPaste(
      merged,
      tableRangeSelection(identity, point(0, 0), point(1, 1)),
      [['A','B'],['C','D']]
    )).toThrowError(TableBulkAuthoringError);
    expect(() => prepareBulkClear(
      merged,
      tableRangeSelection(identity, point(0, 0), point(0, 1))
    )).toThrowError(TableBulkAuthoringError);
    expect(() => prepareBulkClear(
      merged,
      tableRangeSelection(identity, point(0, 0), point(1, 1))
    )).toThrowError(TableBulkAuthoringError);
    merged.legend = [{ id: 'l', markerCode: '*', text: plainRichText('l', 'L') }];
    expect(() => prepareExistingMarkerAssignment(
      merged,
      tableRangeSelection(identity, point(0, 0), point(1, 1)),
      'l'
    )).toThrowError(TableBulkAuthoringError);
  });

  it('blocks Image destination clear and typed paste', () => {
    const table = emptyTable();
    table.cells[0].content = { type: 'image', assetId: 'a' };
    table.cells[0].contentPresentation = {
      image: { fit: 'contain', targetWidthMm: 2, targetHeightMm: 2 },
    };
    expect(() => prepareBulkClear(table, tableCellSelection(identity, point(0, 0))))
      .toThrowError(TableBulkAuthoringError);
  });
});
describe('W4.D Marker reconciliation planning', () => {
  it('reuses same-table canonical Legend references', () => {
    const source = emptyTable(1, 1);
    source.legend = [{ id: 'l1', markerCode: '*', text: plainRichText('lg', 'Opcional') }];
    source.cells[0].content = { type: 'marker', legendEntryId: 'l1' };
    const payload = prepareTableClipboard(source, tableCellSelection(identity, point(0, 0)), []).payload;
    const prepared = prepareTypedTablePaste(source, tableCellSelection(identity, point(0, 0)), payload);
    expect(prepared.legendCreates).toBeUndefined();
    expect(prepared.expectedLegend).toBeUndefined();
    expect(prepared.targets[0].content).toEqual({
      type: 'marker',
      legend: { kind: 'existing', legendEntryId: 'l1' },
    });
  });

  it('clones one fresh destination Legend plan for repeated cross-table source Marker meaning', () => {
    const source = emptyTable(1, 2);
    source.legend = [{ id: 'source-l', markerCode: '*', text: plainRichText('lg', 'Opcional') }];
    source.cells.forEach((cell) => { cell.content = { type: 'marker', legendEntryId: 'source-l' }; });
    const sourceIdentity = tableSelectionIdentity('p', 'o', source.id);
    const payload = prepareTableClipboard(
      source,
      tableRangeSelection(sourceIdentity, point(0, 0), point(0, 1)),
      []
    ).payload;
    const destination = emptyTable(1, 2);
    const prepared = prepareTypedTablePaste(
      destination,
      tableRangeSelection(identity, point(0, 0), point(0, 1)),
      payload
    );
    expect(prepared.legendCreates).toHaveLength(1);
    expect(prepared.expectedLegend).toEqual([]);
    expect(prepared.targets.every((target) =>
      target.content.type === 'marker' && target.content.legend.kind === 'created'
    )).toBe(true);
  });
  it('reuses equivalent destination code/text and rejects conflicting or ambiguous meaning', () => {
    const source = emptyTable(1, 1);
    source.legend = [{ id: 'source-l', markerCode: '*', text: plainRichText('src', 'Opcional') }];
    source.cells[0].content = { type: 'marker', legendEntryId: 'source-l' };
    const sourceIdentity = tableSelectionIdentity('p', 'o', source.id);
    const payload = prepareTableClipboard(source, tableCellSelection(sourceIdentity, point(0, 0)), []).payload;

    const equivalent = emptyTable(1, 1);
    equivalent.legend = [{ id: 'dest-l', markerCode: '*', text: plainRichText('dest', 'Opcional') }];
    const reused = prepareTypedTablePaste(equivalent, tableCellSelection(identity, point(0, 0)), payload);
    expect(reused.targets[0].content).toEqual({
      type: 'marker',
      legend: { kind: 'existing', legendEntryId: 'dest-l' },
    });

    const conflict = structuredClone(equivalent);
    conflict.legend[0].text = plainRichText('different', 'Outra coisa');
    expect(() => prepareTypedTablePaste(conflict, tableCellSelection(identity, point(0, 0)), payload))
      .toThrowError(TableBulkAuthoringError);

    const ambiguous = structuredClone(equivalent);
    ambiguous.legend.push({ id: 'dest-l2', markerCode: '*', text: plainRichText('d2', 'Opcional') });
    expect(() => prepareTypedTablePaste(ambiguous, tableCellSelection(identity, point(0, 0)), payload))
      .toThrowError(TableBulkAuthoringError);
  });

  it('prepares create+assign as one atomic bulk mutation and refuses duplicate authored code', () => {
    const table = emptyTable(1, 2);
    const selection = tableRangeSelection(identity, point(0, 0), point(0, 1));
    const prepared = prepareNewMarkerAssignment(table, selection, '†', 'Sob consulta');
    expect(prepared.legendCreates).toHaveLength(1);
    expect(prepared.targets).toHaveLength(2);
    expect(prepared.targets.every((target) =>
      target.content.type === 'marker' && target.content.legend.kind === 'created'
    )).toBe(true);
    table.legend = [{ id: 'l', markerCode: '†', text: plainRichText('l', 'Já existe') }];
    expect(() => prepareNewMarkerAssignment(table, selection, '†', 'Outra'))
      .toThrowError(TableBulkAuthoringError);
  });
});
