import { describe, expect, it } from 'vitest';
import { createDocumentSession } from '@/vnext/application';
import type { CatalogDocument, TableModel, TableObject } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import {
  createTableFromPastedText,
  decidePendingTableFit,
  describeRowsByColumns,
  growTableAndPaste,
  isPageLevelPasteTarget,
  newTableTransactionId,
  tablePasteGrowthOffer,
  type PendingTableFit,
} from '@/vnext/app/editor/table-paste-actions';
import type { PreparedTableFitHeight } from '@/vnext/editor/table-fit-height-authoring';
import { classifyEditorNotice } from '@/vnext/editor/editor-notices';
import { tableCellSelection, tableSelectionIdentity } from '@/vnext/editor/table-selection';

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function setup() {
  const session = createDocumentSession(createW2CDemoDocument(ids('doc')), { createId: ids('generated') });
  return { session, pageId: session.getSnapshot().document.pages[0].id };
}

function onlyTable(document: CatalogDocument): TableObject {
  const table = document.pages[0].objects.find((object): object is TableObject => object.type === 'table');
  if (!table) throw new Error('Missing table');
  return table;
}

function textAt(table: TableModel, row: number, column: number): string {
  const cell = table.cells.find((entry) => entry.rowId === table.rows[row].id && entry.columnId === table.columns[column].id);
  if (!cell || cell.content.type !== 'richText') return '';
  return cell.content.value.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '').join('')).join('\n');
}

describe('FR-31 createTableFromPastedText', () => {
  it('inserts a styled, full-width table under the given transaction and reports it in Portuguese', () => {
    const { session, pageId } = setup();
    const before = session.getSnapshot();
    const outcome = createTableFromPastedText(session, pageId, 'Modelo\tExatidão\nTA-25N\t±0,1 °C\nTA-50N\t±0,15 °C', { transactionId: 'tx-1' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.message).toBe('Tabela criada com 3 linhas e 2 colunas. A primeira linha virou o cabeçalho, em destaque. Para voltar, use Desfazer.');
    const created = onlyTable(session.getSnapshot().document);
    expect(created.id).toBe(outcome.objectId);
    expect(created.table.rows[0].role).toBe('header');
    expect(created.table.style.rowRoles.section?.background).not.toBe('#172033');
    expect(textAt(created.table, 1, 1)).toBe('±0,1 °C');
    expect(created.frame).toMatchObject({ xMm: 12, yMm: 12, widthMm: 186 });
    session.undo();
    expect(session.getSnapshot().document).toEqual(before.document);
  });

  it('respects an explicit "sem cabeçalho" choice and explains padded rows', () => {
    const { session, pageId } = setup();
    const outcome = createTableFromPastedText(session, pageId, 'Modelo\tFaixa\tExatidão\nTA-25N\n1\t2\t3', { header: false, transactionId: 'tx-2' });
    expect(outcome.ok && outcome.message).toContain('A linha 2 tinha menos colunas; completamos com células vazias.');
    expect(onlyTable(session.getSnapshot().document).table.rows.every((row) => row.role === 'body')).toBe(true);
  });

  it('keeps the padded-rows warning short when many rows were completed', () => {
    const { session, pageId } = setup();
    const text = ['A\tB\tC', ...Array.from({ length: 9 }, (_, index) => `x${index}`)].join('\n');
    const outcome = createTableFromPastedText(session, pageId, text, { transactionId: 'tx-many' });
    expect(outcome.ok && outcome.message).toContain('As linhas 2, 3, 4, 5, 6 e outras 4 tinham menos colunas');
  });

  it('words every success like the page messages, so even the sentence alone never reads as a problem', () => {
    const { session, pageId } = setup();
    // Header, a short row (padded) and a wide row (more than 7 columns): every note the summary can carry.
    const text = ['Modelo\tFaixa\tExatidão', 'TA-25N', '1\t2\t3', '4\t5\t6\t7\t8\t9\t10\t11'].join('\n');
    const outcome = createTableFromPastedText(session, pageId, text, { transactionId: 'tx-tone' });
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toMatch(/Para voltar, use Desfazer\.$/);
    expect(outcome.message).not.toMatch(/não|clique em/i);
    expect(classifyEditorNotice(outcome.message)).toBe('success');
  });

  it('changes nothing for empty or oversized pastes', () => {
    const { session, pageId } = setup();
    const before = session.getSnapshot();
    expect(createTableFromPastedText(session, pageId, '\n', { transactionId: 'tx-3' })).toEqual({
      ok: false, message: 'Não há nada para colar. Copie as células no Excel (Ctrl+C) e tente de novo.',
    });
    expect(createTableFromPastedText(session, 'missing-page', 'A\tB', { transactionId: 'tx-4' }).ok).toBe(false);
    expect(session.getSnapshot()).toBe(before);
  });
});

describe('FR-31 growTableAndPaste', () => {
  function tableOnPage(rows: number) {
    const { session, pageId } = setup();
    const lines = ['A\tB', ...Array.from({ length: rows - 1 }, (_, index) => `${index}\tx`)].join('\n');
    const created = createTableFromPastedText(session, pageId, lines, { transactionId: 'seed' });
    if (!created.ok) throw new Error(created.message);
    const object = onlyTable(session.getSnapshot().document);
    const identity = tableSelectionIdentity(pageId, object.id, object.table.id);
    const at = (row: number, column: number) => tableCellSelection(identity, { rowId: object.table.rows[row].id, columnId: object.table.columns[column].id });
    return { session, pageId, object, at };
  }

  it('adds more than 100 rows in chunks and still undoes everything at once', () => {
    const { session, pageId, object, at } = tableOnPage(2);
    const source = { typedText: '', plainText: Array.from({ length: 120 }, (_, index) => `L${index}\t±0,${index} °C`).join('\n') };
    const offer = tablePasteGrowthOffer(object.table, at(1, 0), 120, 2);
    expect(offer?.label).toBe('Adicionar 119 linhas e colar');
    const before = session.getSnapshot();
    const outcome = growTableAndPaste(session, { pageId, object, selection: at(1, 0) }, source, offer!.plan, 'tx-grow');
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.message).toBe('Tabela aumentada em 119 linhas e 240 células coladas. Para voltar, use Desfazer.');
    expect(outcome.ok && classifyEditorNotice(outcome.message)).toBe('success');
    const grown = onlyTable(session.getSnapshot().document).table;
    expect(grown.rows).toHaveLength(121);
    expect(textAt(grown, 120, 1)).toBe('±0,119 °C');
    session.undo();
    expect(session.getSnapshot().document).toEqual(before.document);
  });

  it('describes paste sizes with singular and plural, never "linha(s)"', () => {
    expect(describeRowsByColumns(1, 1)).toBe('1 linha × 1 coluna');
    expect(describeRowsByColumns(4, 3)).toBe('4 linhas × 3 colunas');
    expect(describeRowsByColumns(2, 1)).toBe('2 linhas × 1 coluna');
  });

  it('does not offer growth beyond 10 columns', () => {
    const { object, at } = tableOnPage(2);
    expect(tablePasteGrowthOffer(object.table, at(0, 1), 1, 10)).toBeUndefined();
    expect(tablePasteGrowthOffer(object.table, at(0, 1), 1, 9)?.label).toBe('Adicionar 8 colunas e colar');
  });

  it('checks the paste before changing anything (a stale/bad source leaves the document untouched)', () => {
    const { session, pageId, object, at } = tableOnPage(2);
    const before = session.getSnapshot();
    const outcome = growTableAndPaste(session, { pageId, object, selection: at(1, 0) }, { typedText: '{"bad":true}', plainText: '' }, { rowsToAdd: 1, columnsToAdd: 0, lastRowId: object.table.rows[1].id, lastColumnId: object.table.columns[1].id }, 'tx-bad');
    expect(outcome.ok).toBe(false);
    expect(session.getSnapshot()).toBe(before);
  });
});

describe('FR-31 where Ctrl+V may create a table', () => {
  it('accepts the page, the editing toolbar and an unfocused body, never form fields or editable text', () => {
    document.body.innerHTML = `
      <div class="vnext-authoring-toolbar"><button id="tool">Tabela</button></div>
      <div class="vnext-document-preview"><div id="page"></div><textarea id="draft"></textarea></div>
      <aside><button id="elsewhere">Outro</button><input id="field" /></aside>
      <div id="editable" contenteditable="true"></div>`;
    const byId = (id: string) => document.getElementById(id);
    expect(isPageLevelPasteTarget(document.body, document.body)).toBe(true);
    expect(isPageLevelPasteTarget(byId('page'), document.body)).toBe(true);
    expect(isPageLevelPasteTarget(byId('tool'), document.body)).toBe(true);
    expect(isPageLevelPasteTarget(byId('draft'), document.body)).toBe(false);
    expect(isPageLevelPasteTarget(byId('field'), document.body)).toBe(false);
    expect(isPageLevelPasteTarget(byId('elsewhere'), document.body)).toBe(false);
    const editable = byId('editable')!;
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isPageLevelPasteTarget(editable, document.body)).toBe(false);
    document.body.innerHTML = '';
  });
});

describe('FR-31 transaction ids', () => {
  it('are unique even without crypto.randomUUID (plain http on a local network)', () => {
    const original = globalThis.crypto.randomUUID;
    try {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
      const first = newTableTransactionId();
      const second = newTableTransactionId();
      expect(first).not.toBe(second);
      expect(first).toMatch(/^table-transaction-/);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
    }
    expect(newTableTransactionId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('FR-31 automatic "Ajustar altura" for new tables', () => {
  const document = createW2CDemoDocument(ids('fit'));
  const pending: PendingTableFit = { objectId: 'table-1', transactionId: 'tx-fit', document };
  const prepared = (overrides: Partial<PreparedTableFitHeight> = {}): PreparedTableFitHeight => ({
    pageId: 'page', objectId: 'table-1', tableId: 'model', expectedFrame: { xU: 1, yU: 1, widthU: 10, heightU: 10 },
    expectedTable: {} as TableModel, expectedTypography: { fonts: document.style.fonts, defaultText: document.style.defaultText },
    measuredIntrinsicHeightQ: 100, preparedHeightU: 20, wouldExceedPage: false, tallerThanPage: false, wouldViolateSafeArea: false,
    ...overrides,
  });

  it('waits for the measurement', () => {
    expect(decidePendingTableFit(pending, document, 'table-1', null)).toEqual({ kind: 'wait' });
    expect(decidePendingTableFit(pending, document, 'table-1', { ok: false, reason: 'MEASURING', message: '' })).toEqual({ kind: 'wait' });
  });

  it('gives up when the document or the selection changed, or the measurement is unusable', () => {
    expect(decidePendingTableFit(pending, { ...document }, 'table-1', null)).toEqual({ kind: 'cancel' });
    expect(decidePendingTableFit(pending, document, 'other', null)).toEqual({ kind: 'cancel' });
    expect(decidePendingTableFit(pending, document, 'table-1', { ok: false, reason: 'UNSTABLE', message: '' })).toEqual({ kind: 'cancel' });
    expect(decidePendingTableFit(pending, document, 'table-1', { ok: true, prepared: prepared({ wouldExceedPage: true }) })).toEqual({ kind: 'cancel' });
    expect(decidePendingTableFit(pending, document, 'table-1', { ok: true, prepared: prepared() }, true)).toEqual({ kind: 'cancel' });
  });

  it('after "Adicionar N linhas e colar" only makes the table taller, never shorter than the person made it', () => {
    const grown: PendingTableFit = { ...pending, growOnly: true };
    // Frame 10 U, table needs 20 U: fit.
    expect(decidePendingTableFit(grown, document, 'table-1', { ok: true, prepared: prepared() }).kind).toBe('fit');
    // Frame already has room (30 U for 20 U): keep the height the person chose.
    const roomy = prepared({ expectedFrame: { xU: 1, yU: 1, widthU: 10, heightU: 30 } });
    expect(decidePendingTableFit(grown, document, 'table-1', { ok: true, prepared: roomy })).toEqual({ kind: 'cancel' });
    // A new table (not grown) is fitted exactly, both ways.
    expect(decidePendingTableFit(pending, document, 'table-1', { ok: true, prepared: roomy }).kind).toBe('fit');
  });

  it('B-01: content that grew the table still fits after a click elsewhere, but never over a changed document', () => {
    const grown: PendingTableFit = { ...pending, growOnly: true };
    expect(decidePendingTableFit(grown, document, undefined, { ok: true, prepared: prepared() }).kind).toBe('fit');
    expect(decidePendingTableFit(grown, document, 'other', { ok: true, prepared: prepared() }).kind).toBe('fit');
    expect(decidePendingTableFit(grown, { ...document }, 'table-1', { ok: true, prepared: prepared() })).toEqual({ kind: 'cancel' });
    // No room left on the page: nothing moves (the problem list offers "Continuar na próxima página").
    expect(decidePendingTableFit(grown, document, 'table-1', { ok: true, prepared: prepared({ wouldExceedPage: true }) })).toEqual({ kind: 'cancel' });
    expect(decidePendingTableFit(grown, document, 'table-1', { ok: true, prepared: prepared({ tallerThanPage: true }) })).toEqual({ kind: 'cancel' });
  });

  it('fits with the exact canonical action when the measured table fits on the page', () => {
    const decision = decidePendingTableFit(pending, document, 'table-1', { ok: true, prepared: prepared({ wouldViolateSafeArea: true }) });
    expect(decision).toEqual({
      kind: 'fit',
      action: {
        type: 'table.fitHeight', pageId: 'page', objectId: 'table-1', tableId: 'model',
        expectedFrame: { xU: 1, yU: 1, widthU: 10, heightU: 10 }, expectedTable: {},
        expectedTypography: { fonts: document.style.fonts, defaultText: document.style.defaultText },
        measuredIntrinsicHeightQ: 100, preparedHeightU: 20,
      },
    });
  });
});
