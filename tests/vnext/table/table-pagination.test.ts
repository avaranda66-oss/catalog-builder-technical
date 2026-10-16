import { describe, expect, it } from 'vitest';
import type { Row, TableModel } from '@/vnext/domain/editorial-model';
import { mmToU, uToQ } from '@/vnext/domain/physical';
import { validateTable } from '@/vnext/table/table-model';
import {
  paginationMeasurementFromLayout, planTablePagination, type TablePaginationMeasurement,
} from '@/vnext/table/table-pagination';

type RowSpec = { id: string; role?: Row['role'] };
/** A valid two-column vNext table; `merges` are vertical spans in the first column. */
function table(rows: readonly RowSpec[], merges: readonly { rowId: string; rows: number }[] = []): TableModel {
  const columns = ['c1', 'c2'];
  const covered = new Map<string, string>();
  for (const merge of merges) {
    const start = rows.findIndex(row => row.id === merge.rowId);
    for (let index = start + 1; index < start + merge.rows; index++) covered.set(rows[index].id, `${merge.rowId}-c1`);
  }
  const model: TableModel = {
    id: 'tabela',
    columns: columns.map(id => ({ id, width: { mode: 'flex' as const, weight: 1 }, minMm: 10 })),
    rows: rows.map(row => ({ id: row.id, role: row.role ?? 'body', heightPolicy: { mode: 'AUTO' as const } })),
    cells: rows.flatMap(row => columns.map(column => {
      const merge = column === 'c1' ? merges.find(item => item.rowId === row.id) : undefined;
      const coveredBy = column === 'c1' ? covered.get(row.id) : undefined;
      return {
        id: `${row.id}-${column}`, rowId: row.id, columnId: column, content: { type: 'empty' as const },
        ...(merge ? { span: { rows: merge.rows, columns: 1 } } : {}),
        ...(coveredBy ? { coveredBy } : {}),
      };
    })),
    style: { base: {}, rowRoles: {}, annotation: {}, annotationGapMm: 1 },
    annotations: [], legend: [],
  };
  expect(validateTable(model)).toEqual([]);
  return model;
}
const bodyRows = (count: number, prefix = 'r') => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index + 1}` }));
function measure(model: TableModel, heightsMm: Record<string, number>, rest: Partial<Omit<TablePaginationMeasurement, 'rowHeightsU'>> & {
  firstMm: number; nextMm: number; defaultMm?: number;
}): TablePaginationMeasurement {
  return {
    rowHeightsU: Object.fromEntries(model.rows.map(row => [row.id, mmToU(heightsMm[row.id] ?? rest.defaultMm ?? 10)])),
    firstPageAvailableU: mmToU(rest.firstMm), nextPageAvailableU: mmToU(rest.nextMm),
    ...(rest.titleHeightU === undefined ? {} : { titleHeightU: rest.titleHeightU }),
    ...(rest.continuationTitleHeightU === undefined ? {} : { continuationTitleHeightU: rest.continuationTitleHeightU }),
    ...(rest.footerHeightU === undefined ? {} : { footerHeightU: rest.footerHeightU }),
  };
}

describe('vNext table paginator (port of the Legacy A4 planner for "Continuar na próxima página")', () => {
  // Header 15 mm + 20 body rows of 10 mm. Page 1: 100 mm (header + 8 rows). Next pages: 80 mm (header + 6 rows).
  const long = table([{ id: 'h', role: 'header' }, ...bodyRows(20)]);
  const longMeasurement = measure(long, { h: 15 }, { firstMm: 100, nextMm: 80 });

  it('splits a long table by usable height, keeping every row exactly once and in order', () => {
    const plan = planTablePagination(long, longMeasurement);
    expect(plan.slices.map(slice => slice.bodyRowIds.length)).toEqual([8, 6, 6]);
    expect(plan.slices.flatMap(slice => slice.bodyRowIds)).toEqual(long.rows.slice(1).map(row => row.id));
    expect(plan.cutBeforeRowIds).toEqual(['r9', 'r15']);
    expect(plan.fitsOnOnePage).toBe(false);
    expect(plan.issues).toEqual([]);
    expect(plan.slices.every(slice => slice.overflowU === 0 && slice.heightU <= slice.availableU)).toBe(true);
    expect(plan.slices.map(slice => [slice.isFirst, slice.isLast])).toEqual([[true, false], [false, false], [false, true]]);
  });

  it('repeats every leading header row on continuation pages, or none when asked', () => {
    const twoHeaders = table([{ id: 'h1', role: 'header' }, { id: 'h2', role: 'header' }, ...bodyRows(12)]);
    const measurement = measure(twoHeaders, { h1: 8, h2: 7 }, { firstMm: 100, nextMm: 80 });
    const plan = planTablePagination(twoHeaders, measurement);
    expect(plan.slices.map(slice => slice.headerRowIds)).toEqual([['h1', 'h2'], ['h1', 'h2']]);
    expect(plan.slices[1].heightU).toBe(mmToU(15 + 10 * plan.slices[1].bodyRowIds.length));
    const bare = planTablePagination(twoHeaders, measurement, { repeatHeader: false });
    expect(bare.slices.map(slice => slice.headerRowIds)).toEqual([['h1', 'h2'], []]);
  });

  it('turns a 40-row table into two A4 parts with the header repeated (FR-35 scenario)', () => {
    const forty = table([{ id: 'cab', role: 'header' }, ...bodyRows(40, 'l')]);
    // 6 mm rows; page 1 has 160 mm left, a fresh page has 260 mm of safe area.
    const plan = planTablePagination(forty, measure(forty, {}, { firstMm: 160, nextMm: 260, defaultMm: 6 }));
    expect(plan.slices).toHaveLength(2);
    expect(plan.slices[1].headerRowIds).toEqual(['cab']);
    expect(plan.slices[0].bodyRowIds.length + plan.slices[1].bodyRowIds.length).toBe(40);
  });

  it('keeps a section row together with the row that follows it', () => {
    const sections = table([{ id: 'h', role: 'header' }, ...bodyRows(7, 'd'), { id: 's1', role: 'section' }, { id: 's1-a' }, { id: 's1-b' }]);
    const plan = planTablePagination(sections, measure(sections, { h: 15 }, { firstMm: 100, nextMm: 80 }));
    expect(plan.slices[0].bodyRowIds.at(-1)).not.toBe('s1');
    expect(plan.slices[1].bodyRowIds.slice(0, 2)).toEqual(['s1', 's1-a']);
  });

  it('never cuts through rows joined by a vertical merge', () => {
    // r7..r9 share one merged cell; page 1 holds header + 8 rows, so the cut moves up to r7.
    const merged = table([{ id: 'h', role: 'header' }, ...bodyRows(12)], [{ rowId: 'r7', rows: 3 }]);
    const plan = planTablePagination(merged, measure(merged, { h: 15 }, { firstMm: 100, nextMm: 80 }));
    expect(plan.slices[0].bodyRowIds).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(plan.slices[1].bodyRowIds.slice(0, 3)).toEqual(['r7', 'r8', 'r9']);
  });

  it('keeps the table notes on the last part, moving a row forward when the notes would not fit', () => {
    const short = table([{ id: 'h', role: 'header' }, ...bodyRows(8)]);
    const withoutNotes = planTablePagination(short, measure(short, { h: 15 }, { firstMm: 100, nextMm: 80 }));
    expect(withoutNotes.fitsOnOnePage).toBe(true);
    const withNotes = planTablePagination(short, measure(short, { h: 15 }, { firstMm: 100, nextMm: 80, footerHeightU: mmToU(6) }));
    expect(withNotes.slices.map(slice => slice.bodyRowIds)).toEqual([['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], ['r8']]);
    expect(withNotes.slices[1].heightU).toBe(mmToU(15 + 10 + 6));
  });

  it('counts the title on the first part and the continuation title on the next ones', () => {
    const plan = planTablePagination(long, { ...longMeasurement, titleHeightU: mmToU(10), continuationTitleHeightU: mmToU(5) });
    expect(plan.slices[0].bodyRowIds).toHaveLength(7);
    expect(plan.slices[1].bodyRowIds).toHaveLength(6);
    expect(plan.slices[1].heightU).toBe(mmToU(5 + 15 + 60));
  });

  it('honours manual breaks and is deterministic', () => {
    const plan = planTablePagination(long, longMeasurement, { breakBeforeRowIds: ['r4'] });
    expect(plan.slices[0].bodyRowIds).toEqual(['r1', 'r2', 'r3']);
    expect(plan.slices[1].bodyRowIds[0]).toBe('r4');
    expect(planTablePagination(long, longMeasurement)).toEqual(planTablePagination(long, longMeasurement));
  });

  it('moves a manual break inside a kept-together group to the start of the group and reports it', () => {
    // r3..r5 share one merged cell; a section row "s" keeps "s-a" with it.
    const grouped = table([{ id: 'h', role: 'header' }, ...bodyRows(6), { id: 's', role: 'section' }, { id: 's-a' }],
      [{ rowId: 'r3', rows: 3 }]);
    const measurement = measure(grouped, { h: 15 }, { firstMm: 250, nextMm: 250 });
    const plan = planTablePagination(grouped, measurement, { breakBeforeRowIds: ['r4', 's-a', 'h', 'nao-existe'] });
    expect(plan.slices.map(slice => slice.bodyRowIds)).toEqual([['r1', 'r2'], ['r3', 'r4', 'r5', 'r6'], ['s', 's-a']]);
    expect(plan.cutBeforeRowIds).toEqual(['r3', 's']);
    expect(plan.issues).toEqual([
      { code: 'BREAK_INSIDE_GROUP', rowId: 'r4', movedToRowId: 'r3' },
      { code: 'BREAK_INSIDE_GROUP', rowId: 's-a', movedToRowId: 's' },
      { code: 'BREAK_IGNORED', rowId: 'h' },
      { code: 'BREAK_IGNORED', rowId: 'nao-existe' },
    ]);
  });

  it('fails closed: rows taller than a page, a header too tall, missing measurements, a trailing section', () => {
    const giant = table([{ id: 'h', role: 'header' }, { id: 'normal' }, { id: 'giant' }]);
    const oversized = planTablePagination(giant, measure(giant, { h: 15, giant: 250 }, { firstMm: 200, nextMm: 200 }));
    expect(oversized.issues).toContainEqual({ code: 'ROWS_TALLER_THAN_PAGE', rowIds: ['giant'] });
    expect(oversized.issues.some(issue => issue.code === 'SLICE_OVERFLOW')).toBe(true);
    expect(oversized.fitsOnOnePage).toBe(false);

    const tallHeader = planTablePagination(giant, measure(giant, { h: 90 }, { firstMm: 200, nextMm: 80 }));
    expect(tallHeader.issues).toContainEqual({ code: 'HEADER_TALLER_THAN_PAGE' });

    const partial = { ...longMeasurement, rowHeightsU: { ...longMeasurement.rowHeightsU } };
    delete (partial.rowHeightsU as Record<string, number>).r3;
    expect(planTablePagination(long, partial)).toMatchObject({ slices: [], issues: [{ code: 'MEASUREMENT_MISSING', rowIds: ['r3'] }] });
    expect(planTablePagination(long, { ...longMeasurement, nextPageAvailableU: 0 }).issues).toEqual([{ code: 'MEASUREMENT_INVALID' }]);

    const trailing = table([{ id: 'h', role: 'header' }, { id: 'a' }, { id: 'fim', role: 'section' }]);
    expect(planTablePagination(trailing, measure(trailing, {}, { firstMm: 200, nextMm: 200 })).issues)
      .toContainEqual({ code: 'TRAILING_SECTION_ROW', rowId: 'fim' });
  });

  it('builds its input from the layout facts the editor already measures', () => {
    const small = table([{ id: 'h', role: 'header' }, { id: 'a' }, { id: 'b' }]);
    const rowFacts = small.rows.map(row => ({ rowId: row.id, resolvedHeightU: mmToU(10), heightQ: uToQ(mmToU(10)) }));
    const gridQ = rowFacts.reduce((total, fact) => total + fact.heightQ, 0);
    const measurement = paginationMeasurementFromLayout(small,
      { gridOffsetYQ: uToQ(mmToU(8)), renderedIntrinsicHeightQ: uToQ(mmToU(8)) + gridQ + uToQ(mmToU(6)) }, rowFacts,
      { pageHeightMm: 297, safeTopMm: 12, safeBottomMm: 12, frameYMm: 200 });
    expect(measurement.rowHeightsU).toEqual({ h: mmToU(10), a: mmToU(10), b: mmToU(10) });
    expect(Math.abs((measurement.titleHeightU ?? 0) - mmToU(8))).toBeLessThan(mmToU(0.1));
    expect(Math.abs((measurement.footerHeightU ?? 0) - mmToU(6))).toBeLessThan(mmToU(0.1));
    expect(measurement.firstPageAvailableU).toBe(mmToU(297 - 12 - 200));
    expect(measurement.nextPageAvailableU).toBe(mmToU(297 - 12 - 12));
    expect(planTablePagination(small, measurement).fitsOnOnePage).toBe(true);
  });
});
