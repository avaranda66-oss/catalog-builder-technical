import { describe, expect, it } from 'vitest';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { tablePresetAccents } from '@/vnext/application/table-preset-registry';
import { createNewTableModel, createTableInsertSpec, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { insertTableAxes, removeTableAxes, runTableSteps } from '@/vnext/app/editor/table-structure-actions';
import type { CatalogDocument, TableModel, TableObject } from '@/vnext/domain';
import { insertedRowRole, planTableAxisRemoval, removeAxisLabel, tableAxisRefusalMessage } from '@/vnext/editor/table-axis-authoring';
import { projectTableLook, tableLookSteps } from '@/vnext/editor/table-look-authoring';
import {
  selectionAfterTableAxisInsert,
  selectionAfterTableAxisRemove,
  tableCellSelection,
  tableColumnSelection,
  tableRangeSelection,
  tableRowSelection,
  tableSelectionAxisIds,
  tableSelectionIdentity,
  wholeTableSelection,
} from '@/vnext/editor/table-selection';
import { mergeCells } from '@/vnext/table/table-model';

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function setup(table: TableModel = createNewTableModel({ rows: 8, columns: 3 })) {
  const document = createW2CDemoDocument(ids('doc'));
  const session = createDocumentSession(document, { createId: ids('generated') });
  const page = document.pages[0];
  const result = session.execute({ type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, table, document.style) });
  if (!result.ok) throw new Error('Could not insert the table');
  const objectId = result.metadata.createdIds[0];
  return { session, pageId: page.id, objectId };
}

function tableObject(document: CatalogDocument, objectId: string): TableObject {
  const object = document.pages.flatMap((page) => page.objects).find((entry) => entry.id === objectId);
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return object;
}

const live = (session: DocumentSession, objectId: string) => tableObject(session.getSnapshot().document, objectId);

describe('FR-34 rows and columns from the selected cell or range', () => {
  it('derives the rows and columns a cell, a range or a merged cell touches', () => {
    const table = createNewTableModel({ rows: 5, columns: 4 });
    const identity = tableSelectionIdentity('page', 'object', table.id);
    const at = (row: number, column: number) => ({ rowId: table.rows[row].id, columnId: table.columns[column].id });
    expect(tableSelectionAxisIds(table, tableCellSelection(identity, at(2, 1)), 'row')).toEqual([table.rows[2].id]);
    expect(tableSelectionAxisIds(table, tableCellSelection(identity, at(2, 1)), 'column')).toEqual([table.columns[1].id]);
    expect(tableSelectionAxisIds(table, tableRangeSelection(identity, at(3, 2), at(1, 1)), 'row')).toEqual(table.rows.slice(1, 4).map((row) => row.id));
    expect(tableSelectionAxisIds(table, tableRowSelection(identity, table.rows[1].id, table.rows[2].id), 'row')).toEqual([table.rows[1].id, table.rows[2].id]);
    // A row chosen in the side selector touches no single column (and the reverse).
    expect(tableSelectionAxisIds(table, tableRowSelection(identity, table.rows[1].id), 'column')).toEqual([]);
    expect(tableSelectionAxisIds(table, tableColumnSelection(identity, table.columns[1].id), 'row')).toEqual([]);
    expect(tableSelectionAxisIds(table, wholeTableSelection(identity), 'row')).toHaveLength(5);
    const merged = mergeCells(table, table.cells.find((cell) => cell.rowId === table.rows[1].id && cell.columnId === table.columns[0].id)!.id, 2, 1);
    expect(tableSelectionAxisIds(merged, tableCellSelection(identity, at(1, 0)), 'row')).toEqual([table.rows[1].id, table.rows[2].id]);
  });

  it('inserts an ordinary row under the header and a header row above it', () => {
    const table = createNewTableModel({ rows: 3, columns: 2 });
    expect(insertedRowRole(table, table.rows[0].id, 'after')).toBe('body');
    expect(insertedRowRole(table, table.rows[0].id, 'before')).toBe('header');
    expect(insertedRowRole(table, table.rows[1].id, 'after')).toBe('body');
    const twoHeaders = { ...table, rows: table.rows.map((row, index) => index < 2 ? { ...row, role: 'header' as const } : row) };
    expect(insertedRowRole(twoHeaders, twoHeaders.rows[0].id, 'after')).toBe('header');
  });

  it('plans the removal of several rows and refuses the last row or a merged cell before anything changes', () => {
    const table = createNewTableModel({ rows: 6, columns: 3 });
    const rows = table.rows.map((row) => row.id);
    expect(planTableAxisRemoval(table, 'row', [rows[4], rows[2], rows[3]])).toEqual({ ok: true, axisIds: [rows[2], rows[3], rows[4]] });
    expect(planTableAxisRemoval(table, 'row', rows)).toEqual({ ok: false, code: 'TABLE_LAST_AXIS' });
    expect(planTableAxisRemoval(table, 'row', [])).toEqual({ ok: false, code: 'NO_AXIS' });
    const merged = mergeCells(table, table.cells.find((cell) => cell.rowId === rows[2] && cell.columnId === table.columns[0].id)!.id, 1, 2);
    expect(planTableAxisRemoval(merged, 'row', [rows[1], rows[2]])).toEqual({ ok: false, code: 'MERGE_INTERSECTION' });
    expect(removeAxisLabel('row', 1)).toBe('Excluir linha');
    expect(removeAxisLabel('row', 5)).toBe('Excluir 5 linhas');
    expect(removeAxisLabel('column', 2)).toBe('Excluir 2 colunas');
    expect(tableAxisRefusalMessage('MERGE_INTERSECTION', 'row')).toContain('A remoção cruza uma célula mesclada.');
  });

  it('removes five rows in one undo step and Desfazer brings them all back', () => {
    const { session, pageId, objectId } = setup();
    const before = session.getSnapshot();
    const table = live(session, objectId).table;
    const chosen = table.rows.slice(2, 7).map((row) => row.id);
    const plan = planTableAxisRemoval(table, 'row', chosen);
    if (!plan.ok) throw new Error(plan.code);
    const outcome = removeTableAxes(session, { pageId, object: live(session, objectId) }, 'row', plan.axisIds, 'remove-five');
    expect(outcome.ok).toBe(true);
    expect(live(session, objectId).table.rows.map((row) => row.id)).toEqual([table.rows[0].id, table.rows[1].id, table.rows[7].id]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before.document);
    expect(session.redo().ok).toBe(true);
    expect(live(session, objectId).table.rows).toHaveLength(3);
  });

  it('a new row keeps the bands and the highlighted first column, inside the same undo step', () => {
    const { session, pageId, objectId } = setup(createNewTableModel({ rows: 4, columns: 3 }));
    const document = session.getSnapshot().document;
    const look = projectTableLook(live(session, objectId).table, document.style);
    runTableSteps(session, { pageId, objectId }, tableLookSteps({ kind: 'preset', presetId: 'comparison' }, look, document.style), 'look');
    const styled = session.getSnapshot();
    const table = live(session, objectId).table;
    const outcome = insertTableAxes(session, { pageId, object: live(session, objectId) }, {
      axis: 'row', referenceAxisId: table.rows[1].id, position: 'before', count: 1,
      properties: { role: 'body', heightPolicy: { mode: 'AUTO' } },
    }, 'insert-row');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.insertedAxisIds).toHaveLength(1);
    const grown = live(session, objectId).table;
    const band = tablePresetAccents(document.style, 'comparison').band;
    expect(grown.rows.map((row) => row.style?.background ?? null)).toEqual([null, null, band, null, band]);
    const newCell = grown.cells.find((cell) => cell.rowId === outcome.insertedAxisIds[0] && cell.columnId === grown.columns[0].id);
    expect(newCell?.style?.fontWeight).toBe(700);
    expect(projectTableLook(grown, document.style)).toMatchObject({ banded: true, firstColumn: true });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(styled.document);
  });

  it('moves the selection to the new cell, or to the cell where the removed rows were', () => {
    const table = createNewTableModel({ rows: 4, columns: 3 });
    const identity = tableSelectionIdentity('page', 'object', table.id);
    const cell = tableCellSelection(identity, { rowId: table.rows[1].id, columnId: table.columns[2].id });
    const grown: TableModel = { ...table, rows: [...table.rows, { ...table.rows[1], id: 'new-row' }],
      cells: [...table.cells, ...table.columns.map((column, index) => ({ id: `new-cell-${index}`, rowId: 'new-row', columnId: column.id, content: { type: 'empty' as const } }))] };
    expect(selectionAfterTableAxisInsert(grown, cell, 'row', 'new-row')).toEqual(tableCellSelection(identity, { rowId: 'new-row', columnId: table.columns[2].id }));
    expect(selectionAfterTableAxisInsert(grown, tableRowSelection(identity, table.rows[1].id), 'row', 'new-row')).toEqual(tableRowSelection(identity, 'new-row'));
    const shrunk: TableModel = { ...table, rows: table.rows.filter((_, index) => index !== 1 && index !== 2),
      cells: table.cells.filter((entry) => entry.rowId !== table.rows[1].id && entry.rowId !== table.rows[2].id) };
    expect(selectionAfterTableAxisRemove(shrunk, cell, 'row', 1, { rowId: table.rows[1].id, columnId: table.columns[2].id }))
      .toEqual(tableCellSelection(identity, { rowId: table.rows[3].id, columnId: table.columns[2].id }));
  });
});
