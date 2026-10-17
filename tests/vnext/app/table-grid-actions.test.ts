import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession, type DocumentSession, type IdGenerator } from '@/vnext/application';
import type { CatalogDocument, TableModel, TableObject } from '@/vnext/domain';
import { mergeCells } from '@/vnext/table';
import { runTableGridAxisCommand } from '@/vnext/app/editor/table-grid-actions';
import {
  tableCellSelection,
  tableRangeSelection,
  tableRowSelection,
  tableSelectionIdentity,
  type TableSelection,
} from '@/vnext/editor/table-selection';
import { createNewTableModel, createTableInsertSpec, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { runTableSteps } from '@/vnext/app/editor/table-structure-actions';
import { projectTableLook, tableLookSteps } from '@/vnext/editor/table-look-authoring';
import { emptyTable } from '../proof/test-data';

/**
 * FR-34 (slice 2A): the "+" buttons, the right-click menu and Tab on the last cell run the same axis work as the
 * table panel (`table-structure-actions.ts`) — one insert, or one removal per row under a single transactionId,
 * with the table look following the rows, so one Desfazer brings it all back.
 */

function ids(prefix: string): IdGenerator {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function documentWith(table: TableModel, locked = false): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'Grade');
  const object: TableObject = {
    id: 'table-object', type: 'table', frame: { xMm: 20, yMm: 30, widthMm: 120, heightMm: 60 }, zIndex: 0,
    ...(locked ? { locked: true } : {}), table,
  };
  return { ...base, pages: [{ ...base.pages[0], objects: [object] }] };
}

const identityOf = (document: CatalogDocument) => tableSelectionIdentity(document.pages[0].id, 'table-object', 'table');

function liveTable(session: DocumentSession): TableObject {
  const object = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === 'table-object');
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return object;
}

function run(session: DocumentSession, selection: TableSelection, command: Parameters<typeof runTableGridAxisCommand>[2], transactionId = 'tx-1') {
  const pageId = session.getSnapshot().document.pages[0].id;
  return runTableGridAxisCommand(session, { pageId, object: liveTable(session), selection }, command, transactionId);
}

describe('runTableGridAxisCommand — insert', () => {
  it('inserts a row below the selected cell and selects the new cell in the same column', () => {
    const document = documentWith(emptyTable(3, 3));
    const session = createDocumentSession(document, { createId: ids('new') });
    const identity = identityOf(document);
    const outcome = run(session, tableCellSelection(identity, { rowId: 'r1', columnId: 'c2' }), { type: 'insert', axis: 'row', position: 'after' });
    expect(outcome).toMatchObject({ ok: true, message: 'Linha inserida abaixo.', fitHeight: true });
    const table = liveTable(session).table;
    expect(table.rows.map((row) => row.id)).toHaveLength(4);
    const inserted = table.rows[2];
    expect(['r0', 'r1', 'r2']).not.toContain(inserted.id);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.selection).toEqual(tableCellSelection(identity, { rowId: inserted.id, columnId: 'c2' }));
    session.undo();
    expect(liveTable(session).table.rows.map((row) => row.id)).toEqual(['r0', 'r1', 'r2']);
  });

  it('inserts a column to the left of a "+" reference column and says so', () => {
    const document = documentWith(emptyTable(2, 2));
    const session = createDocumentSession(document, { createId: ids('new') });
    const outcome = run(session, tableCellSelection(identityOf(document), { rowId: 'r0', columnId: 'c0' }), {
      type: 'insert', axis: 'column', position: 'before', referenceAxisId: 'c1',
    });
    expect(outcome).toMatchObject({ ok: true, message: 'Coluna inserida à esquerda.', fitHeight: false });
    const columns = liveTable(session).table.columns.map((column) => column.id);
    expect(columns).toHaveLength(3);
    expect(columns[0]).toBe('c0');
    expect(columns[2]).toBe('c1');
  });

  it('Tab on the last cell adds a row at the end and lands on its first cell', () => {
    const document = documentWith(emptyTable(2, 3));
    const session = createDocumentSession(document, { createId: ids('new') });
    const outcome = run(session, tableCellSelection(identityOf(document), { rowId: 'r1', columnId: 'c2' }), {
      type: 'insert', axis: 'row', position: 'after', referenceAxisId: 'r1', selectFirstCell: true,
    });
    expect(outcome).toMatchObject({ ok: true, message: 'Linha adicionada no fim da tabela.' });
    const table = liveTable(session).table;
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.selection).toEqual(tableCellSelection(identityOf(document), { rowId: table.rows[2].id, columnId: 'c0' }));
  });

  it('a locked table is not changed', () => {
    const document = documentWith(emptyTable(2, 2), true);
    const session = createDocumentSession(document, { createId: ids('new') });
    const before = session.getSnapshot().document;
    const outcome = run(session, tableCellSelection(identityOf(document), { rowId: 'r0', columnId: 'c0' }), { type: 'insert', axis: 'row', position: 'after' });
    expect(outcome).toEqual({ ok: false, message: 'Tabela bloqueada não pode ser alterada.' });
    expect(session.getSnapshot().document).toBe(before);
  });
});

describe('runTableGridAxisCommand — remove several', () => {
  it('removes 3 selected rows in one step and one Desfazer brings them all back', () => {
    const document = documentWith(emptyTable(6, 2));
    const session = createDocumentSession(document, { createId: ids('new') });
    const identity = identityOf(document);
    const outcome = run(session, tableRangeSelection(identity, { rowId: 'r1', columnId: 'c0' }, { rowId: 'r3', columnId: 'c1' }), {
      type: 'remove', axis: 'row',
    });
    expect(outcome).toMatchObject({ ok: true, message: '3 linhas excluídas. Para voltar, use Desfazer.', fitHeight: false });
    expect(liveTable(session).table.rows.map((row) => row.id)).toEqual(['r0', 'r4', 'r5']);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.selection).toEqual(tableCellSelection(identity, { rowId: 'r4', columnId: 'c1' }));
    expect(session.undo().ok).toBe(true);
    expect(liveTable(session).table.rows.map((row) => row.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    expect(session.undo().ok).toBe(false);
  });

  it('removes a single column with a singular message', () => {
    const document = documentWith(emptyTable(2, 3));
    const session = createDocumentSession(document, { createId: ids('new') });
    const outcome = run(session, tableCellSelection(identityOf(document), { rowId: 'r0', columnId: 'c1' }), { type: 'remove', axis: 'column' });
    expect(outcome).toMatchObject({ ok: true, message: 'Coluna excluída. Para voltar, use Desfazer.' });
    expect(liveTable(session).table.columns.map((column) => column.id)).toEqual(['c0', 'c2']);
  });

  it('refuses removing every row and a merged cell in the way, changing nothing', () => {
    const merged = mergeCells(emptyTable(4, 2), 'cell1-0', 2, 1);
    const document = documentWith(merged);
    const session = createDocumentSession(document, { createId: ids('new') });
    const identity = identityOf(document);
    const before = session.getSnapshot().document;
    expect(run(session, tableRowSelection(identity, 'r0', 'r3'), { type: 'remove', axis: 'row' }))
      .toEqual({ ok: false, message: 'A última linha ou coluna não pode ser removida.' });
    expect(run(session, tableCellSelection(identity, { rowId: 'r2', columnId: 'c1' }), { type: 'remove', axis: 'row' }))
      .toEqual({ ok: false, message: 'A remoção cruza uma célula mesclada. Desfaça a mesclagem antes de remover.' });
    expect(session.getSnapshot().document).toBe(before);
  });
});

describe('runTableGridAxisCommand — the table look follows the rows (same work as the table panel)', () => {
  function styledTable() {
    const document = createW2CDemoDocument(ids('doc'));
    const session = createDocumentSession(document, { createId: ids('generated') });
    const page = document.pages[0];
    const inserted = session.execute({
      type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, createNewTableModel({ rows: 4, columns: 3 }), document.style),
    });
    if (!inserted.ok) throw new Error('Could not insert the table');
    const objectId = inserted.metadata.createdIds[0];
    const object = () => {
      const found = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === objectId);
      if (!found || found.type !== 'table') throw new Error('Missing table');
      return found;
    };
    const look = projectTableLook(object().table, document.style);
    runTableSteps(session, { pageId: page.id, objectId }, tableLookSteps({ kind: 'preset', presetId: 'comparison' }, look, document.style), 'look');
    return { session, pageId: page.id, object, style: document.style };
  }

  it('Tab on the last cell keeps the bands and the highlighted first column on the new row, in one Desfazer', () => {
    const { session, pageId, object, style } = styledTable();
    const styled = session.getSnapshot().document;
    const table = object().table;
    const last = { rowId: table.rows[table.rows.length - 1].id, columnId: table.columns[table.columns.length - 1].id };
    const selection = tableCellSelection(tableSelectionIdentity(pageId, object().id, table.id), last);
    const outcome = runTableGridAxisCommand(session, { pageId, object: object(), selection }, {
      type: 'insert', axis: 'row', position: 'after', referenceAxisId: last.rowId, selectFirstCell: true,
    }, 'tab-new-row');
    expect(outcome).toMatchObject({ ok: true, message: 'Linha adicionada no fim da tabela.', fitHeight: true });
    const grown = object().table;
    expect(grown.rows).toHaveLength(5);
    expect(projectTableLook(grown, style)).toMatchObject({ banded: true, firstColumn: true });
    const newRow = grown.rows[4];
    expect(grown.cells.find((cell) => cell.rowId === newRow.id && cell.columnId === grown.columns[0].id)?.style?.fontWeight).toBe(700);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.selection).toMatchObject({ kind: 'cell', focus: { rowId: newRow.id, columnId: grown.columns[0].id } });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(styled);
  });

  it('removing rows from the menu keeps the bands in order, in one Desfazer', () => {
    const { session, pageId, object, style } = styledTable();
    const styled = session.getSnapshot().document;
    const table = object().table;
    const identity = tableSelectionIdentity(pageId, object().id, table.id);
    const outcome = runTableGridAxisCommand(session, {
      pageId, object: object(), selection: tableCellSelection(identity, { rowId: table.rows[1].id, columnId: table.columns[1].id }),
    }, { type: 'remove', axis: 'row' }, 'menu-remove');
    expect(outcome).toMatchObject({ ok: true, message: 'Linha excluída. Para voltar, use Desfazer.' });
    expect(projectTableLook(object().table, style)).toMatchObject({ banded: true, firstColumn: true });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(styled);
  });
});
