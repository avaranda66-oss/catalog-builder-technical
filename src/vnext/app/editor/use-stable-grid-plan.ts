import React from 'react';
import type { TableModel } from '../../domain';
import type { TablePlan } from '../../rendering';

/**
 * FR-30 (slice 2A) — keeps the table grid on screen while a change is being measured.
 *
 * The grid needs the measured row heights of the table. After each change (a cell saved with Enter, a row added by
 * Tab on the last cell) the new measurement arrives a few frames later; without this hook the grid, its focus and
 * the cell editor would vanish in between and the next key the person types would be lost.
 *
 * Until the new measurement arrives, the grid uses the current plan (its columns are already right, they do not
 * need measuring) with the last measured row heights: each row keeps its height, and a new row borrows the height
 * of the row above it. Positions are corrected a few frames later, when the measurement arrives.
 */

/** A plan the grid can draw: it has measured rows and the grid offset. */
export function isMeasuredGridPlan(plan: TablePlan | undefined): plan is TablePlan & { rowQ: number[]; gridOffsetYQ: number } {
  return Boolean(plan?.rowQ && plan.gridOffsetYQ !== undefined);
}

/** What is remembered from the last measurement of a table. */
export interface MeasuredGridRows {
  readonly tableId: string;
  /** Height of each measured row, by row id (in Q). */
  readonly rowHeightsQ: ReadonlyMap<string, number>;
  readonly gridOffsetYQ: number;
}

export function measuredGridRows(table: TableModel, plan: TablePlan & { rowQ: number[]; gridOffsetYQ: number }): MeasuredGridRows {
  return {
    tableId: table.id,
    rowHeightsQ: new Map(table.rows.map((row, index) => [row.id, plan.rowQ[index]] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== undefined)),
    gridOffsetYQ: plan.gridOffsetYQ,
  };
}

export function stableGridPlan(
  table: TableModel | undefined,
  plan: TablePlan | undefined,
  last: MeasuredGridRows | null
): TablePlan | undefined {
  if (!table || !plan) return undefined;
  if (isMeasuredGridPlan(plan) && plan.rowQ.length === table.rows.length) return plan;
  if (!last || last.tableId !== table.id || plan.trackQ.length !== table.columns.length) return undefined;
  const fallback = last.rowHeightsQ.values().next().value;
  if (fallback === undefined) return undefined;
  const rowQ: number[] = [];
  for (const row of table.rows) rowQ.push(last.rowHeightsQ.get(row.id) ?? rowQ[rowQ.length - 1] ?? fallback);
  return { ...plan, rowQ, gridOffsetYQ: last.gridOffsetYQ };
}

export function useStableGridPlan(table: TableModel | undefined, plan: TablePlan | undefined): TablePlan | undefined {
  const lastRef = React.useRef<MeasuredGridRows | null>(null);
  const measured = table && isMeasuredGridPlan(plan) && plan.rowQ.length === table.rows.length ? plan : undefined;
  React.useEffect(() => {
    if (table && measured) lastRef.current = measuredGridRows(table, measured);
  }, [measured, table]);
  return stableGridPlan(table, plan, lastRef.current);
}
