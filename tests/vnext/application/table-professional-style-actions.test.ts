import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  TABLE_PRESETS,
  createDocumentSession,
  executeApplicationAction,
  tablePresetPresentationSnapshot,
  type CellStylePatch,
  type TablePresetId,
} from '@/vnext/application';
import type { CatalogDocument, TableModel, TableObject } from '@/vnext/domain';
import {
  createW4F1Document,
  W4F1_OBJECT_ID,
  W4F1_PAGE_ID,
  W4F1_TABLE_ID,
} from '../proof/fixtures/w4f1-table-document';

const deps = { createId: () => crypto.randomUUID() };

function tableObject(document: CatalogDocument): TableObject {
  const object = document.pages[0].objects.find((entry) => entry.id === W4F1_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Expected W4.F.1 table fixture');
  return object;
}

function tableOf(document: CatalogDocument): TableModel {
  return tableObject(document).table;
}

function identity() {
  return { pageId: W4F1_PAGE_ID, objectId: W4F1_OBJECT_ID, tableId: W4F1_TABLE_ID };
}

function baseAction(table: TableModel, patch: CellStylePatch) {
  return {
    type: 'table.style.setBase' as const,
    ...identity(),
    expectedBase: table.style.base,
    patch,
  };
}

function roleAction(table: TableModel, role: 'header' | 'body' | 'section', patch: CellStylePatch) {
  const expectedStyle = table.style.rowRoles[role];
  return {
    type: 'table.style.setRowRole' as const,
    ...identity(),
    role,
    ...(expectedStyle === undefined ? {} : { expectedStyle }),
    patch,
  };
}

function rowAction(table: TableModel, rowIds: readonly string[], patch: CellStylePatch) {
  return {
    type: 'table.rows.setStyle' as const,
    ...identity(),
    targets: rowIds.map((id) => {
      const style = table.rows.find((row) => row.id === id)?.style;
      return { id, ...(style === undefined ? {} : { expectedStyle: style }) };
    }),
    patch,
  };
}

function columnAction(table: TableModel, columnIds: readonly string[], patch: CellStylePatch) {
  return {
    type: 'table.columns.setStyle' as const,
    ...identity(),
    targets: columnIds.map((id) => {
      const style = table.columns.find((column) => column.id === id)?.style;
      return { id, ...(style === undefined ? {} : { expectedStyle: style }) };
    }),
    patch,
  };
}

function cellAction(table: TableModel, cellId: string, patch: CellStylePatch) {
  const cell = table.cells.find((entry) => entry.id === cellId)!;
  return {
    type: 'table.cell.setProperties' as const,
    ...identity(),
    targets: [{ cellId, ...(cell.style === undefined ? {} : { expectedStyle: cell.style }) }],
    patch,
  };
}

function presetAction(table: TableModel, presetId: TablePresetId) {
  return {
    type: 'table.preset.apply' as const,
    ...identity(),
    presetId,
    expectedPresentation: tablePresetPresentationSnapshot(table),
  };
}

function grouped(document: CatalogDocument): CatalogDocument {
  const object = tableObject(document);
  return {
    ...document,
    pages: [{
      ...document.pages[0],
      objects: [{
        id: 'group',
        type: 'group',
        frame: { xMm: object.frame.xMm, yMm: object.frame.yMm, widthMm: object.frame.widthMm, heightMm: object.frame.heightMm + 10 },
        zIndex: 0,
        objects: [
          { ...object, frame: { xMm: 0, yMm: 0, widthMm: object.frame.widthMm, heightMm: object.frame.heightMm } },
          {
            id: 'shape',
            type: 'shape',
            frame: { xMm: 0, yMm: object.frame.heightMm, widthMm: 10, heightMm: 10 },
            zIndex: 1,
            shape: 'rectangle',
            style: {},
          },
        ],
      }],
    }],
  } as CatalogDocument;
}

describe('W4.F.2 professional style action contracts', () => {
  it('keeps new style actions strict and rejects duplicate/unsafe style payloads', () => {
    const table = tableOf(createW4F1Document());
    expect(ApplicationActionSchema.safeParse(baseAction(table, { verticalAlign: 'middle' })).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(roleAction(table, 'header', { fontWeight: 700 })).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(rowAction(table, [table.rows[0].id], { color: '#003366' })).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(columnAction(table, [table.columns[0].id], { paddingMm: { left: 1 } })).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(presetAction(table, 'technical-grid')).success).toBe(true);

    expect(ApplicationActionSchema.safeParse({ ...baseAction(table, { color: '#003366' }), surprise: true }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(baseAction(table, { color: 'blue' as never })).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(baseAction(table, {
      borders: { top: { pattern: 'dashed', thicknessPt: 1, color: '#003366' } as never },
    })).success).toBe(false);
    const duplicateRows = rowAction(table, [table.rows[0].id, table.rows[0].id], { color: '#003366' });
    expect(ApplicationActionSchema.safeParse(duplicateRows).success).toBe(false);
  });
});

describe('W4.F.2 narrow style CAS and inheritance reset', () => {
  it('uses narrow Table-base CAS: unrelated content is non-stale, target style is stale', () => {
    const expected = createW4F1Document();
    const live = structuredClone(expected);
    tableOf(live).cells[5].content = { type: 'technicalCode', value: 'changed-unrelated' };
    const ok = executeApplicationAction(live, baseAction(tableOf(expected), { background: '#FFFFFF' }), deps);
    expect(ok.ok).toBe(true);

    const stale = structuredClone(expected);
    tableOf(stale).style.base.color = '#FFFFFF';
    const rejected = executeApplicationAction(stale, baseAction(tableOf(expected), { background: '#FFFFFF' }), deps);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe('TARGET_STALE');
  });

  it('updates Row/Column style layers atomically without flattening Cells or dimensions', () => {
    const document = createW4F1Document();
    const table = tableOf(document);
    const originalCells = structuredClone(table.cells);
    const originalWidths = structuredClone(table.columns.map((column) => ({ width: column.width, minMm: column.minMm, maxMm: column.maxMm })));
    const rowResult = executeApplicationAction(document, rowAction(table, [table.rows[1].id, table.rows[2].id], {
      color: '#003366',
      verticalAlign: 'middle',
    }), deps);
    expect(rowResult.ok).toBe(true);
    if (!rowResult.ok) return;
    const rowStyled = tableOf(rowResult.document);
    expect(rowStyled.rows[1].style).toMatchObject({ color: '#003366', verticalAlign: 'middle' });
    expect(rowStyled.rows[2].style).toMatchObject({ color: '#003366', verticalAlign: 'middle' });
    expect(rowStyled.cells).toEqual(originalCells);

    const columnResult = executeApplicationAction(rowResult.document, columnAction(rowStyled, [rowStyled.columns[0].id], {
      paddingMm: { left: 2 },
      textAlign: 'right',
    }), deps);
    expect(columnResult.ok).toBe(true);
    if (!columnResult.ok) return;
    const columnStyled = tableOf(columnResult.document);
    expect(columnStyled.columns[0].style).toMatchObject({ paddingMm: { left: 2 }, textAlign: 'right' });
    expect(columnStyled.columns.map((column) => ({ width: column.width, minMm: column.minMm, maxMm: column.maxMm }))).toEqual(originalWidths);
    expect(columnStyled.cells).toEqual(originalCells);
  });

  it('reset deletes the local property instead of copying a resolved inherited value', () => {
    const document = createW4F1Document();
    const table = tableOf(document);
    table.rows[1].style = { color: '#003366', background: '#FFFFFF' };
    const result = executeApplicationAction(document, rowAction(table, [table.rows[1].id], { color: null }), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tableOf(result.document).rows[1].style).toEqual({ background: '#FFFFFF' });
    expect('color' in (tableOf(result.document).rows[1].style ?? {})).toBe(false);
  });

  it('is atomic for multi-target stale Row/Column style operations', () => {
    const document = createW4F1Document();
    const expected = tableOf(document);
    const live = structuredClone(document);
    tableOf(live).rows[2].style = { color: '#FFFFFF' };
    const result = executeApplicationAction(live, rowAction(expected, [expected.rows[1].id, expected.rows[2].id], { color: '#003366' }), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TARGET_STALE');
    expect(tableOf(live).rows[1].style).toBeUndefined();
    expect(tableOf(live).rows[2].style).toEqual({ color: '#FFFFFF' });
  });

  it('rejects lock and closed-Group boundaries for every style action family', () => {
    const document = createW4F1Document();
    const locked = structuredClone(document);
    tableObject(locked).locked = true;
    expect(executeApplicationAction(locked, baseAction(tableOf(locked), { color: '#003366' }), deps).ok).toBe(false);

    const groupDoc = grouped(document);
    const result = executeApplicationAction(groupDoc, baseAction(tableOf(document), { color: '#003366' }), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ACTION_INVALID');
  });
});

describe('W4.F.2 Cell-local style extension and font validation', () => {
  it('authors professional Cell style fields and resets them without touching contentPresentation', () => {
    const document = createW4F1Document();
    const table = tableOf(document);
    const cell = table.cells[4];
    const originalPresentation = cell.contentPresentation;
    const result = executeApplicationAction(document, cellAction(table, cell.id, {
      fontFamily: 'Noto Sans',
      fontSizePt: 11,
      lineHeight: 1.35,
      fontWeight: 700,
      verticalAlign: 'bottom',
      color: '#003366',
      background: '#FFFFFF',
      textAlign: 'center',
      paddingMm: { top: 2, right: 2, bottom: 2, left: 2 },
      borders: { bottom: { pattern: 'solid', thicknessPt: 1, color: '#003366' } },
    }), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const styled = tableOf(result.document).cells.find((entry) => entry.id === cell.id)!;
    expect(styled.style).toMatchObject({
      fontFamily: 'Noto Sans',
      fontSizePt: 11,
      lineHeight: 1.35,
      fontWeight: 700,
      verticalAlign: 'bottom',
      textAlign: 'center',
    });
    expect(styled.contentPresentation).toEqual(originalPresentation);

    const reset = executeApplicationAction(result.document, cellAction(tableOf(result.document), cell.id, {
      verticalAlign: null,
      fontSizePt: null,
      borders: null,
    }), deps);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    const resetCell = tableOf(reset.document).cells.find((entry) => entry.id === cell.id)!;
    expect(resetCell.style?.verticalAlign).toBeUndefined();
    expect(resetCell.style?.fontSizePt).toBeUndefined();
    expect(resetCell.style?.borders).toBeUndefined();
  });

  it('does not stale a style-only Cell action when only wrap presentation changed, but wrap CAS remains protected', () => {
    const expected = createW4F1Document();
    const live = structuredClone(expected);
    const cell = tableOf(live).cells[4];
    cell.contentPresentation = { wrapPolicy: 'nowrap' };
    const styleOnly = executeApplicationAction(live, cellAction(tableOf(expected), cell.id, { color: '#003366' }), deps);
    expect(styleOnly.ok).toBe(true);

    const wrapAction = {
      type: 'table.cell.setProperties' as const,
      ...identity(),
      targets: [{ cellId: cell.id }],
      patch: { wrapPolicy: 'wrap' as const },
    };
    const staleWrap = executeApplicationAction(live, wrapAction, deps);
    expect(staleWrap.ok).toBe(false);
    if (!staleWrap.ok) expect(staleWrap.error.code).toBe('TARGET_STALE');
  });

  it('rejects undeclared font family and unavailable declared family/weight combinations', () => {
    const document = createW4F1Document();
    const table = tableOf(document);
    const unknown = executeApplicationAction(document, baseAction(table, { fontFamily: 'Undeclared Sans' }), deps);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('ACTION_INVALID');

    const limited = structuredClone(document);
    limited.style.fonts = [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }];
    const unavailable = executeApplicationAction(limited, baseAction(tableOf(limited), { fontWeight: 700 }), deps);
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) expect(unavailable.error.code).toBe('ACTION_INVALID');
  });
});

describe('W4.F.2 presets and history', () => {
  for (const preset of TABLE_PRESETS) {
    it(`${preset.label} materializes deterministic ordinary styles without changing authored structure`, () => {
      const document = createW4F1Document();
      const beforeObject = tableObject(document);
      const before = structuredClone(beforeObject.table);
      const result = executeApplicationAction(document, presetAction(before, preset.id), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const afterObject = tableObject(result.document);
      const after = afterObject.table;
      expect(after.id).toBe(before.id);
      expect(after.rows.map((row) => ({ id: row.id, role: row.role, heightPolicy: row.heightPolicy })))
        .toEqual(before.rows.map((row) => ({ id: row.id, role: row.role, heightPolicy: row.heightPolicy })));
      expect(after.columns.map((column) => ({ id: column.id, width: column.width, minMm: column.minMm, maxMm: column.maxMm })))
        .toEqual(before.columns.map((column) => ({ id: column.id, width: column.width, minMm: column.minMm, maxMm: column.maxMm })));
      expect(after.cells.map(({ id, rowId, columnId, content, contentPresentation, span, coveredBy, annotationIds, style }) => ({
        id, rowId, columnId, content, contentPresentation, span, coveredBy, annotationIds, style,
      }))).toEqual(before.cells.map(({ id, rowId, columnId, content, contentPresentation, span, coveredBy, annotationIds, style }) => ({
        id, rowId, columnId, content, contentPresentation, span, coveredBy, annotationIds, style,
      })));
      expect(after.annotations).toEqual(before.annotations);
      expect(after.legend).toEqual(before.legend);
      expect(afterObject.frame).toEqual(beforeObject.frame);
      expect(result.metadata.createdIds).toEqual([]);
      expect(JSON.stringify(after)).not.toContain('presetId');
    });
  }

  it('applies one preset as one history transition; Undo/Redo are exact and reapply is a semantic no-op', () => {
    const initial = createW4F1Document();
    const session = createDocumentSession(initial, deps);
    const first = session.execute(presetAction(tableOf(initial), 'technical-grid'));
    expect(first.ok).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(1);
    const styled = structuredClone(session.getSnapshot().document);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(styled);
    const beforeSequence = session.getSnapshot().localSequence;
    const reapplied = session.execute(presetAction(tableOf(session.getSnapshot().document), 'technical-grid'));
    expect(reapplied.ok).toBe(true);
    if (reapplied.ok) {
      expect(reapplied.metadata.changed).toBe(false);
      expect(reapplied.metadata.affectedIds).toEqual([]);
      expect(reapplied.metadata.createdIds).toEqual([]);
    }
    expect(session.getSnapshot().localSequence).toBe(beforeSequence);
  });
});
