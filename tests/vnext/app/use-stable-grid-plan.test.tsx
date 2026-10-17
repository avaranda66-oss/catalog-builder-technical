import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TableModel } from '@/vnext/domain';
import type { TablePlan } from '@/vnext/rendering';
import { measuredGridRows, stableGridPlan, useStableGridPlan } from '@/vnext/app/editor/use-stable-grid-plan';
import { emptyTable } from '../proof/test-data';

/** FR-30 (slice 2A): the grid stays on screen between a change and its new measurement. */

function plan(columns: number, rowQ?: number[], gridOffsetYQ = 64): TablePlan {
  return {
    tableId: 'table', objectId: 'object', pageId: 'page', frameU: 0, widthsU: [], frameQ: 0,
    trackQ: Array.from({ length: columns }, () => 640),
    styles: new Map(), annotationStyle: {} as TablePlan['annotationStyle'], edges: [], suppressed: [], diagnostics: [],
    ...(rowQ ? { rowQ, gridOffsetYQ } : {}),
  };
}

const withText = (table: TableModel): TableModel => ({
  ...table,
  cells: table.cells.map((cell, index) => (index === 0 ? { ...cell, content: { type: 'technicalCode', value: 'A' } } : cell)),
});

function withRowAfter(table: TableModel, index: number, id: string): TableModel {
  const rows = [...table.rows];
  rows.splice(index + 1, 0, { id, role: 'body', heightPolicy: { mode: 'AUTO' } });
  return { ...table, rows, cells: [...table.cells, ...table.columns.map((column) => ({ id: `${id}-${column.id}`, rowId: id, columnId: column.id, content: { type: 'empty' as const } }))] };
}

describe('stableGridPlan', () => {
  it('uses the measured plan when there is one', () => {
    const measured = plan(2, [320, 320]);
    expect(stableGridPlan(emptyTable(2, 2), measured, null)).toBe(measured);
  });

  it('keeps every row height and the grid offset while the same table waits for a new measurement', () => {
    const table = emptyTable(2, 2);
    const last = measuredGridRows(table, plan(2, [320, 448], 96) as TablePlan & { rowQ: number[]; gridOffsetYQ: number });
    const current = plan(2);
    expect(stableGridPlan(withText(table), current, last)).toEqual({ ...current, rowQ: [320, 448], gridOffsetYQ: 96 });
  });

  it('a new row borrows the height of the row above; a removed row disappears; columns come from the current plan', () => {
    const table = emptyTable(3, 2);
    const last = measuredGridRows(table, plan(2, [320, 448, 512]) as TablePlan & { rowQ: number[]; gridOffsetYQ: number });
    expect(stableGridPlan(withRowAfter(table, 1, 'new'), plan(2), last)?.rowQ).toEqual([320, 448, 448, 512]);
    const shorter: TableModel = { ...table, rows: table.rows.filter((row) => row.id !== 'r1'), cells: table.cells.filter((cell) => cell.rowId !== 'r1') };
    expect(stableGridPlan(shorter, plan(2), last)?.rowQ).toEqual([320, 512]);
    const wider = emptyTable(3, 3);
    expect(stableGridPlan(wider, plan(3), last)?.trackQ).toHaveLength(3);
  });

  it('waits when nothing was measured yet, for another table or when the plan does not match the columns', () => {
    const table = emptyTable(2, 2);
    const last = measuredGridRows(table, plan(2, [320, 320]) as TablePlan & { rowQ: number[]; gridOffsetYQ: number });
    expect(stableGridPlan(table, plan(2), null)).toBeUndefined();
    expect(stableGridPlan({ ...table, id: 'other' }, plan(2), last)).toBeUndefined();
    expect(stableGridPlan(emptyTable(2, 3), plan(2), last)).toBeUndefined();
    expect(stableGridPlan(undefined, plan(2, [1]), last)).toBeUndefined();
  });
});

describe('useStableGridPlan', () => {
  it('remembers the last measurement across a change of content and a new row', () => {
    const table = emptyTable(2, 2);
    const measured = plan(2, [320, 384]);
    const { result, rerender } = renderHook(({ t, p }) => useStableGridPlan(t, p), { initialProps: { t: table, p: measured } });
    expect(result.current).toBe(measured);
    rerender({ t: withText(table), p: plan(2) });
    expect(result.current?.rowQ).toEqual([320, 384]);
    rerender({ t: withRowAfter(table, 1, 'new'), p: plan(2) });
    expect(result.current?.rowQ).toEqual([320, 384, 384]);
  });
});
