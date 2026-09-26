import { describe, expect, it } from 'vitest';
import { plainRichText } from '@/vnext/domain';
import {
  annotationLabel,
  annotationTargetForCell,
  annotationTargetForTable,
  annotationUsageCount,
  annotationUsages,
  legendUsageCells,
  moveId,
  nextLegendUsageCellId,
  selectedSingleAnchorCell,
} from '@/vnext/editor/table-semantic-authoring';
import { emptyTable } from '../proof/test-data';

describe('W4.F.3 pure semantic authoring projections', () => {
  it('projects Table/Cell annotation targets and rejects covered Cells', () => {
    const table = emptyTable();
    table.annotationIds = ['table-note'];
    table.cells[0].annotationIds = ['cell-note'];
    expect(annotationTargetForTable(table)).toEqual({
      kind: 'TABLE',
      expectedAnnotationIds: ['table-note'],
    });
    expect(annotationTargetForCell(table, table.cells[0].id)).toEqual({
      kind: 'CELL',
      cellId: table.cells[0].id,
      expectedAnnotationIds: ['cell-note'],
    });
    table.cells[1].coveredBy = table.cells[0].id;
    expect(annotationTargetForCell(table, table.cells[1].id)).toBeUndefined();
  });

  it('reports annotation usages in stable Table then anchor order', () => {
    const table = emptyTable();
    table.annotations = [{ id: 'note', kind: 'note', text: plainRichText('note', 'Nota') }];
    table.annotationIds = ['note'];
    table.cells[2].annotationIds = ['note'];
    table.cells[0].annotationIds = ['note'];
    expect(annotationUsages(table, 'note')).toEqual([
      { kind: 'TABLE' },
      { kind: 'CELL', cellId: 'cell0-0' },
      { kind: 'CELL', cellId: 'cell0-2' },
    ]);
    expect(annotationUsageCount(table, 'note')).toBe(3);
  });

  it('finds and cycles Legend usages using canonical anchor order only', () => {
    const table = emptyTable();
    table.legend = [{ id: 'legend', markerCode: '*', text: plainRichText('legend', 'Legenda') }];
    table.cells[4].content = { type: 'marker', legendEntryId: 'legend' };
    table.cells[0].content = { type: 'marker', legendEntryId: 'legend' };
    table.cells[1].content = { type: 'marker', legendEntryId: 'other' };
    expect(legendUsageCells(table, 'legend').map((cell) => cell.id)).toEqual(['cell0-0', 'cell1-1']);
    expect(nextLegendUsageCellId(table, 'legend')).toBe('cell0-0');
    expect(nextLegendUsageCellId(table, 'legend', 'cell0-0')).toBe('cell1-1');
    expect(nextLegendUsageCellId(table, 'legend', 'cell1-1')).toBe('cell0-0');
    expect(nextLegendUsageCellId(table, 'missing')).toBeUndefined();
  });

  it('moves IDs without mutation and keeps same reference at list boundaries', () => {
    const order = ['a', 'b', 'c'] as const;
    expect(moveId(order, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveId(order, 'b', 'down')).toEqual(['a', 'c', 'b']);
    expect(moveId(order, 'a', 'up')).toBe(order);
    expect(moveId(order, 'c', 'down')).toBe(order);
    expect(moveId(order, 'missing', 'down')).toBe(order);
  });

  it('labels annotation kinds and requires one explicit anchor Cell', () => {
    const table = emptyTable();
    expect(annotationLabel({ id: 'c', kind: 'caption', text: plainRichText('c', 'C') })).toBe('Legenda');
    expect(annotationLabel({ id: 'n', kind: 'note', text: plainRichText('n', 'N') })).toBe('Nota');
    expect(annotationLabel({ id: 'f', kind: 'footnote', text: plainRichText('f', 'F') })).toBe('Nota de rodapé');
    expect(selectedSingleAnchorCell(table, [table.cells[0].id])?.id).toBe(table.cells[0].id);
    expect(selectedSingleAnchorCell(table, [table.cells[0].id, table.cells[1].id])).toBeUndefined();
    table.cells[1].coveredBy = table.cells[0].id;
    expect(selectedSingleAnchorCell(table, [table.cells[1].id])).toBeUndefined();
  });
});
