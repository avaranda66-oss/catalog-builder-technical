import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  type IdGenerator,
} from '@/vnext/application';
import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';
import { mergeCells } from '@/vnext/table';
import { emptyTable } from '../proof/test-data';

function sequenceIds(prefix = 'fresh'): IdGenerator {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function tableDocument(table: TableModel, options: { locked?: boolean; grouped?: boolean } = {}): CatalogDocument {
  const document = createCatalogDocument(sequenceIds('base'), 'W4.A');
  const tableObject = {
    id: 'table-object',
    type: 'table' as const,
    frame: { xMm: 20, yMm: 30, widthMm: 120, heightMm: 55 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    table,
  };
  const objects = options.grouped
    ? [{
        id: 'closed-group',
        type: 'group' as const,
        frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 65 },
        zIndex: 0,
        objects: [
          { ...tableObject, frame: { xMm: 0, yMm: 10, widthMm: 120, heightMm: 55 } },
          {
            id: 'group-shape',
            type: 'shape' as const,
            frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
            zIndex: 1,
            shape: 'rectangle' as const,
            style: { fill: '#FFFFFF' },
          },
        ],
      }]
    : [tableObject];
  return { ...document, pages: [{ ...document.pages[0], objects }] };
}

function enrichedTable(): TableModel {
  const table = emptyTable();
  return {
    ...table,
    annotationIds: ['caption'],
    annotations: [
      { id: 'caption', kind: 'caption', text: plainRichText('caption-rich', 'Especificações') },
      { id: 'note', kind: 'note', text: plainRichText('note-rich', 'Não remover') },
    ],
    legend: [{ id: 'legend', markerCode: '●', text: plainRichText('legend-rich', 'Compatível') }],
  };
}

function insertAction(table: TableModel, overrides: Record<string, unknown> = {}) {
  return {
    type: 'table.axis.insert' as const,
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: table.id,
    axis: 'row' as const,
    referenceAxisId: table.rows[0].id,
    position: 'before' as const,
    properties: { role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
    expectedTable: table,
    ...overrides,
  };
}

function removeAction(table: TableModel, overrides: Record<string, unknown> = {}) {
  return {
    type: 'table.axis.remove' as const,
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: table.id,
    axis: 'row' as const,
    axisId: table.rows[0].id,
    expectedTable: table,
    ...overrides,
  };
}

function resultTable(document: CatalogDocument): TableModel {
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('Expected top-level Table');
  return object.table;
}

describe('W4.A table axis action contracts', () => {
  it('validates strict insert/remove payloads and axis-specific properties', () => {
    const table = enrichedTable();
    expect(ApplicationActionSchema.safeParse(insertAction(table)).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(removeAction(table)).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...insertAction(table), surprise: true }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(insertAction(table, {
      properties: { width: { mode: 'flex', weight: 1 }, minMm: 1 },
    })).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(insertAction(table, {
      axis: 'column',
      referenceAxisId: table.columns[0].id,
      properties: { width: { mode: 'flex', weight: 1 }, minMm: 1 },
    })).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(removeAction(table, { axisId: '' })).success).toBe(false);
  });
});

describe('W4.A table axis execution', () => {
  it('inserts rows before/after and columns before/after with fresh IDs and empty full-grid cells', () => {
    const cases = [
      { axis: 'row' as const, position: 'before' as const },
      { axis: 'row' as const, position: 'after' as const },
      { axis: 'column' as const, position: 'before' as const },
      { axis: 'column' as const, position: 'after' as const },
    ];
    for (const entry of cases) {
      const table = enrichedTable();
      const document = tableDocument(table);
      const action = entry.axis === 'row'
        ? insertAction(table, { axis: entry.axis, position: entry.position })
        : insertAction(table, {
            axis: entry.axis,
            position: entry.position,
            referenceAxisId: table.columns[0].id,
            properties: { width: { mode: 'flex', weight: 1 }, minMm: 1 },
          });
      const result = executeApplicationAction(document, action, { createId: sequenceIds(`${entry.axis}-${entry.position}`) });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const next = resultTable(result.document);
      const insertedAxisId = result.metadata.createdIds[0];
      const insertedIndex = (entry.axis === 'row' ? next.rows : next.columns).findIndex((item) => item.id === insertedAxisId);
      expect(insertedIndex).toBe(entry.position === 'before' ? 0 : 1);
      expect(next.cells).toHaveLength(next.rows.length * next.columns.length);
      const insertedCells = next.cells.filter((cell) => entry.axis === 'row'
        ? cell.rowId === insertedAxisId
        : cell.columnId === insertedAxisId);
      expect(insertedCells).toHaveLength(entry.axis === 'row' ? table.columns.length : table.rows.length);
      expect(insertedCells.every((cell) => cell.content.type === 'empty')).toBe(true);
      expect(new Set(result.metadata.createdIds).size).toBe(result.metadata.createdIds.length);
      expect(next.annotations).toEqual(table.annotations);
      expect(next.legend).toEqual(table.legend);
      expect(result.document.pages[0].objects[0].frame).toEqual(document.pages[0].objects[0].frame);
      expect(entry.axis === 'row' ? next.columns : next.rows).toEqual(entry.axis === 'row' ? table.columns : table.rows);
    }
  });

  it('uses explicit header/body AUTO rows and explicit flex/minimum columns without rewriting neighbours', () => {
    const table = enrichedTable();
    table.rows[0] = { ...table.rows[0], role: 'header' };
    const rowResult = executeApplicationAction(tableDocument(table), insertAction(table, {
      properties: { role: 'header', heightPolicy: { mode: 'AUTO' } },
    }), { createId: sequenceIds('header') });
    expect(rowResult.ok).toBe(true);
    if (!rowResult.ok) return;
    expect(resultTable(rowResult.document).rows[0]).toMatchObject({ role: 'header', heightPolicy: { mode: 'AUTO' } });
    expect(resultTable(rowResult.document).rows.slice(1)).toEqual(table.rows);

    const columnResult = executeApplicationAction(tableDocument(table), insertAction(table, {
      axis: 'column',
      referenceAxisId: table.columns[1].id,
      position: 'after',
      properties: { width: { mode: 'flex', weight: 2 }, minMm: 3 },
    }), { createId: sequenceIds('column') });
    expect(columnResult.ok).toBe(true);
    if (!columnResult.ok) return;
    const insertedColumnId = columnResult.metadata.createdIds[0];
    expect(resultTable(columnResult.document).columns.find((column) => column.id === insertedColumnId)).toMatchObject({
      width: { mode: 'flex', weight: 2 },
      minMm: 3,
    });
    expect(resultTable(columnResult.document).columns.filter((column) => column.id !== insertedColumnId)).toEqual(table.columns);
  });

  it('preserves the domain span-expansion behavior for strict interior insertion', () => {
    const table = mergeCells(enrichedTable(), 'cell0-0', 2, 2);
    const result = executeApplicationAction(tableDocument(table), insertAction(table, {
      referenceAxisId: table.rows[0].id,
      position: 'after',
    }), { createId: sequenceIds('span') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = resultTable(result.document);
    expect(next.cells.find((cell) => cell.id === 'cell0-0')?.span).toEqual({ rows: 3, columns: 2 });
    const insertedRowId = result.metadata.createdIds[0];
    expect(next.cells.find((cell) => cell.rowId === insertedRowId && cell.columnId === 'c0')?.coveredBy).toBe('cell0-0');
    expect(next.cells.find((cell) => cell.rowId === insertedRowId && cell.columnId === 'c1')?.coveredBy).toBe('cell0-0');
  });

  it('rejects an insertion that would cross the header boundary before allocating IDs', () => {
    const source = enrichedTable();
    source.rows[0] = { ...source.rows[0], role: 'header' };
    source.rows[1] = { ...source.rows[1], role: 'header' };
    const table = mergeCells(source, 'cell0-0', 2, 1);
    let allocations = 0;
    const result = executeApplicationAction(tableDocument(table), insertAction(table, {
      referenceAxisId: table.rows[0].id,
      position: 'after',
      properties: { role: 'body', heightPolicy: { mode: 'AUTO' } },
    }), { createId: () => `never-${++allocations}` });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'MERGE_HEADER_BOUNDARY' }) }));
    expect(allocations).toBe(0);
  });

  it('removes one explicit row or column while preserving unrelated annotations, legend, identities and frame', () => {
    for (const axis of ['row', 'column'] as const) {
      const table = enrichedTable();
      const document = tableDocument(table);
      const axisId = axis === 'row' ? table.rows[2].id : table.columns[2].id;
      const result = executeApplicationAction(document, removeAction(table, { axis, axisId }), { createId: sequenceIds() });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const next = resultTable(result.document);
      expect((axis === 'row' ? next.rows : next.columns).some((item) => item.id === axisId)).toBe(false);
      expect(next.annotations).toEqual(table.annotations);
      expect(next.legend).toEqual(table.legend);
      expect(result.document.pages[0].objects[0].frame).toEqual(document.pages[0].objects[0].frame);
      const survivingBefore = new Set(table.cells
        .filter((cell) => (axis === 'row' ? cell.rowId : cell.columnId) !== axisId)
        .map((cell) => cell.id));
      expect(new Set(next.cells.map((cell) => cell.id))).toEqual(survivingBefore);
    }
  });

  it('rejects last-axis and span-intersection removal without unmerging or data loss', () => {
    const single = emptyTable(1, 1);
    const last = executeApplicationAction(tableDocument(single), removeAction(single), { createId: sequenceIds() });
    expect(last).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TABLE_LAST_AXIS' }) }));

    const merged = mergeCells(enrichedTable(), 'cell0-0', 2, 2);
    const before = JSON.stringify(tableDocument(merged));
    const blocked = executeApplicationAction(tableDocument(merged), removeAction(merged), { createId: sequenceIds() });
    expect(blocked).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'MERGE_INTERSECTION' }) }));
    expect(JSON.stringify(tableDocument(merged))).toBe(before);
  });

  it('rejects missing, wrong-page, wrong-type, wrong-table, locked, grouped and stale targets', () => {
    const table = enrichedTable();
    const cases = [
      [tableDocument(table), insertAction(table, { objectId: 'missing' }), 'OBJECT_NOT_FOUND'],
      [tableDocument(table), insertAction(table, { pageId: 'missing-page' }), 'PAGE_NOT_FOUND'],
      [tableDocument(table), insertAction(table, { tableId: 'other-table' }), 'TABLE_IDENTITY_MISMATCH'],
      [tableDocument(table, { locked: true }), insertAction(table), 'OBJECT_LOCKED'],
      [tableDocument(table, { grouped: true }), insertAction(table), 'ACTION_INVALID'],
      [tableDocument(table), insertAction({ ...table, rows: [...table.rows].reverse() }), 'TARGET_STALE'],
    ] as const;
    for (const [document, action, code] of cases) {
      const result = executeApplicationAction(document, action, { createId: sequenceIds() });
      expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code }) }));
    }

    const wrongTypeDocument = tableDocument(table);
    wrongTypeDocument.pages[0].objects[0] = {
      id: 'table-object', type: 'shape', frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
      zIndex: 0, shape: 'rectangle', style: {},
    };
    const wrongType = executeApplicationAction(wrongTypeDocument, insertAction(table), { createId: sequenceIds() });
    expect(wrongType).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'OBJECT_TYPE_MISMATCH' }) }));
  });

  it('keeps failed commands out of history/Redo and gives one exact Undo/Redo snapshot per changed command', () => {
    const table = enrichedTable();
    const initial = tableDocument(table);
    const session = createDocumentSession(initial, { createId: sequenceIds('history') });
    const inserted = session.execute(insertAction(table));
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const committed = session.getSnapshot().document;
    const createdIds = inserted.metadata.createdIds;
    expect(session.getSnapshot().localSequence).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.getSnapshot().canRedo).toBe(true);
    const beforeFailure = session.getSnapshot();
    const failed = session.execute(removeAction(table, { axisId: 'missing-axis' }));
    expect(failed.ok).toBe(false);
    expect(session.getSnapshot()).toBe(beforeFailure);
    expect(session.getSnapshot().canRedo).toBe(true);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(committed);
    expect(createdIds.every((id) => JSON.stringify(session.getSnapshot().document).includes(id))).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(3);
    expect(session.undo().ok).toBe(true);
    expect(session.undo()).toEqual(expect.objectContaining({ ok: false }));
  });
});
