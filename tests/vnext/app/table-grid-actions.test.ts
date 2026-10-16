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
import { emptyTable } from '../proof/test-data';

/**
 * FR-34 (slice 2A): the "+" buttons and the right-click menu run the axis actions that already exist —
 * one insert, or one removal per row under a single transactionId, so one Desfazer brings it all back.
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
      .toMatchObject({ ok: false, message: expect.stringContaining('pelo menos 1 linha') });
    expect(run(session, tableCellSelection(identity, { rowId: 'r2', columnId: 'c1' }), { type: 'remove', axis: 'row' }))
      .toEqual({ ok: false, message: 'Há células mescladas nesta linha. Desfaça a mescla antes de excluir.' });
    expect(session.getSnapshot().document).toBe(before);
  });
});
