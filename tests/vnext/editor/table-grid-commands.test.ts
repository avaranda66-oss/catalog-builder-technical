import { describe, expect, it } from 'vitest';
import type { TableModel } from '@/vnext/domain';
import { mergeCells } from '@/vnext/table';
import { planTableAxisInsert, tableGridMenuModel } from '@/vnext/editor/table-grid-commands';
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
  it('whole rows give no column to insert next to (the same rule as the table panel)', () => {
    expect(planTableAxisInsert(emptyTable(3, 3), tableRowSelection(identity, 'r1'), { type: 'insert', axis: 'column', position: 'after' }))
      .toEqual({ ok: false, message: 'Clique numa célula da tabela para inserir ou excluir colunas.' });
    expect(planTableAxisInsert(emptyTable(3, 3), tableRowSelection(identity, 'r1'), { type: 'insert', axis: 'row', position: 'after' }))
      .toMatchObject({ ok: true, plan: { referenceAxisId: 'r1' } });
  });

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

describe('tableGridMenuModel', () => {
  it('offers deleting the row and the column of a single cell', () => {
    expect(tableGridMenuModel(emptyTable(3, 3), cell(1, 1))).toEqual({
      insertRows: true,
      insertColumns: true,
      removeRows: { label: 'Excluir linha', count: 1 },
      removeColumns: { label: 'Excluir coluna', count: 1 },
      canMerge: false,
      canUnmerge: false,
    });
  });

  it('counts several rows or columns and offers merging a range', () => {
    const model = tableGridMenuModel(emptyTable(5, 4), tableRangeSelection(identity, point(1, 0), point(3, 1)));
    expect(model).toEqual({
      insertRows: true,
      insertColumns: true,
      removeRows: { label: 'Excluir 3 linhas', count: 3 },
      removeColumns: { label: 'Excluir 2 colunas', count: 2 },
      canMerge: true,
      canUnmerge: false,
    });
  });

  it('whole rows offer only row actions, whole columns only column actions, the whole table no deletion', () => {
    const table = emptyTable(4, 4);
    const rows = tableGridMenuModel(table, tableRowSelection(identity, 'r0', 'r1'));
    expect(rows).toMatchObject({ insertRows: true, insertColumns: false, removeRows: { label: 'Excluir 2 linhas', count: 2 } });
    expect(rows.removeColumns).toBeUndefined();
    const columns = tableGridMenuModel(table, tableColumnSelection(identity, 'c2'));
    expect(columns).toMatchObject({ insertRows: false, insertColumns: true, removeColumns: { label: 'Excluir coluna', count: 1 } });
    expect(columns.removeRows).toBeUndefined();
    const whole = tableGridMenuModel(table, wholeTableSelection(identity));
    expect(whole).toMatchObject({ insertRows: true, insertColumns: true });
    expect(whole.removeRows).toBeUndefined();
    expect(whole.removeColumns).toBeUndefined();
  });

  it('offers undoing a merge on a merged cell, and a merged cell counts every row it covers', () => {
    const table = mergeCells(emptyTable(3, 3), 'cell0-0', 1, 2);
    expect(tableGridMenuModel(table, cell(0, 0))).toMatchObject({ canUnmerge: true, canMerge: false });
    const tall = mergeCells(emptyTable(4, 3), 'cell1-0', 2, 1);
    expect(tableGridMenuModel(tall, cell(1, 0)).removeRows).toEqual({ label: 'Excluir 2 linhas', count: 2 });
  });
});
