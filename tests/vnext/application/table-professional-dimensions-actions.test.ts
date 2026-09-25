import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  type IdGenerator,
} from '@/vnext/application';
import { mmToU, type CatalogDocument, type TableModel } from '@/vnext/domain';
import { mergeCells } from '@/vnext/table';
import { emptyTable } from '../proof/test-data';

function ids(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function documentWith(table: TableModel, options: { locked?: boolean; grouped?: boolean; frameWidthMm?: number } = {}): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'W4.F.1');
  const object = {
    id: 'table-object',
    type: 'table' as const,
    frame: { xMm: 10, yMm: 10, widthMm: options.frameWidthMm ?? 120, heightMm: 70 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    table,
  };
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: options.grouped ? [{
        id: 'group',
        type: 'group' as const,
        frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 80 },
        zIndex: 0,
        objects: [
          { ...object, frame: { xMm: 0, yMm: 0, widthMm: 120, heightMm: 70 } },
          { id: 'shape', type: 'shape' as const, frame: { xMm: 0, yMm: 70, widthMm: 10, heightMm: 10 }, zIndex: 1, shape: 'rectangle' as const, style: {} },
        ],
      }] : [object],
    }],
  };
}

function tableOf(document: CatalogDocument): TableModel {
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('Expected top-level table');
  return object.table;
}

function rowTarget(table: TableModel, rowId: string, next: Record<string, unknown>) {
  const row = table.rows.find((entry) => entry.id === rowId)!;
  return {
    rowId,
    expected: {
      role: row.role,
      heightPolicy: row.heightPolicy.mode === 'AUTO'
        ? { mode: 'AUTO' as const }
        : row.heightPolicy.mode === 'MIN_MM'
          ? { mode: 'MIN_MM' as const, minU: mmToU(row.heightPolicy.minMm) }
          : { mode: 'FIXED_MM' as const, heightU: mmToU(row.heightPolicy.heightMm) },
    },
    next,
  };
}

function columnExpected(column: TableModel['columns'][number]) {
  return {
    width: column.width.mode === 'fixed'
      ? { mode: 'fixed' as const, widthU: mmToU(column.width.mm) }
      : { mode: 'flex' as const, weight: column.width.weight },
    minU: mmToU(column.minMm),
    ...(column.maxMm === undefined ? {} : { maxU: mmToU(column.maxMm) }),
  };
}

function rowsAction(table: TableModel, targets: ReturnType<typeof rowTarget>[]) {
  return {
    type: 'table.rows.setProperties' as const,
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: table.id,
    targets,
  };
}

function columnsAction(table: TableModel, document: CatalogDocument, columnIds: string[], next: Record<string, unknown>) {
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('Expected table');
  return {
    type: 'table.columns.setProperties' as const,
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: table.id,
    expectedFrameWidthU: mmToU(object.frame.widthMm),
    expectedColumnOrder: table.columns.map((column) => column.id),
    targets: columnIds.map((columnId) => {
      const column = table.columns.find((entry) => entry.id === columnId)!;
      return { columnId, expected: columnExpected(column), next };
    }),
  };
}

function reorderAction(table: TableModel, axis: 'row' | 'column', nextOrder: string[]) {
  return {
    type: 'table.axis.reorder' as const,
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: table.id,
    axis,
    expectedOrder: (axis === 'row' ? table.rows : table.columns).map((entry) => entry.id),
    nextOrder,
    expectedTable: table,
  };
}

describe('W4.F.1 action contracts', () => {
  it('accepts strict row/column/reorder contracts and rejects unknown, duplicate and unsafe values', () => {
    const table = emptyTable();
    const doc = documentWith(table);
    expect(ApplicationActionSchema.safeParse(rowsAction(table, [rowTarget(table, 'r0', { role: 'header' })])).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(columnsAction(table, doc, ['c0'], { width: { mode: 'fixed', widthU: 300_000 } })).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(reorderAction(table, 'row', ['r1', 'r0', 'r2'])).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...rowsAction(table, [rowTarget(table, 'r0', { role: 'header' })]), surprise: true }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(rowsAction(table, [
      rowTarget(table, 'r0', { role: 'header' }),
      rowTarget(table, 'r0', { role: 'body' }),
    ])).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(columnsAction(table, doc, ['c0'], { width: { mode: 'fixed', widthU: 1.5 } })).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(reorderAction(table, 'row', ['r1', 'r1', 'r2'])).success).toBe(false);
  });
});

describe('W4.F.1 table.rows.setProperties', () => {
  it('authors AUTO/MIN/FIXED and semantic roles atomically while preserving IDs, content and frame', () => {
    const table = emptyTable();
    const initialIds = table.cells.map((cell) => cell.id);
    const doc = documentWith(table);
    const result = executeApplicationAction(doc, rowsAction(table, [
      rowTarget(table, 'r0', { role: 'header', heightPolicy: { mode: 'MIN_MM', minU: 80_000 } }),
      rowTarget(table, 'r1', { role: 'section', heightPolicy: { mode: 'FIXED_MM', heightU: 95_000 } }),
    ]), { createId: ids() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = tableOf(result.document);
    expect(next.rows[0]).toMatchObject({ id: 'r0', role: 'header', heightPolicy: { mode: 'MIN_MM', minMm: 8 } });
    expect(next.rows[1]).toMatchObject({ id: 'r1', role: 'section', heightPolicy: { mode: 'FIXED_MM', heightMm: 9.5 } });
    expect(next.cells.map((cell) => cell.id)).toEqual(initialIds);
    expect(result.document.pages[0].objects[0].frame).toEqual(doc.pages[0].objects[0].frame);
    expect(result.metadata.createdIds).toEqual([]);
    expect(result.metadata.affectedIds).toEqual(['table-object', table.id, 'r0', 'r1']);
  });

  it('uses narrow row CAS, rejects stale targets/lock/group, and fails role change across a merged header boundary', () => {
    const expected = emptyTable();
    const live = structuredClone(expected);
    live.cells[8].content = { type: 'technicalCode', value: 'unrelated' };
    expect(executeApplicationAction(documentWith(live), rowsAction(expected, [
      rowTarget(expected, 'r2', { heightPolicy: { mode: 'AUTO' } }),
    ]), { createId: ids() }).ok).toBe(true);

    const staleLive = structuredClone(expected);
    staleLive.rows[0] = { ...staleLive.rows[0], heightPolicy: { mode: 'MIN_MM', minMm: 4 } };
    expect(executeApplicationAction(documentWith(staleLive), rowsAction(expected, [
      rowTarget(expected, 'r0', { role: 'header' }),
    ]), { createId: ids() })).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));

    expect(executeApplicationAction(documentWith(expected, { locked: true }), rowsAction(expected, [
      rowTarget(expected, 'r0', { role: 'header' }),
    ]), { createId: ids() })).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'OBJECT_LOCKED' }) }));
    expect(executeApplicationAction(documentWith(expected, { grouped: true }), rowsAction(expected, [
      rowTarget(expected, 'r0', { role: 'header' }),
    ]), { createId: ids() })).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'ACTION_INVALID' }) }));

    const merged = mergeCells(emptyTable(), 'cell0-0', 2, 1);
    const blocked = executeApplicationAction(documentWith(merged), rowsAction(merged, [
      rowTarget(merged, 'r0', { role: 'header' }),
    ]), { createId: ids() });
    expect(blocked).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'MERGE_HEADER_BOUNDARY' }) }));
  });

  it('keeps semantic no-ops out of history and gives one exact Undo/Redo step to multi-row edits', () => {
    const table = emptyTable();
    const initial = documentWith(table);
    const session = createDocumentSession(initial, { createId: ids() });
    const noop = session.execute(rowsAction(table, [rowTarget(table, 'r0', { role: 'body' })]));
    expect(noop.ok && noop.metadata).toMatchObject({ changed: false, affectedIds: [], createdIds: [] });
    expect(session.getSnapshot().localSequence).toBe(0);
    const changed = session.execute(rowsAction(table, [
      rowTarget(table, 'r0', { heightPolicy: { mode: 'FIXED_MM', heightU: 70_000 } }),
      rowTarget(table, 'r1', { heightPolicy: { mode: 'FIXED_MM', heightU: 70_000 } }),
    ]));
    expect(changed.ok).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(1);
    const after = session.getSnapshot().document;
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });
});

describe('W4.F.1 table.columns.setProperties', () => {
  it('authors fixed/flex/weight/min/max with narrow CAS and canonical solver validation', () => {
    const table = emptyTable();
    const doc = documentWith(table);
    const fixed = executeApplicationAction(doc, columnsAction(table, doc, ['c0'], {
      width: { mode: 'fixed', widthU: 300_000 },
      minU: 100_000,
      maxU: 500_000,
    }), { createId: ids() });
    expect(fixed.ok).toBe(true);
    if (!fixed.ok) return;
    expect(tableOf(fixed.document).columns[0]).toMatchObject({
      width: { mode: 'fixed', mm: 30 }, minMm: 10, maxMm: 50,
    });

    const live = tableOf(fixed.document);
    const flex = executeApplicationAction(fixed.document, columnsAction(live, fixed.document, ['c0'], {
      width: { mode: 'flex', weight: 3 }, maxU: null,
    }), { createId: ids() });
    expect(flex.ok).toBe(true);
    if (flex.ok) expect(tableOf(flex.document).columns[0]).toMatchObject({ width: { mode: 'flex', weight: 3 }, minMm: 10 });
    if (flex.ok) expect(tableOf(flex.document).columns[0].maxMm).toBeUndefined();
  });

  it('rejects stale frame/order/dimensions and infeasible limits but ignores unrelated Cell changes', () => {
    const table = emptyTable();
    const doc = documentWith(table);
    const action = columnsAction(table, doc, ['c0'], { width: { mode: 'fixed', widthU: 200_000 } });
    const unrelated = structuredClone(table);
    unrelated.cells[8].content = { type: 'technicalCode', value: 'changed' };
    expect(executeApplicationAction(documentWith(unrelated), action, { createId: ids() }).ok).toBe(true);

    const staleFrame = executeApplicationAction(documentWith(table, { frameWidthMm: 121 }), action, { createId: ids() });
    expect(staleFrame).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));

    const staleOrder = structuredClone(table);
    staleOrder.columns = [staleOrder.columns[1], staleOrder.columns[0], staleOrder.columns[2]];
    expect(executeApplicationAction(documentWith(staleOrder), action, { createId: ids() })).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));

    const staleDimension = structuredClone(table);
    staleDimension.columns[0] = { ...staleDimension.columns[0], minMm: 2 };
    expect(executeApplicationAction(documentWith(staleDimension), action, { createId: ids() })).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));

    const impossible = executeApplicationAction(doc, columnsAction(table, doc, ['c0'], {
      minU: 1_300_000,
    }), { createId: ids() });
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) expect(['TABLE_WIDTH_INFEASIBLE', 'COLUMN_LIMIT_INVALID']).toContain(impossible.error.code);
  });
});

describe('W4.F.1 table.axis.reorder', () => {
  it('reorders by stable IDs without regenerating Cell identity and no-ops exactly', () => {
    const table = emptyTable();
    const doc = documentWith(table);
    const cellIds = table.cells.map((cell) => cell.id);
    const result = executeApplicationAction(doc, reorderAction(table, 'row', ['r1', 'r0', 'r2']), { createId: ids() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tableOf(result.document).rows.map((row) => row.id)).toEqual(['r1', 'r0', 'r2']);
    expect(tableOf(result.document).cells.map((cell) => cell.id)).toEqual(cellIds);
    expect(result.metadata.createdIds).toEqual([]);

    const noop = executeApplicationAction(doc, reorderAction(table, 'row', ['r0', 'r1', 'r2']), { createId: ids() });
    expect(noop.ok && noop.metadata).toMatchObject({ changed: false, affectedIds: [], createdIds: [] });
  });

  it('delegates merged-axis safety to reorderAxis and full-CAS rejects topology changes', () => {
    const merged = mergeCells(emptyTable(), 'cell0-0', 2, 1);
    const blocked = executeApplicationAction(documentWith(merged), reorderAction(merged, 'row', ['r1', 'r0', 'r2']), { createId: ids() });
    expect(blocked).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'MERGE_INTERSECTION' }) }));

    const expected = emptyTable();
    const live = structuredClone(expected);
    live.cells[0].content = { type: 'technicalCode', value: 'topology-cas' };
    const stale = executeApplicationAction(documentWith(live), reorderAction(expected, 'column', ['c1', 'c0', 'c2']), { createId: ids() });
    expect(stale).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));
  });
});
