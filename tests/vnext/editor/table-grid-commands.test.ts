import { describe, expect, it } from 'vitest';
import type { TableModel } from '@/vnext/domain';
import { mergeCells } from '@/vnext/table';
import {
  describeAxisCount,
  planTableAxisInsert,
  planTableAxisRemoval,
  selectedAxisIds,
  selectionAfterGridInsert,
  selectionAfterGridRemoval,
  tableGridMenuModel,
} from '@/vnext/editor/table-grid-commands';
import {
  tableCellSelection,
  tableColumnSelection,
  tableRangeSelection,
  tableRowSelection,
  tableSelectionIdentity,
  wholeTableSelection,
} from '@/vnext/editor/table-selection';
import { emptyTable } from '../proof/test-data';

/**
 * FR-34 (slice 2A): the pure decisions behind the "+" buttons and the right-click menu of the table grid.
 */

const identity = tableSelectionIdentity('page', 'object', 'table');
const point = (row: number, column: number) => ({ rowId: `r${row}`, columnId: `c${column}` });
const cell = (row: number, column: number) => tableCellSelection(identity, point(row, column));

function withHeader(table: TableModel, headerRows = 1): TableModel {
  return { ...table, rows: table.rows.map((row, index) => ({ ...row, role: index < headerRows ? 'header' : 'body' })) };
}

describe('planTableAxisInsert', () => {
  it('uses the selected cell as reference, or the row/column given by a "+" button', () => {
    const table = emptyTable(4, 3);
    expect(planTableAxisInsert(table, cell(1, 2), { type: 'insert', axis: 'row', position: 'before' })).toEqual({
      ok: true,
      plan: { axis: 'row', referenceAxisId: 'r1', position: 'before', properties: { role: 'body', heightPolicy: { mode: 'AUTO' } } },
    });
    expect(planTableAxisInsert(table, cell(1, 2), { type: 'insert', axis: 'column', position: 'after' })).toEqual({
      ok: true,
      plan: { axis: 'column', referenceAxisId: 'c2', position: 'after', properties: { width: { mode: 'flex', weight: 1 }, minMm: 1 } },
    });
    expect(planTableAxisInsert(table, null, { type: 'insert', axis: 'row', position: 'after', referenceAxisId: 'r3' }))
      .toMatchObject({ ok: true, plan: { referenceAxisId: 'r3', position: 'after' } });
  });

  it('inserts next to the edge of a range: above its first row, below its last row', () => {
    const table = emptyTable(5, 3);
    const range = tableRangeSelection(identity, point(3, 0), point(1, 2));
    expect(planTableAxisInsert(table, range, { type: 'insert', axis: 'row', position: 'before' }))
      .toMatchObject({ ok: true, plan: { referenceAxisId: 'r1' } });
    expect(planTableAxisInsert(table, range, { type: 'insert', axis: 'row', position: 'after' }))
      .toMatchObject({ ok: true, plan: { referenceAxisId: 'r3' } });
    expect(planTableAxisInsert(table, range, { type: 'insert', axis: 'column', position: 'before' }))
      .toMatchObject({ ok: true, plan: { referenceAxisId: 'c0' } });
  });

  it('a row below the title row is an ordinary row; a row inside the header block stays a header', () => {
    const table = withHeader(emptyTable(4, 2), 2);
    const role = (selection: ReturnType<typeof cell>, position: 'before' | 'after') => {
      const planned = planTableAxisInsert(table, selection, { type: 'insert', axis: 'row', position });
      return planned.ok && 'role' in planned.plan.properties ? planned.plan.properties.role : undefined;
    };
    expect(role(cell(0, 0), 'before')).toBe('header');
    expect(role(cell(0, 0), 'after')).toBe('header');
    expect(role(cell(1, 0), 'after')).toBe('body');
    expect(role(cell(2, 0), 'before')).toBe('body');
  });

  it('refuses a reference that no longer exists, in plain Portuguese', () => {
    expect(planTableAxisInsert(emptyTable(2, 2), null, { type: 'insert', axis: 'row', position: 'after', referenceAxisId: 'gone' }))
      .toEqual({ ok: false, message: 'A tabela mudou. Selecione a célula de novo.' });
    expect(planTableAxisInsert(emptyTable(2, 2), null, { type: 'insert', axis: 'row', position: 'after' }).ok).toBe(false);
  });
});

describe('planTableAxisRemoval', () => {
  it('takes every row (or column) the selection touches, in table order', () => {
    const table = emptyTable(6, 4);
    const range = tableRangeSelection(identity, point(4, 1), point(2, 2));
    expect(planTableAxisRemoval(table, range, 'row')).toEqual({
      ok: true, plan: { axis: 'row', axisIds: ['r2', 'r3', 'r4'], firstIndex: 2 },
    });
    expect(planTableAxisRemoval(table, range, 'column')).toEqual({
      ok: true, plan: { axis: 'column', axisIds: ['c1', 'c2'], firstIndex: 1 },
    });
    expect(planTableAxisRemoval(table, tableRowSelection(identity, 'r5', 'r1'), 'row'))
      .toMatchObject({ ok: true, plan: { axisIds: ['r1', 'r2', 'r3', 'r4', 'r5'] } });
  });

  it('never removes the whole table this way', () => {
    const table = emptyTable(3, 2);
    expect(planTableAxisRemoval(table, tableRowSelection(identity, 'r0', 'r2'), 'row')).toEqual({
      ok: false,
      message: 'A tabela precisa ter pelo menos 1 linha. Para tirar a tabela inteira, selecione a tabela e use Excluir.',
    });
    expect(planTableAxisRemoval(table, tableColumnSelection(identity, 'c0', 'c1'), 'column'))
      .toMatchObject({ ok: false, message: expect.stringContaining('pelo menos 1 coluna') });
  });

  it('refuses before changing anything when a merged cell is in the way', () => {
    const table = mergeCells(emptyTable(4, 3), 'cell1-0', 2, 1);
    expect(planTableAxisRemoval(table, cell(1, 1), 'row')).toEqual({
      ok: false, message: 'Há células mescladas nesta linha. Desfaça a mescla antes de excluir.',
    });
    // The merged cell itself covers two rows: both are part of the deletion.
    expect(selectedAxisIds(table, cell(1, 0), 'row')).toEqual(['r1', 'r2']);
    expect(planTableAxisRemoval(table, cell(0, 2), 'row')).toMatchObject({ ok: true, plan: { axisIds: ['r0'] } });
  });
});

describe('tableGridMenuModel', () => {
  it('offers deleting the row and the column of a single cell', () => {
    expect(tableGridMenuModel(emptyTable(3, 3), cell(1, 1))).toEqual({
      removeRows: { label: 'Excluir linha', count: 1 },
      removeColumns: { label: 'Excluir coluna', count: 1 },
      canMerge: false,
      canUnmerge: false,
    });
  });

  it('counts several rows or columns and offers merging a range', () => {
    const model = tableGridMenuModel(emptyTable(5, 4), tableRangeSelection(identity, point(1, 0), point(3, 1)));
    expect(model).toEqual({
      removeRows: { label: 'Excluir 3 linhas', count: 3 },
      removeColumns: { label: 'Excluir 2 colunas', count: 2 },
      canMerge: true,
      canUnmerge: false,
    });
  });

  it('whole rows offer only row deletion, whole columns only column deletion, the whole table neither', () => {
    const table = emptyTable(4, 4);
    const rows = tableGridMenuModel(table, tableRowSelection(identity, 'r0', 'r1'));
    expect(rows.removeRows).toEqual({ label: 'Excluir 2 linhas', count: 2 });
    expect(rows.removeColumns).toBeUndefined();
    const columns = tableGridMenuModel(table, tableColumnSelection(identity, 'c2'));
    expect(columns.removeColumns).toEqual({ label: 'Excluir coluna', count: 1 });
    expect(columns.removeRows).toBeUndefined();
    const whole = tableGridMenuModel(table, wholeTableSelection(identity));
    expect(whole.removeRows).toBeUndefined();
    expect(whole.removeColumns).toBeUndefined();
  });

  it('offers undoing a merge on a merged cell', () => {
    const table = mergeCells(emptyTable(3, 3), 'cell0-0', 1, 2);
    expect(tableGridMenuModel(table, cell(0, 0))).toMatchObject({ canUnmerge: true, canMerge: false });
  });
});

describe('selection after a grid change', () => {
  it('lands on the new row, in the same column, ready to type (or on its first cell after Tab)', () => {
    const before = emptyTable(3, 3);
    const after: TableModel = {
      ...before,
      rows: [...before.rows.slice(0, 2), { id: 'new-row', role: 'body', heightPolicy: { mode: 'AUTO' } }, before.rows[2]],
      cells: [...before.cells, ...before.columns.map((column, index) => ({
        id: `new-${index}`, rowId: 'new-row', columnId: column.id, content: { type: 'empty' as const },
      }))],
    };
    expect(selectionAfterGridInsert(identity, after, 'row', 'new-row', point(1, 2))).toEqual(
      tableCellSelection(identity, { rowId: 'new-row', columnId: 'c2' })
    );
    expect(selectionAfterGridInsert(identity, after, 'row', 'new-row', point(1, 2), true)).toEqual(
      tableCellSelection(identity, { rowId: 'new-row', columnId: 'c0' })
    );
    expect(selectionAfterGridInsert(identity, after, 'row', 'missing', point(1, 2))).toBeUndefined();
  });

  it('stays where the first removed row was, or on the new last row', () => {
    const before = emptyTable(5, 2);
    const plan = { axis: 'row' as const, axisIds: ['r1', 'r2'], firstIndex: 1 };
    const after: TableModel = {
      ...before,
      rows: before.rows.filter((row) => !plan.axisIds.includes(row.id)),
      cells: before.cells.filter((entry) => !plan.axisIds.includes(entry.rowId)),
    };
    const previous = tableRangeSelection(identity, point(1, 1), point(2, 1));
    expect(selectionAfterGridRemoval(identity, before, after, plan, previous)).toEqual(
      tableCellSelection(identity, point(3, 1))
    );
    const tail = { axis: 'row' as const, axisIds: ['r4'], firstIndex: 4 };
    const shorter: TableModel = {
      ...before,
      rows: before.rows.slice(0, 4),
      cells: before.cells.filter((entry) => entry.rowId !== 'r4'),
    };
    expect(selectionAfterGridRemoval(identity, before, shorter, tail, cell(4, 0))).toEqual(cell(3, 0));
  });
});

describe('describeAxisCount', () => {
  it('writes the count in plain Portuguese', () => {
    expect(describeAxisCount('row', 1)).toBe('1 linha');
    expect(describeAxisCount('row', 5)).toBe('5 linhas');
    expect(describeAxisCount('column', 2)).toBe('2 colunas');
  });
});
