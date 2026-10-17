import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession, type DocumentSession } from '@/vnext/application';
import type { CatalogDocument, TableObject } from '@/vnext/domain';
import type { SourceTableBlock } from '@/vnext/ai-catalog/intake/intake-model';
import {
  finishSourceTableInsert, insertSourceTable, planSourceTableFollowUp, sourceChoiceProblem, sourceColumns, sourceHasHeader,
  sourceTableCells, sourceTableModel, suggestSourceColumns, SUGGESTED_A4_COLUMNS, type SourceTableChoice,
} from '@/vnext/ai-catalog/intake/source-table-insert';
import { cellText, measureTable, richPlain } from '../../editor/table-split-fixtures';

const id = () => crypto.randomUUID();
const freshSession = (document: CatalogDocument = createCatalogDocument(id, 'TA-25N — Ficha técnica 2026')) =>
  createDocumentSession(document, { createId: id });

const letters = 'ABCDEFGHIJKLMNOP';
/** A DB_SENSORS-like sheet: 3 title rows, the header on the 4th row, then the sensors. */
function sensorsBlock(bodyRows = 69, options: { columns?: number; duplicateLast?: boolean; emptyColumn?: number } = {}): SourceTableBlock {
  const width = options.columns ?? 10;
  const header = ['Code', 'Range (1)', 'Range (2)', 'Range (3)', 'Gauge Type', 'Accuracy', 'Precision', 'Description', 'Family(ies)', 'Family(ies)',
    'Extra 1', 'Extra 2'].slice(0, width);
  const body = Array.from({ length: bodyRows }, (_, row) => header.map((_, column) => {
    if (column === options.emptyColumn) return '';
    if (column === 0) return `0D${100 + row}`;
    if (column === 1) return `± ${row + 1}00 Pa`;
    if (column === 2) return `0,${row + 40} inH2O`;
    if (column === 5) return '0,025';
    if (options.duplicateLast && column === width - 1) return `Y17, Y18-LP ${row % 3}`;
    if (options.duplicateLast && column === width - 2) return `Y17, Y18-LP ${row % 3}`;
    return `${header[column]} ${row + 1}`;
  }));
  const rows = [['SENSORS DATABASE', ...Array(width - 1).fill('')], Array(width).fill(''), ['Revisão 2026', ...Array(width - 1).fill('')], header, ...body];
  if (options.duplicateLast) rows[3][width - 1] = rows[3][width - 2];
  return {
    id: 'source-0-abc-0', kind: 'table', title: 'PCON-MASTER-ENGLISHV2.xlsx · DB_SENSORS', warnings: [],
    source: { fileName: 'PCON-MASTER-ENGLISHV2.xlsx', sha256: 'abc', location: 'aba DB_SENSORS', sheet: 'DB_SENSORS' },
    rows, raw: rows.map((row) => [...row]), flags: [], merges: [], headerRow: 3, range: 'A1:L74',
    addresses: rows.map((row, ri) => row.map((_, ci) => `DB_SENSORS!${letters[ci]}${ri + 1}`)),
  };
}

const tables = (document: CatalogDocument): TableObject[] =>
  document.pages.flatMap((page) => page.objects.filter((object): object is TableObject => object.type === 'table'));

function insertAndMeasure(session: DocumentSession, choice: SourceTableChoice, rowHeightMm = 8) {
  const transactionId = 'intake-transaction';
  const outcome = insertSourceTable(session, session.getSnapshot().document.pages[0].id, choice, transactionId);
  if (!outcome.ok) throw new Error(outcome.message);
  const document = session.getSnapshot().document;
  const measurement = measureTable(document, { pageId: outcome.inserted.pageId, objectId: outcome.inserted.objectId, rowHeightMm });
  return { inserted: outcome.inserted, measurement };
}

describe('FR-64 "Escolher colunas": columns of a table read from a file', () => {
  it('names each column by its header and its Excel letter, with an example value', () => {
    const block = sensorsBlock();
    const columns = sourceColumns(block);
    expect(columns[0]).toMatchObject({ index: 0, letter: 'A', label: 'Code', sample: '0D100', empty: false });
    expect(columns[2]).toMatchObject({ letter: 'C', label: 'Range (2)', sample: '0,40 inH2O' });
    expect(sourceHasHeader(block)).toBe(true);
  });

  it(`suggests at most ${SUGGESTED_A4_COLUMNS} columns, leaving out empty columns and exact copies`, () => {
    const block = sensorsBlock(69, { emptyColumn: 1, duplicateLast: true });
    const suggested = suggestSourceColumns(block);
    expect(suggested).toHaveLength(SUGGESTED_A4_COLUMNS);
    expect(suggested).not.toContain(1);
    expect(suggested).toEqual([0, 2, 3, 4, 5, 6, 7]);
    // A short table keeps all its useful columns.
    expect(suggestSourceColumns(sensorsBlock(5, { columns: 4 }))).toEqual([0, 1, 2, 3]);
  });

  it('keeps the text exactly as read (commas and decimals as in Excel) and starts at the header row', () => {
    const block = sensorsBlock(3);
    const cells = sourceTableCells({ block, columns: [0, 2, 5], header: true });
    expect(cells).toEqual([
      ['Code', 'Range (2)', 'Accuracy'],
      ['0D100', '0,40 inH2O', '0,025'],
      ['0D101', '0,41 inH2O', '0,025'],
      ['0D102', '0,42 inH2O', '0,025'],
    ]);
    const table = sourceTableModel({ block, columns: [0, 2, 5], header: true });
    expect(table.rows.map((row) => row.role)).toEqual(['header', 'body', 'body', 'body']);
    expect(cellText(table, table.rows[1].id, 1)).toBe('0,40 inH2O');
  });

  it('explains in plain words why a choice cannot be inserted', () => {
    const block = sensorsBlock(3, { columns: 12 });
    expect(sourceChoiceProblem({ block, columns: [], header: true })).toBe('Escolha pelo menos 1 coluna.');
    expect(sourceChoiceProblem({ block, columns: Array.from({ length: 11 }, (_, index) => index), header: true }))
      .toBe('Numa página A4 cabem no máximo 10 colunas. Desmarque 1.');
    expect(sourceChoiceProblem({ block: sensorsBlock(160), columns: [0], header: true })).toContain('até 150');
    expect(sourceChoiceProblem({ block, columns: [0, 1], header: true })).toBeUndefined();
  });
});

describe('FR-64 "Inserir como tabela": one step, styled, continued on the next pages when long (FR-35)', () => {
  it('J12: 69 sensors × 7 columns become a styled table that continues on new pages with the header repeated; one Desfazer removes it all', () => {
    const session = freshSession();
    const before = session.getSnapshot().document;
    const block = sensorsBlock(69);
    const choice = { block, columns: suggestSourceColumns(block), header: true };
    const { inserted, measurement } = insertAndMeasure(session, choice);
    expect(inserted).toMatchObject({ pageId: before.pages[0].id, newPage: false, rows: 70, columns: 7 });
    const first = tables(session.getSnapshot().document)[0];
    // House preset: the header row is styled like the tables the editor creates.
    expect(first.table.style.rowRoles.header).toBeDefined();

    expect(planSourceTableFollowUp(session, inserted, measurement)).toEqual({ kind: 'split' });
    const outcome = finishSourceTableInsert(session, inserted, measurement);
    expect(outcome.kind).toBe('done');
    const after = session.getSnapshot().document;
    const parts = tables(after);
    expect(after.pages.length).toBeGreaterThanOrEqual(3);
    expect(parts.length).toBe(after.pages.length);
    expect(outcome.kind === 'done' && outcome.pageIds).toEqual(after.pages.map((page) => page.id));
    expect(outcome.kind === 'done' && outcome.message).toMatch(/^Tabela com 70 linhas × 7 colunas inserida na página 1\. \d+ linhas movidas para as páginas 2 e 3, com o cabeçalho repetido\. Use Desfazer se precisar\.$/);
    for (const part of parts) {
      expect(part.table.rows[0].role).toBe('header');
      expect(cellText(part.table, part.table.rows[0].id, 0)).toBe('Code');
    }
    expect(parts.slice(1).every((part) => richPlain(part.table.title).includes('(continuação)'))).toBe(true);
    const bodyCodes = parts.flatMap((part) => part.table.rows.slice(1).map((row) => cellText(part.table, row.id, 0)));
    expect(bodyCodes).toEqual(Array.from({ length: 69 }, (_, row) => `0D${100 + row}`));

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('a short table that fits gets its height fitted in the same step', () => {
    const session = freshSession();
    const before = session.getSnapshot().document;
    const block = sensorsBlock(5, { columns: 4 });
    const { inserted, measurement } = insertAndMeasure(session, { block, columns: [0, 1, 2, 3], header: true }, 7);
    expect(planSourceTableFollowUp(session, inserted, measurement)).toEqual({ kind: 'fit' });
    const outcome = finishSourceTableInsert(session, inserted, measurement);
    expect(outcome).toMatchObject({ kind: 'done', message: 'Tabela com 6 linhas × 4 colunas inserida na página 1. Use Desfazer se precisar.' });
    expect(session.getSnapshot().document.pages).toHaveLength(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('a page that already has content gets the table on a new page right after it (nothing is covered)', () => {
    const session = freshSession();
    const pageId = session.getSnapshot().document.pages[0].id;
    expect(session.execute({ type: 'page.add' }).ok).toBe(true);
    const block = sensorsBlock(3, { columns: 3 });
    const prior = insertSourceTable(session, pageId, { block, columns: [0, 1, 2], header: true }, 't-1');
    expect(prior.ok && prior.inserted.newPage).toBe(false);
    const before = session.getSnapshot().document;
    const next = insertSourceTable(session, pageId, { block, columns: [0, 1], header: true }, 't-2');
    if (!next.ok) throw new Error(next.message);
    const after = session.getSnapshot().document;
    expect(next.inserted.newPage).toBe(true);
    expect(after.pages.map((page) => page.id).indexOf(next.inserted.pageId)).toBe(1);
    expect(after.pages[1].objects).toHaveLength(1);
    expect(after.pages[0].objects).toHaveLength(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('when the catalog changes before the measurement, the table stays as inserted and the person is told how to continue', () => {
    const session = freshSession();
    const block = sensorsBlock(69);
    const { inserted, measurement } = insertAndMeasure(session, { block, columns: [0, 1, 2], header: true });
    expect(session.execute({ type: 'document.rename', title: 'Outro nome' }).ok).toBe(true);
    const outcome = finishSourceTableInsert(session, inserted, measurement);
    expect(outcome.kind).toBe('manual');
    expect(outcome.kind !== 'wait' && outcome.message).toContain('“Continuar na próxima página”');
    expect(session.getSnapshot().document.pages).toHaveLength(1);
  });

  it('waits while there is no measurement of the catalog right after the insert', () => {
    const session = freshSession();
    const block = sensorsBlock(69);
    const outcome = insertSourceTable(session, undefined, { block, columns: [0, 1], header: true }, 't');
    if (!outcome.ok) throw new Error(outcome.message);
    expect(finishSourceTableInsert(session, outcome.inserted, null)).toEqual({ kind: 'wait' });
    const old = measureTable(session.getSnapshot().document, { pageId: outcome.inserted.pageId, objectId: outcome.inserted.objectId });
    expect(finishSourceTableInsert(session, outcome.inserted, { ...old, source: createCatalogDocument(id) })).toEqual({ kind: 'wait' });
  });

  it('refuses an empty choice without changing the catalog', () => {
    const session = freshSession();
    const before = session.getSnapshot().document;
    const outcome = insertSourceTable(session, undefined, { block: sensorsBlock(3), columns: [], header: true }, 't');
    expect(outcome).toEqual({ ok: false, message: 'Escolha pelo menos 1 coluna. Nada foi alterado.' });
    expect(session.getSnapshot().document).toBe(before);
  });
});
