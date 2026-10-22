import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, projectEditableRichText, type DocumentSession } from '@/vnext/application';
import { createNewTableModel } from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';
import { mmToU, uToQ, type CatalogDocument, type Cell, type TableModel, type TableObject } from '@/vnext/domain';
import type { LayoutSnapshot, PhysicalLayoutFact } from '@/vnext/rendering';
import { tableQuickNotes } from '@/vnext/editor/table-quick-notes';
import { SPLIT_OBJECT_ID, documentWithTable } from '../editor/table-split-fixtures';
import { StrictCasCatalogRepository, runtimeFixture, settleAsyncWork } from '../persistence/w3h-fixtures';

/**
 * B-01 (P1, J4 of 20/10): typing "Parâmetro" and "Faixa" in a new table blocked the PDF with "A tabela ultrapassa
 * a altura reservada". Chromium measured the empty rows of the house style at 6,53 mm and a row with one line of
 * text at 7,76 mm, so the frame fitted to the empty table was 2,4 mm short after two cells. Any content change in
 * a cell now makes the frame grow to the measured table (grow only), in the same Desfazer; when the page has no
 * room, the problem list offers "Continuar na próxima página".
 *
 * jsdom has no layout: only the browser measurement is replaced by that rule (empty row 6,5 mm; 3 mm of padding
 * plus 4,8 mm per line of text; 5 mm per note under the table), everything else is the real editor in simple mode.
 */

const EMPTY_ROW_MM = 6.5;
const ROW_PADDING_MM = 3;
const LINE_MM = 4.8;
const NOTE_MM = 5;

function cellLines(cell: Cell): number {
  const content = cell.content;
  if (content.type === 'empty') return 0;
  if (content.type !== 'richText') return 1;
  const text = projectEditableRichText(content.value) ?? '';
  return text === '' ? 0 : text.split('\n').length;
}

function rowMm(table: TableModel, rowId: string): number {
  const lines = Math.max(0, ...table.cells.filter((cell) => cell.rowId === rowId).map(cellLines));
  return lines === 0 ? EMPTY_ROW_MM : ROW_PADDING_MM + LINE_MM * lines;
}

/** What the browser would measure for every table of the catalog under the rule above. */
function measuredSnapshot(document: CatalogDocument): LayoutSnapshot {
  const facts: PhysicalLayoutFact[] = [];
  for (const page of document.pages) for (const object of page.objects) {
    if (object.type !== 'table') continue;
    const table = object.table;
    const boundaries = [0];
    for (const row of table.rows) boundaries.push(boundaries[boundaries.length - 1] + rowMm(table, row.id));
    const boundariesQ = boundaries.map((mm) => uToQ(mmToU(mm)));
    const footerQ = uToQ(mmToU(NOTE_MM * tableQuickNotes(table).length));
    facts.push({
      kind: 'table', pageId: page.id, objectId: object.id, tableId: table.id, frameWidthU: mmToU(object.frame.widthMm), columnWidthsU: [],
      frameQ: uToQ(mmToU(object.frame.widthMm)), trackQ: [], gridOffsetYQ: 0, renderedIntrinsicHeightQ: boundariesQ[boundariesQ.length - 1] + footerQ,
    });
    table.rows.forEach((row, index) => facts.push({
      kind: 'row', pageId: page.id, tableId: table.id, rowId: row.id, resolvedHeightU: mmToU(rowMm(table, row.id)),
      yQ: boundariesQ[index], heightQ: boundariesQ[index + 1] - boundariesQ[index],
    }));
  }
  return { facts, geometryDiagnostics: [] };
}

vi.mock('@/vnext/rendering/measurement', async (original) => {
  const actual = await original<typeof import('@/vnext/rendering/measurement')>();
  return { ...actual, captureSnapshot: vi.fn(async (document: CatalogDocument) => measuredSnapshot(document)) };
});

let restoreMeasurement: (() => void) | undefined;

beforeEach(() => {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = nativeGetComputedStyle(element, pseudo);
    return new Proxy(style, {
      get(target, property) {
        if (property === 'transform' || property === 'scale' || property === 'translate' || property === 'rotate') return 'none';
        if (property === 'zoom') return '1';
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as CSSStyleDeclaration;
  });
  const originalDecode = HTMLImageElement.prototype.decode;
  const originalRects = Range.prototype.getClientRects;
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  restoreMeasurement = () => {
    computedStyle.mockRestore();
    HTMLImageElement.prototype.decode = originalDecode;
    Range.prototype.getClientRects = originalRects;
  };
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  restoreMeasurement?.();
  restoreMeasurement = undefined;
});

/** The table "Tabela" makes (header + 5 rows × 3 columns), its frame fitted to the empty rows, at `yMm`. */
function newTableSession(yMm = 20, rows = 6): DocumentSession {
  const heightMm = rows * EMPTY_ROW_MM;
  return createDocumentSession(documentWithTable(createNewTableModel({ rows, columns: 3 }), { xMm: 20, yMm, widthMm: 170, heightMm }),
    { createId: () => crypto.randomUUID() });
}

function tableObject(session: DocumentSession): TableObject {
  const object = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === SPLIT_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return object;
}

function textAt(session: DocumentSession, row: number, column: number): string {
  const table = tableObject(session).table;
  const cell = table.cells.find((entry) => entry.rowId === table.rows[row].id && entry.columnId === table.columns[column].id);
  return cell?.content.type === 'richText' ? projectEditableRichText(cell.content.value) ?? '' : '';
}

async function openTableGrid(container: HTMLElement): Promise<HTMLElement> {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${SPLIT_OBJECT_ID}"]`);
  if (!hit) throw new Error('Missing table hit target');
  fireEvent.pointerDown(hit, { pointerId: 91, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId: 91, button: 0, clientX: 100, clientY: 100 });
  const shell = container.querySelector<HTMLElement>('[data-vnext-shell]')!;
  await waitFor(() => {
    if (shell.getAttribute('data-editor-mode') !== 'table-grid') fireEvent.click(screen.getByRole('button', { name: 'Editar tabela' }));
    expect(shell).toHaveAttribute('data-editor-mode', 'table-grid');
  }, { timeout: 3_000 });
  return screen.getByRole('grid', { name: 'Grade da tabela' });
}

const cellEditor = () => screen.getByRole('textbox', { name: /^Conteúdo da célula, / });
const flushMicrotasks = () => act(async () => { await Promise.resolve(); });
/** The problem counter above the page, once the page has been measured. */
const problems = () => screen.queryByRole('button', { name: /^Problemas do catálogo/ });
const blocking = () => /[1-9]\d* a corrigir/.test(problems()?.textContent ?? '');

/** Types `text` in the selected cell (a key opens it, as in Excel) and leaves with `key`. */
async function typeInCell(text: string, key: 'Enter' | 'Tab') {
  fireEvent.keyDown(document.activeElement!, { key: text[0] });
  fireEvent.change(cellEditor(), { target: { value: text } });
  fireEvent.keyDown(cellEditor(), { key });
  await flushMicrotasks();
}

describe('B-01 · typing in a table grows its frame (J4: Parâmetro, Faixa, Enter, Tab, Esc)', { timeout: 20_000 }, () => {
  it('Enter saves the cell and the frame grows to the taller row in the same Desfazer; nothing blocks the PDF', async () => {
    const session = newTableSession();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    const before = session.getSnapshot().document;
    expect(tableObject(session).frame.heightMm).toBeCloseTo(39, 3);

    await typeInCell('Parâmetro', 'Enter');
    expect(textAt(session, 1, 0)).toBe('Parâmetro');
    // Measured again: the row with text is 1,3 mm taller, and the frame follows it.
    await waitFor(() => expect(tableObject(session).frame.heightMm).toBeGreaterThan(40.2), { timeout: 5_000 });
    expect(tableObject(session).frame.heightMm).toBeLessThan(40.35);
    expect(tableObject(session).frame.yMm).toBe(20);
    await waitFor(() => expect(container.querySelector('[data-table-auto-fit]')).toBeNull(), { timeout: 5_000 });
    await waitFor(() => expect(problems()).not.toBeNull(), { timeout: 5_000 });
    expect(blocking()).toBe(false);

    // One Desfazer takes back the text and the growth together.
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('pasting a block of cells and the growth of the frame are one Desfazer and one Refazer (one Ctrl+Z, not two)', async () => {
    const session = newTableSession();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    await openTableGrid(container);
    const before = session.getSnapshot().document;
    expect(session.getSnapshot().canUndo).toBe(false);

    fireEvent.click(container.querySelector<HTMLElement>('[data-table-cell="0:0"]')!);
    fireEvent.click(container.querySelector<HTMLElement>('[data-editor-action="toggle-table-options"]')!);
    fireEvent.click(container.querySelector<HTMLElement>('[data-editor-action="paste-table-cells"]')!);
    fireEvent.change(container.querySelector<HTMLTextAreaElement>('[data-table-paste-textarea]')!, { target: { value: 'Parâmetro\tValor\nPressão\t25 bar\nTemperatura\t90 °C' } });
    const sequenceBefore = session.getSnapshot().localSequence;
    fireEvent.click(container.querySelector<HTMLElement>('[data-editor-action="apply-native-table-paste"]')!);

    expect(textAt(session, 1, 1)).toBe('25 bar');
    // The measured growOnly fit lands after the paste: the session counts two actions, the person has one undo step.
    await waitFor(() => expect(tableObject(session).frame.heightMm).toBeGreaterThan(39), { timeout: 5_000 });
    await waitFor(() => expect(container.querySelector('[data-table-auto-fit]')).toBeNull(), { timeout: 5_000 });
    expect(session.getSnapshot().localSequence - sequenceBefore).toBe(2);
    const afterPaste = session.getSnapshot().document;

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.getSnapshot().canUndo).toBe(false);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="redo"]')!);
    expect(session.getSnapshot().document).toEqual(afterPaste);
    expect(session.getSnapshot().canRedo).toBe(false);
  });

  it('typing the next cell right away does not stop the growth, and Tab grows it again (no "A tabela ultrapassa")', async () => {
    const session = newTableSession();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });

    await typeInCell('Parâmetro', 'Enter');
    // Before the page is measured again, the next key already opens the cell below.
    fireEvent.keyDown(document.activeElement!, { key: 'F' });
    expect(cellEditor()).toHaveAccessibleName('Conteúdo da célula, linha 3, coluna 1');
    fireEvent.change(cellEditor(), { target: { value: 'Faixa' } });
    await waitFor(() => expect(tableObject(session).frame.heightMm).toBeGreaterThan(40.2), { timeout: 5_000 });
    // The cell being typed stays open with its text.
    expect(cellEditor()).toHaveValue('Faixa');

    fireEvent.keyDown(cellEditor(), { key: 'Tab' });
    await flushMicrotasks();
    expect(textAt(session, 2, 0)).toBe('Faixa');
    await waitFor(() => expect(tableObject(session).frame.heightMm).toBeGreaterThan(41.5), { timeout: 5_000 });
    // Esc forgets only the cell being typed.
    fireEvent.keyDown(document.activeElement!, { key: 'D' });
    fireEvent.keyDown(cellEditor(), { key: 'Escape' });
    await flushMicrotasks();
    expect(textAt(session, 2, 1)).toBe('');
    await waitFor(() => expect(container.querySelector('[data-table-auto-fit]')).toBeNull(), { timeout: 5_000 });
    await waitFor(() => expect(problems()).not.toBeNull(), { timeout: 5_000 });
    expect(blocking()).toBe(false);
  });

  it('Salvar while typing saves the cell and then its growth: the catalog ends "Salvo", never "Alterações não salvas"', async () => {
    // PILOT.A proof (21/10): Salvar committed the cell or title and saved at once; the growth measured right after made
    // the catalog dirty again, so the father read "Alterações não salvas" just after pressing Salvar.
    const initial = newTableSession().getSnapshot().document;
    const repository = new StrictCasCatalogRepository(initial);
    const active = runtimeFixture(repository, initial, 15100, { autosave: false });
    const { container } = render(<VNextApp runtime={active.runtime} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'P' });
    fireEvent.change(cellEditor(), { target: { value: 'Parâmetro' } });
    const heightBefore = tableObject(active.session).frame.heightMm;
    await act(async () => {
      fireEvent.keyDown(cellEditor(), { key: 's', ctrlKey: true });
      await settleAsyncWork(4);
      await active.runtime.saveCoordinator.waitForActiveSave();
    });
    expect(textAt(active.session, 1, 0)).toBe('Parâmetro');
    await waitFor(() => expect(tableObject(active.session).frame.heightMm).toBeGreaterThan(heightBefore + 1), { timeout: 5_000 });
    await waitFor(() => {
      const workspace = active.runtime.workspace.getSnapshot();
      expect(workspace.dirty).toBe(false);
      expect(workspace.save.label).toBe('Saved');
    }, { timeout: 5_000 });
    // The cell, then the growth that belongs to it: what is stored is what the father sees.
    expect(repository.saveCAS).toHaveBeenCalledTimes(2);
    expect(repository.current(initial.id).documentSnapshot).toEqual(active.session.getSnapshot().document);
    await act(async () => { await active.runtime.dispose(); });
  });

  it('Tab on the last cell adds a row and the frame holds the row and the typed text; Desfazer keeps the text', async () => {
    const session = newTableSession(20, 2);
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });

    await typeInCell('4 a 20 mA', 'Tab');
    expect(tableObject(session).table.rows).toHaveLength(3);
    // Header 6,5 + typed row 7,8 + new row 6,5 mm.
    await waitFor(() => expect(tableObject(session).frame.heightMm).toBeGreaterThan(20.7), { timeout: 5_000 });
    await waitFor(() => expect(problems()).not.toBeNull(), { timeout: 5_000 });
    expect(blocking()).toBe(false);

    // FR-30: one Desfazer takes the added row (and its room) away; the typed value stays.
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(tableObject(session).table.rows).toHaveLength(2);
    expect(textAt(session, 1, 2)).toBe('4 a 20 mA');
  });

  it('"Adicionar nota" makes room for the note under the table; one Desfazer takes back both', async () => {
    const session = newTableSession();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    await openTableGrid(container);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    const before = session.getSnapshot().document;
    const panel = screen.getByRole('complementary', { name: 'Propriedades do objeto' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Adicionar nota' }));
    expect(tableObject(session).table.annotations).toHaveLength(1);
    await waitFor(() => expect(tableObject(session).frame.heightMm).toBeGreaterThan(43.9), { timeout: 5_000 });
    expect(tableObject(session).frame.heightMm).toBeLessThan(44.05);

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('a frame taller than it needs keeps its height', async () => {
    const roomy = documentWithTable(createNewTableModel({ rows: 6, columns: 3 }), { xMm: 20, yMm: 20, widthMm: 170, heightMm: 60 });
    const session = createDocumentSession(roomy, { createId: () => crypto.randomUUID() });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });

    await typeInCell('Parâmetro', 'Enter');
    await waitFor(() => expect(container.querySelector('[data-table-auto-fit]')).toBeNull(), { timeout: 5_000 });
    expect(tableObject(session).frame.heightMm).toBe(60);
  });

  it('when the taller table no longer fits on the page, nothing moves and the problem offers "Continuar na próxima página"', async () => {
    // Frame bottom 0,7 mm above the edge of the A4 page: one more line of text does not fit.
    const rows = 20;
    const session = newTableSession(297 - rows * EMPTY_ROW_MM - 0.7, rows);
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    const frameBefore = tableObject(session).frame;

    await typeInCell('Parâmetro', 'Enter');
    await waitFor(() => expect(blocking()).toBe(true), { timeout: 5_000 });
    expect(tableObject(session).frame).toEqual(frameBefore);

    fireEvent.click(problems()!);
    const list = screen.getByRole('dialog', { name: 'Problemas do catálogo' });
    const overflow = list.querySelector<HTMLElement>('[data-issue-code="TABLE_CONTENT_OVERFLOW"]')!;
    expect(overflow).toHaveTextContent('A tabela ultrapassa a altura reservada.');
    expect(within(overflow).queryByRole('button', { name: 'Ajustar altura da tabela' })).toBeNull();
    fireEvent.click(within(overflow).getByRole('button', { name: 'Continuar na próxima página' }));
    await waitFor(() => expect(session.getSnapshot().document.pages[1].objects.some((object) => object.type === 'table')).toBe(true));
    expect(textAt(session, 1, 0)).toBe('Parâmetro');
  });
});
