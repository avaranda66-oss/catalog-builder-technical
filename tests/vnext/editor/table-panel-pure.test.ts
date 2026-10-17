import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDocumentSession, projectEditableRichText } from '@/vnext/application';
import { createNewTableModel, createTableInsertSpec, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { runTableSteps } from '@/vnext/app/editor/table-structure-actions';
import { plainRichText, type CatalogDocument, type TableObject } from '@/vnext/domain';
import { EDITING_STRUCTURE_REASON, tableStructureAvailability } from '@/vnext/editor/table-axis-authoring';
import { cellCountText, describeTableLocation } from '@/vnext/editor/table-location';
import {
  QUICK_NOTE_PLACEHOLDER,
  quickNoteCreateStep,
  quickNoteRemovable,
  quickNoteRemoveSteps,
  tableQuickNotes,
} from '@/vnext/editor/table-quick-notes';
import {
  tableCellSelection,
  tableColumnSelection,
  tableRangeSelection,
  tableSelectionIdentity,
  wholeTableSelection,
} from '@/vnext/editor/table-selection';

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function setup(size = { rows: 5, columns: 3 }) {
  const document = createW2CDemoDocument(ids('doc'));
  const session = createDocumentSession(document, { createId: ids('generated') });
  const page = document.pages[0];
  const result = session.execute({ type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, createNewTableModel(size), document.style) });
  if (!result.ok) throw new Error('Could not insert the table');
  return { session, pageId: page.id, objectId: result.metadata.createdIds[0] };
}

function tableObject(document: CatalogDocument, objectId: string): TableObject {
  const object = document.pages.flatMap((page) => page.objects).find((entry) => entry.id === objectId);
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return object;
}

describe('FR-20 (2D) problems located as "Linha N, coluna M"', () => {
  it('counts rows and columns from 1 and never shows an internal identifier', () => {
    const { session, objectId } = setup();
    const { table } = tableObject(session.getSnapshot().document, objectId);
    const cell = table.cells.find((entry) => entry.rowId === table.rows[2].id && entry.columnId === table.columns[1].id)!;
    expect(describeTableLocation(table, table.rows[2].id, cell.id)).toBe('Linha 3, coluna 2');
    expect(describeTableLocation(table, undefined, cell.id)).toBe('Linha 3, coluna 2');
    expect(describeTableLocation(table, table.rows[0].id)).toBe('Linha 1');
    expect(describeTableLocation(table, 'removed-row', 'removed-cell')).toBe('');
  });

  it('counts cells with the right plural, never "célula(s)"', () => {
    expect(cellCountText(1)).toBe('1 célula');
    expect(cellCountText(0)).toBe('0 células');
    expect(cellCountText(12)).toBe('12 células');
  });

  it('no table message written in the editor or the table panel uses an internal word', () => {
    // Quoted texts only (messages, labels, titles); code names such as "tsv" or "RichText" in identifiers do not count.
    const quoted = /'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|>[^<>{}\n]+</g;
    const forbidden = /\beixos?\b|\btsv\b|peso flexível|\(s\)|superfícies semânticas|explicitamente|\bpadding\b|\bhex\b|\bmisto\b/i;
    const files = [
      'src/vnext/app/EditorWorkspace.tsx',
      'src/vnext/app/TableStyleInspector.tsx',
      'src/vnext/app/editor/TableInspectorPanel.tsx',
      'src/vnext/app/editor/TableGridToolbar.tsx',
      'src/vnext/app/editor/TableLookSection.tsx',
      'src/vnext/app/editor/TableStructureSection.tsx',
      'src/vnext/app/editor/TableNotesSection.tsx',
      'src/vnext/editor/table-axis-authoring.ts',
    ];
    const found = files.flatMap((file) => (readFileSync(file, 'utf8').match(quoted) ?? [])
      // Selectors, class names, data attributes and import paths are not shown to anyone.
      .filter((text) => !/^['`][\w./@[\]="-]*['`]$/.test(text) && !/data-|className|\[data/.test(text))
      .filter((text) => forbidden.test(text))
      .map((text) => `${file}: ${text}`));
    expect(found).toEqual([]);
  });
});

describe('FR-34 one rule for the structure buttons', () => {
  it('derives rows and columns from a cell, a range, a column or the whole table', () => {
    const { session, pageId, objectId } = setup();
    const { table } = tableObject(session.getSnapshot().document, objectId);
    const identity = tableSelectionIdentity(pageId, objectId, table.id);
    const at = (row: number, column: number) => ({ rowId: table.rows[row].id, columnId: table.columns[column].id });

    const cell = tableStructureAvailability(table, tableCellSelection(identity, at(1, 1)), false);
    expect(cell).toMatchObject({ rowIds: [table.rows[1].id], columnIds: [table.columns[1].id] });
    expect(cell.rowReason).toBeUndefined();
    expect(cell.removeRowReason).toBeUndefined();

    const range = tableStructureAvailability(table, tableRangeSelection(identity, at(1, 0), at(3, 0)), false);
    expect(range.rowIds).toEqual(table.rows.slice(1, 4).map((row) => row.id));

    const column = tableStructureAvailability(table, tableColumnSelection(identity, table.columns[2].id), false);
    expect(column.rowIds).toEqual([]);
    expect(column.rowReason).toBe('Clique numa célula da tabela para inserir ou excluir linhas.');
    expect(column.columnReason).toBeUndefined();

    const whole = tableStructureAvailability(table, wholeTableSelection(identity), false);
    expect(whole.removeRowReason).toBe('A tabela precisa de pelo menos uma linha.');
    expect(whole.removeColumnReason).toBe('A tabela precisa de pelo menos uma coluna.');

    expect(tableStructureAvailability(table, null, false).rowReason).toBe('Clique numa célula da tabela para inserir ou excluir linhas.');
    expect(tableStructureAvailability(table, tableCellSelection(identity, at(1, 1)), true)).toMatchObject({
      rowReason: EDITING_STRUCTURE_REASON,
      columnReason: EDITING_STRUCTURE_REASON,
      removeRowReason: EDITING_STRUCTURE_REASON,
    });
  });
});

describe('FR-33 "Adicionar nota" in one click', () => {
  it('adds a note under the table starting as "A COMPLETAR", in one undo step', () => {
    const { session, pageId, objectId } = setup();
    const before = session.getSnapshot().document;
    const outcome = runTableSteps(session, { pageId, objectId }, [quickNoteCreateStep()], 'note-1');
    expect(outcome).toMatchObject({ ok: true, changed: true });
    const { table } = tableObject(session.getSnapshot().document, objectId);
    const notes = tableQuickNotes(table);
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe('note');
    expect(projectEditableRichText(notes[0].text)).toBe(QUICK_NOTE_PLACEHOLDER);
    expect(table.annotationIds).toEqual([notes[0].id]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('removes a table note (detach and delete) in one undo step, and leaves a note cells use to "Notas e legenda"', () => {
    const { session, pageId, objectId } = setup();
    runTableSteps(session, { pageId, objectId }, [quickNoteCreateStep()], 'note-1');
    const withNote = session.getSnapshot().document;
    const note = tableQuickNotes(tableObject(withNote, objectId).table)[0];
    expect(quickNoteRemovable(tableObject(withNote, objectId).table, note.id)).toBe(true);
    const removed = runTableSteps(session, { pageId, objectId }, quickNoteRemoveSteps(note.id), 'note-2');
    expect(removed).toMatchObject({ ok: true, changed: true });
    const { table } = tableObject(session.getSnapshot().document, objectId);
    expect(table.annotations).toHaveLength(0);
    expect(table.annotationIds ?? []).toEqual([]);
    session.undo();
    expect(session.getSnapshot().document).toEqual(withNote);

    const shared = {
      ...tableObject(withNote, objectId).table,
      cells: tableObject(withNote, objectId).table.cells.map((cell, index) => index === 3 ? { ...cell, annotationIds: [note.id] } : cell),
    };
    expect(quickNoteRemovable(shared, note.id)).toBe(false);
    const caption = { ...shared, annotations: [...shared.annotations, { id: 'cap', kind: 'caption' as const, text: plainRichText('cap-text', 'Tabela 1') }], annotationIds: [note.id, 'cap'] };
    expect(tableQuickNotes(caption).map((entry) => entry.id)).toEqual([note.id]);
  });
});
