import React from 'react';
import type { TableModel } from '../../domain';
import type { TablePlan } from '../../rendering';

/**
 * FR-30 (slice 2A) — keeps the table grid on screen while a change is being measured.
 *
 * The grid needs the measured row heights of the table. After each change (a cell saved with Enter, for example)
 * the new measurement arrives a few frames later; without this hook the grid, its focus and the cell editor would
 * vanish in between and the next key the person types would be lost. While the rows and columns are the same ones,
 * the last measured plan is reused until the new one arrives (positions are corrected a few frames later). When a
 * row or column is added or removed, the grid waits for the new measurement as before.
 */

/** A plan the grid can draw: it has measured rows and the grid offset. */
export function isMeasuredGridPlan(plan: TablePlan | undefined): plan is TablePlan & { rowQ: number[]; gridOffsetYQ: number } {
  return Boolean(plan?.rowQ && plan.gridOffsetYQ !== undefined);
}

/** Same table, same rows and columns, in the same order. */
export function tableGridStructureKey(table: TableModel): string {
  return JSON.stringify([table.id, table.rows.map((row) => row.id), table.columns.map((column) => column.id)]);
}

export function stableGridPlan(
  table: TableModel | undefined,
  plan: TablePlan | undefined,
  last: { readonly key: string; readonly plan: TablePlan } | null
): TablePlan | undefined {
  if (!table) return undefined;
  if (isMeasuredGridPlan(plan)) return plan;
  return last && last.key === tableGridStructureKey(table) ? last.plan : undefined;
}

export function useStableGridPlan(table: TableModel | undefined, plan: TablePlan | undefined): TablePlan | undefined {
  const lastRef = React.useRef<{ key: string; plan: TablePlan } | null>(null);
  const measured = table && isMeasuredGridPlan(plan) ? plan : undefined;
  React.useEffect(() => {
    if (table && measured) lastRef.current = { key: tableGridStructureKey(table), plan: measured };
  }, [measured, table]);
  return stableGridPlan(table, plan, lastRef.current);
}
