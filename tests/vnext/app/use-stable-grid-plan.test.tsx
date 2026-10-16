import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TableModel } from '@/vnext/domain';
import type { TablePlan } from '@/vnext/rendering';
import { stableGridPlan, tableGridStructureKey, useStableGridPlan } from '@/vnext/app/editor/use-stable-grid-plan';
import { emptyTable } from '../proof/test-data';

/** FR-30 (slice 2A): the grid stays on screen between a saved cell and its new measurement. */

function plan(rowQ?: number[]): TablePlan {
  return {
    tableId: 'table', objectId: 'object', pageId: 'page', frameU: 0, widthsU: [], frameQ: 0, trackQ: [640, 640],
    styles: new Map(), annotationStyle: {} as TablePlan['annotationStyle'], edges: [], suppressed: [], diagnostics: [],
    ...(rowQ ? { rowQ, gridOffsetYQ: 0 } : {}),
  };
}

const withText = (table: TableModel): TableModel => ({
  ...table,
  cells: table.cells.map((cell, index) => (index === 0 ? { ...cell, content: { type: 'technicalCode', value: 'A' } } : cell)),
});

describe('stableGridPlan', () => {
  it('uses the measured plan when there is one', () => {
    const measured = plan([320, 320]);
    expect(stableGridPlan(emptyTable(2, 2), measured, null)).toBe(measured);
  });

  it('reuses the last measured plan while the same rows and columns wait for a new measurement', () => {
    const table = emptyTable(2, 2);
    const last = { key: tableGridStructureKey(table), plan: plan([320, 320]) };
    expect(stableGridPlan(withText(table), plan(), last)).toBe(last.plan);
  });

  it('waits for the new measurement after a row or column is added or removed', () => {
    const last = { key: tableGridStructureKey(emptyTable(2, 2)), plan: plan([320, 320]) };
    expect(stableGridPlan(emptyTable(3, 2), plan(), last)).toBeUndefined();
    expect(stableGridPlan(emptyTable(2, 3), plan(), last)).toBeUndefined();
    expect(stableGridPlan(undefined, plan([1]), last)).toBeUndefined();
  });
});

describe('useStableGridPlan', () => {
  it('remembers the last measured plan across a change of content', () => {
    const table = emptyTable(2, 2);
    const measured = plan([320, 320]);
    const { result, rerender } = renderHook(({ t, p }) => useStableGridPlan(t, p), { initialProps: { t: table, p: measured } });
    expect(result.current).toBe(measured);
    rerender({ t: withText(table), p: plan() });
    expect(result.current).toBe(measured);
    rerender({ t: emptyTable(3, 2), p: plan() });
    expect(result.current).toBeUndefined();
  });
});
