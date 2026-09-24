import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  type IdGenerator,
} from '@/vnext/application';
import {
  frameToCanonicalU,
  minimumUForProjectedQ,
  plainRichText,
  type CatalogDocument,
  type TableModel,
} from '@/vnext/domain';
import { mergeCells } from '@/vnext/table';
import { emptyTable } from '../proof/test-data';

function sequenceIds(prefix = 'fit'): IdGenerator {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

const TARGET_Q = 5000;
const FITTED_U = minimumUForProjectedQ(TARGET_Q);

function tableDocument(
  table: TableModel,
  heightU = FITTED_U - 10_000,
  options: { locked?: boolean; grouped?: boolean } = {}
): CatalogDocument {
  const base = createCatalogDocument(sequenceIds('base'), 'W4.E');
  const tableObject = {
    id: 'fit-table-object',
    type: 'table' as const,
    frame: { xMm: 20, yMm: 30, widthMm: 120, heightMm: heightU / 10_000 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    table,
  };  if (!options.grouped) {
    return { ...base, pages: [{ ...base.pages[0], objects: [tableObject] }] };
  }
  const child = { ...tableObject, frame: { ...tableObject.frame, xMm: 0, yMm: 10 } };
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'fit-group',
        type: 'group' as const,
        frame: {
          xMm: 10,
          yMm: 10,
          widthMm: 120,
          heightMm: child.frame.heightMm + 10,
        },
        zIndex: 0,
        objects: [
          child,
          {
            id: 'fit-group-shape',
            type: 'shape' as const,
            frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
            zIndex: 1,
            shape: 'rectangle' as const,
            style: {},
          },
        ],
      }],
    }],
  };
}

function topTable(document: CatalogDocument) {
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('Expected top-level Table');
  return object;
}function fitAction(document: CatalogDocument, overrides: Record<string, unknown> = {}) {
  const object = topTable(document);
  return {
    type: 'table.fitHeight' as const,
    pageId: document.pages[0].id,
    objectId: object.id,
    tableId: object.table.id,
    expectedFrame: frameToCanonicalU(object.frame),
    expectedTable: object.table,
    expectedTypography: {
      fonts: document.style.fonts,
      defaultText: document.style.defaultText,
    },
    measuredIntrinsicHeightQ: TARGET_Q,
    preparedHeightU: FITTED_U,
    ...overrides,
  };
}

describe('W4.E table.fitHeight contract', () => {
  it('strictly validates the dedicated semantic action', () => {
    const document = tableDocument(emptyTable());
    expect(ApplicationActionSchema.safeParse(fitAction(document)).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...fitAction(document), surprise: true }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ ...fitAction(document), measuredIntrinsicHeightQ: 0 }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ ...fitAction(document), preparedHeightU: 0 }).success).toBe(false);
  });

  it('grows only frame height while preserving x/y/width and the exact TableModel', () => {
    const table = emptyTable();
    const document = tableDocument(table, FITTED_U - 10_000);
    const result = executeApplicationAction(document, fitAction(document), { createId: sequenceIds() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = topTable(document);
    const after = topTable(result.document);
    expect(frameToCanonicalU(after.frame)).toEqual({
      ...frameToCanonicalU(before.frame),
      heightU: FITTED_U,
    });
    expect(after.table).toEqual(table);
    expect(result.metadata).toEqual({
      actionType: 'table.fitHeight',
      affectedIds: ['fit-table-object'],
      createdIds: [],
      changed: true,
    });
  });

  it('preserves AUTO, MIN_MM and FIXED_MM row policies byte-for-byte while fitting outer height', () => {
    const policies = [
      { mode: 'AUTO' as const },
      { mode: 'MIN_MM' as const, minMm: 4 },
      { mode: 'FIXED_MM' as const, heightMm: 6 },
    ];
    for (const policy of policies) {
      const table = emptyTable();
      table.rows[0] = { ...table.rows[0], heightPolicy: policy };
      const document = tableDocument(table, FITTED_U - 10_000);
      const result = executeApplicationAction(document, fitAction(document), { createId: sequenceIds() });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(topTable(result.document).table).toEqual(table);
      expect(topTable(result.document).table.rows[0].heightPolicy).toEqual(policy);
    }
  });

  it('shrinks to the exact canonical fitted U and supports exact semantic no-op', () => {
    const table = emptyTable();
    const tall = tableDocument(table, FITTED_U + 20_000);
    const shrunk = executeApplicationAction(tall, fitAction(tall), { createId: sequenceIds() });
    expect(shrunk.ok).toBe(true);
    if (!shrunk.ok) return;
    expect(frameToCanonicalU(topTable(shrunk.document).frame).heightU).toBe(FITTED_U);

    const exact = tableDocument(table, FITTED_U);
    const noOp = executeApplicationAction(exact, fitAction(exact), { createId: sequenceIds() });
    expect(noOp.ok).toBe(true);
    if (!noOp.ok) return;
    expect(noOp.document).toEqual(exact);
    expect(noOp.metadata).toEqual({
      actionType: 'table.fitHeight',
      affectedIds: [],
      createdIds: [],
      changed: false,
    });
  });

  it('rejects inconsistent measured Q/prepared U payloads without mutation', () => {
    const document = tableDocument(emptyTable());
    const before = JSON.stringify(document);
    const result = executeApplicationAction(document, fitAction(document, {
      preparedHeightU: FITTED_U + 1,
    }), { createId: sequenceIds() });
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'ACTION_INVALID' }),
    }));
    expect(JSON.stringify(document)).toBe(before);
  });

  it('rejects stale complete frame changes, including position and width', () => {
    for (const patch of [
      { xMm: 21 },
      { yMm: 31 },
      { widthMm: 121 },
      { heightMm: (FITTED_U - 5_000) / 10_000 },
    ]) {
      const original = tableDocument(emptyTable());
      const prepared = fitAction(original);
      const object = topTable(original);
      const changed: CatalogDocument = {
        ...original,
        pages: [{
          ...original.pages[0],
          objects: [{ ...object, frame: { ...object.frame, ...patch } }],
        }],
      };
      const result = executeApplicationAction(changed, prepared, { createId: sequenceIds() });
      expect(result).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'TARGET_STALE' }),
      }));
    }
  });

  it('rejects stale Table content and layout-relevant typography', () => {
    const original = tableDocument(emptyTable());
    const prepared = fitAction(original);
    const object = topTable(original);
    const firstCell = object.table.cells[0];
    const changedTable = {
      ...object.table,
      cells: object.table.cells.map((cell) => cell.id === firstCell.id
        ? { ...cell, content: { type: 'technicalCode' as const, value: 'CHANGED' } }
        : cell),
    };
    const tableChanged: CatalogDocument = {
      ...original,
      pages: [{ ...original.pages[0], objects: [{ ...object, table: changedTable }] }],
    };
    expect(executeApplicationAction(tableChanged, prepared, { createId: sequenceIds() }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));

    const typographyChanged: CatalogDocument = {
      ...original,
      style: {
        ...original.style,
        defaultText: { ...original.style.defaultText, fontSizePt: 11 },
      },
    };
    expect(executeApplicationAction(typographyChanged, prepared, { createId: sequenceIds() }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));
  });

  it('stales the prepared Fit for row policy, column, style, annotation, legend and topology mutations', () => {
    const cases: Array<(table: TableModel) => TableModel> = [
      (table) => ({
        ...table,
        rows: table.rows.map((row, index) => index === 0
          ? { ...row, heightPolicy: { mode: 'MIN_MM' as const, minMm: 4 } }
          : row),
      }),
      (table) => ({
        ...table,
        columns: table.columns.map((column, index) => index === 0
          ? { ...column, minMm: column.minMm + 1 }
          : column),
      }),
      (table) => ({
        ...table,
        style: {
          ...table.style,
          base: { ...table.style.base, fontSizePt: (table.style.base.fontSizePt ?? 8) + 1 },
        },
      }),
      (table) => ({
        ...table,
        annotationIds: ['fit-caption'],
        annotations: [{
          id: 'fit-caption',
          kind: 'caption' as const,
          text: plainRichText('fit-caption-rich', 'Nova legenda superior'),
        }],
      }),
      (table) => ({
        ...table,
        legend: [{
          id: 'fit-legend',
          markerCode: '*',
          text: plainRichText('fit-legend-rich', 'Nova legenda'),
        }],
      }),
      (table) => mergeCells(table, table.cells[0].id, 1, 2),
    ];

    for (const mutate of cases) {
      const original = tableDocument(emptyTable());
      const prepared = fitAction(original);
      const object = topTable(original);
      const changedTable = mutate(structuredClone(object.table));
      const changed: CatalogDocument = {
        ...original,
        pages: [{ ...original.pages[0], objects: [{ ...object, table: changedTable }] }],
      };
      const result = executeApplicationAction(changed, prepared, { createId: sequenceIds() });
      expect(result).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'TARGET_STALE' }),
      }));
    }
  });

  it('does not over-CAS unrelated palette changes', () => {
    const original = tableDocument(emptyTable());
    const changed: CatalogDocument = {
      ...original,
      style: { ...original.style, palette: ['#000000', ...original.style.palette] },
    };
    const result = executeApplicationAction(changed, fitAction(original), { createId: sequenceIds() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.metadata.changed).toBe(true);
  });

  it('rejects locked and closed-Group targets without bypassing existing boundaries', () => {
    const table = emptyTable();
    const locked = tableDocument(table, FITTED_U - 10_000, { locked: true });
    expect(executeApplicationAction(locked, fitAction(locked), { createId: sequenceIds() }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'OBJECT_LOCKED' }) }));

    const grouped = tableDocument(table, FITTED_U - 10_000, { grouped: true });
    const group = grouped.pages[0].objects[0];
    if (group.type !== 'group') throw new Error('Expected Group');
    const child = group.objects[0];
    if (child.type !== 'table') throw new Error('Expected grouped Table');
    const groupedAction = {
      type: 'table.fitHeight' as const,
      pageId: grouped.pages[0].id,
      objectId: child.id,
      tableId: child.table.id,
      expectedFrame: frameToCanonicalU(child.frame),
      expectedTable: child.table,
      expectedTypography: {
        fonts: grouped.style.fonts,
        defaultText: grouped.style.defaultText,
      },
      measuredIntrinsicHeightQ: TARGET_Q,
      preparedHeightU: FITTED_U,
    };
    expect(executeApplicationAction(grouped, groupedAction, { createId: sequenceIds() }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'ACTION_INVALID' }) }));
  });

  it('creates one history transition for a change and zero history/localSequence for no-op', () => {
    const changedDocument = tableDocument(emptyTable(), FITTED_U - 10_000);
    const session = createDocumentSession(changedDocument, { createId: sequenceIds('history') });
    const result = session.execute(fitAction(changedDocument));
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(1);
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(changedDocument);
    expect(session.redo().ok).toBe(true);
    expect(frameToCanonicalU(topTable(session.getSnapshot().document).frame).heightU).toBe(FITTED_U);

    const exactDocument = tableDocument(emptyTable(), FITTED_U);
    const noOpSession = createDocumentSession(exactDocument, { createId: sequenceIds('noop') });
    const beforeNoOpDocument = noOpSession.getSnapshot().document;
    const noOp = noOpSession.execute(fitAction(beforeNoOpDocument));
    expect(noOp.ok).toBe(true);
    expect(noOpSession.getSnapshot().localSequence).toBe(0);
    expect(noOpSession.getSnapshot().canUndo).toBe(false);
    expect(noOpSession.getSnapshot().document).toBe(beforeNoOpDocument);
  });
});
