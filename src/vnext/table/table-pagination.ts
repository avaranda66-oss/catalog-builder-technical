import type { TableModel } from '../domain/editorial-model';
import { add, mmToU, qToU, sum } from '../domain/physical';

/**
 * Pure A4 row paginator for the vNext TableModel, ported and adapted from the
 * Legacy planner (src/domain/table-core/table.pagination.ts:73-238, no runtime
 * import of Legacy). It only PLANS where an explicit, undoable "Continuar na
 * próxima página" action may cut a table; it never changes a document. The W4
 * contract forbids automatic re-layout by the renderer.
 *
 * Invariants kept from Legacy: rows are never split; every row appears in
 * exactly one slice, in order; leading header rows repeat on continuation
 * slices; a section row stays with the rows that follow it; manual breaks are
 * honoured; oversized content is reported (fail closed), never hidden.
 * Added for vNext: rows joined by a vertical merge (rowspan) move together,
 * and table notes/legend (printed under the grid) stay with the last slice.
 * All lengths are domain U (`mmToU`), integers, so the plan is deterministic.
 */
export interface TablePaginationMeasurement {
  /** Measured height of every table row, by row id (domain U). */
  readonly rowHeightsU: Readonly<Record<string, number>>;
  /** Title above the grid; printed on the first slice. */
  readonly titleHeightU?: number;
  /** Title of each continuation ("… (continuação)"); defaults to `titleHeightU`. */
  readonly continuationTitleHeightU?: number;
  /** Notes and legend printed under the grid; they travel with the last slice. */
  readonly footerHeightU?: number;
  /** Space from the table top to the usable bottom of its current page. */
  readonly firstPageAvailableU: number;
  /** Usable height for a table placed on a fresh continuation page. */
  readonly nextPageAvailableU: number;
}
export interface TablePaginationOptions {
  /** Repeat the leading header rows on every continuation (default true). */
  readonly repeatHeader?: boolean;
  /** Start a new slice before these rows when possible (Legacy manual breaks). */
  readonly breakBeforeRowIds?: readonly string[];
}
export interface TablePageSlice {
  readonly index: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  /** Header rows printed at the top of this slice (repeated copies after the first). */
  readonly headerRowIds: readonly string[];
  /** Non-header rows of this slice, in table order. */
  readonly bodyRowIds: readonly string[];
  readonly heightU: number;
  readonly availableU: number;
  /** > 0 when this slice still does not fit (see `issues`). */
  readonly overflowU: number;
}
export type TablePaginationIssue =
  | { readonly code: 'MEASUREMENT_MISSING'; readonly rowIds: readonly string[] }
  | { readonly code: 'MEASUREMENT_INVALID' }
  | { readonly code: 'NO_BODY_ROWS' }
  | { readonly code: 'HEADER_TALLER_THAN_PAGE' }
  | { readonly code: 'ROWS_TALLER_THAN_PAGE'; readonly rowIds: readonly string[] }
  | { readonly code: 'SLICE_OVERFLOW'; readonly sliceIndex: number; readonly overflowU: number }
  | { readonly code: 'TRAILING_SECTION_ROW'; readonly rowId: string };
export interface TablePaginationPlan {
  readonly tableId: string;
  readonly slices: readonly TablePageSlice[];
  /** First body row of every continuation slice: where a split action cuts. */
  readonly cutBeforeRowIds: readonly string[];
  readonly fitsOnOnePage: boolean;
  readonly issues: readonly TablePaginationIssue[];
}

const length = (value: number | undefined) => value ?? 0;
const validLength = (value: number | undefined) => value === undefined || (Number.isSafeInteger(value) && value >= 0);

/** Groups of consecutive body rows that must stay on the same page. */
function atomicGroups(table: TableModel, firstBody: number): number[][] {
  const joinNext = new Array<boolean>(table.rows.length).fill(false);
  const rowIndex = new Map(table.rows.map((row, index) => [row.id, index]));
  for (const cell of table.cells) {
    const rows = cell.span?.rows ?? 1, start = rowIndex.get(cell.rowId);
    if (cell.coveredBy || rows < 2 || start === undefined) continue;
    for (let index = start; index < Math.min(table.rows.length - 1, start + rows - 1); index++) joinNext[index] = true;
  }
  table.rows.forEach((row, index) => { if (row.role === 'section' && index >= firstBody) joinNext[index] = true; });
  const groups: number[][] = [];
  for (let index = firstBody; index < table.rows.length; index++) {
    const previous = groups.at(-1);
    if (previous && joinNext[index - 1] && index - 1 >= firstBody) previous.push(index); else groups.push([index]);
  }
  return groups;
}

export function planTablePagination(table: TableModel, measurement: TablePaginationMeasurement,
  options: TablePaginationOptions = {}): TablePaginationPlan {
  const empty = (issue: TablePaginationIssue): TablePaginationPlan =>
    ({ tableId: table.id, slices: [], cutBeforeRowIds: [], fitsOnOnePage: false, issues: [issue] });
  const missing = table.rows.filter(row => !Number.isSafeInteger(measurement.rowHeightsU[row.id]) || measurement.rowHeightsU[row.id] < 0);
  if (missing.length) return empty({ code: 'MEASUREMENT_MISSING', rowIds: missing.map(row => row.id) });
  if (![measurement.titleHeightU, measurement.continuationTitleHeightU, measurement.footerHeightU,
    measurement.firstPageAvailableU, measurement.nextPageAvailableU].every(validLength) ||
    measurement.nextPageAvailableU <= 0) return empty({ code: 'MEASUREMENT_INVALID' });

  const repeatHeader = options.repeatHeader !== false;
  const heightOf = (index: number) => measurement.rowHeightsU[table.rows[index].id];
  let firstBody = 0;
  while (firstBody < table.rows.length && table.rows[firstBody].role === 'header') firstBody++;
  const headerRowIds = table.rows.slice(0, firstBody).map(row => row.id);
  const headerU = sum(table.rows.slice(0, firstBody).map((_, index) => heightOf(index)));
  const titleU = length(measurement.titleHeightU);
  const continuationTitleU = measurement.continuationTitleHeightU ?? titleU;
  const footerU = length(measurement.footerHeightU);
  const continuationBaseU = add(continuationTitleU, repeatHeader ? headerU : 0);
  const issues: TablePaginationIssue[] = [];
  const last = table.rows.at(-1);
  if (last && last.role === 'section' && table.rows.length > firstBody) issues.push({ code: 'TRAILING_SECTION_ROW', rowId: last.id });
  if (continuationBaseU >= measurement.nextPageAvailableU) issues.push({ code: 'HEADER_TALLER_THAN_PAGE' });

  const groups = atomicGroups(table, firstBody);
  if (!groups.length) issues.push({ code: 'NO_BODY_ROWS' });
  const breaks = new Set(options.breakBeforeRowIds ?? []);
  const slices: { headerRowIds: string[]; bodyRowIds: string[]; heightU: number; availableU: number }[] = [];
  let current = { headerRowIds, bodyRowIds: [] as string[], heightU: add(titleU, headerU), availableU: measurement.firstPageAvailableU };
  groups.forEach((group, position) => {
    const groupU = sum(group.map(heightOf));
    const neededU = add(groupU, position === groups.length - 1 ? footerU : 0);
    const rowIds = group.map(index => table.rows[index].id);
    if (add(continuationBaseU, neededU) > measurement.nextPageAvailableU) issues.push({ code: 'ROWS_TALLER_THAN_PAGE', rowIds });
    const manual = breaks.has(rowIds[0]);
    if (current.bodyRowIds.length && (manual || add(current.heightU, neededU) > current.availableU)) {
      slices.push(current);
      current = { headerRowIds: repeatHeader ? headerRowIds : [], bodyRowIds: [], heightU: continuationBaseU, availableU: measurement.nextPageAvailableU };
    }
    current.bodyRowIds.push(...rowIds);
    current.heightU = add(current.heightU, groupU);
  });
  current.heightU = add(current.heightU, footerU);
  slices.push(current);

  const result = slices.map((slice, index): TablePageSlice => {
    const overflowU = Math.max(0, add(slice.heightU, -slice.availableU));
    if (overflowU > 0) issues.push({ code: 'SLICE_OVERFLOW', sliceIndex: index, overflowU });
    return { index, isFirst: index === 0, isLast: index === slices.length - 1, ...slice, overflowU };
  });
  return {
    tableId: table.id,
    slices: result,
    cutBeforeRowIds: result.slice(1).map(slice => slice.bodyRowIds[0]).filter((id): id is string => Boolean(id)),
    fitsOnOnePage: result.length === 1 && result[0].overflowU === 0,
    issues,
  };
}

/** Structural copies of the renderer's measured facts (no rendering import from the pure table layer). */
export interface MeasuredTableFact { readonly renderedIntrinsicHeightQ: number; readonly gridOffsetYQ?: number }
export interface MeasuredRowFact { readonly rowId: string; readonly resolvedHeightU: number; readonly heightQ: number }
export interface TablePageGeometry {
  readonly pageHeightMm: number;
  readonly safeTopMm: number;
  readonly safeBottomMm: number;
  /** Top of the table frame on its current page. */
  readonly frameYMm: number;
  /** Top of the continuation table on a new page (defaults to the safe-area top). */
  readonly continuationTopMm?: number;
}

/**
 * Builds the paginator input from the layout snapshot facts that the editor
 * already measures (rendering/measurement.ts: kind 'table' and kind 'row').
 * Title = space above the grid; footer = intrinsic height below the last row.
 */
export function paginationMeasurementFromLayout(table: TableModel, tableFact: MeasuredTableFact,
  rowFacts: readonly MeasuredRowFact[], geometry: TablePageGeometry): TablePaginationMeasurement {
  const rows = new Map(rowFacts.map(fact => [fact.rowId, fact]));
  const rowHeightsU: Record<string, number> = {};
  for (const row of table.rows) {
    const fact = rows.get(row.id);
    if (fact) rowHeightsU[row.id] = fact.resolvedHeightU;
  }
  const gridOffsetQ = Math.max(0, tableFact.gridOffsetYQ ?? 0);
  const gridQ = sum(table.rows.map(row => rows.get(row.id)?.heightQ ?? 0));
  const footerQ = Math.max(0, add(add(tableFact.renderedIntrinsicHeightQ, -gridOffsetQ), -gridQ));
  const bottomU = add(mmToU(geometry.pageHeightMm), -mmToU(geometry.safeBottomMm));
  return {
    rowHeightsU,
    titleHeightU: qToU(gridOffsetQ),
    footerHeightU: qToU(footerQ),
    firstPageAvailableU: Math.max(0, add(bottomU, -mmToU(geometry.frameYMm))),
    nextPageAvailableU: Math.max(0, add(bottomU, -mmToU(geometry.continuationTopMm ?? geometry.safeTopMm))),
  };
}
