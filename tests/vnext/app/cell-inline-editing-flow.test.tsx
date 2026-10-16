import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, projectEditableRichText, type DocumentSession } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument, type CellContent, type TableModel, type TableObject } from '@/vnext/domain';
import type { VNextPersistenceRuntime } from '@/vnext/persistence';
import { createW4BTableDocument, W4B_OBJECT_ID } from '../proof/fixtures/w4b-table-document';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
} from '../persistence/w3h-fixtures';
import { emptyTable } from '../proof/test-data';

/**
 * FR-30, FR-34 and FR-22 in the real editor the father uses (simple mode), slice 2A:
 * fill a table only with the keyboard, typing inside the cells; "+" and the right-click menu; opening a cell
 * without typing is not an unsaved change.
 */

let restoreMeasurement: (() => void) | undefined;

beforeEach(() => {
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
  // jsdom has no layout: let the editor measure the table (same set-up as the other table-grid tests).
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
});

afterEach(() => {
  cleanup();
  restoreMeasurement?.();
  restoreMeasurement = undefined;
});

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

/** The W4.B catalog with its table replaced by a plain one (header row + empty body). */
function plainTableDocument(rows = 2, columns = 3): CatalogDocument {
  const base = createW4BTableDocument();
  const plain = emptyTable(rows, columns);
  const table: TableModel = { ...plain, id: 'w4b-table', style: (base.pages[0].objects.find((entry) => entry.type === 'table') as TableObject).table.style };
  return {
    ...base,
    pages: base.pages.map((page, index) => index !== 0 ? page : {
      ...page,
      objects: page.objects.map((object) => (object.id === W4B_OBJECT_ID && object.type === 'table' ? { ...object, table } : object)),
    }),
  };
}

function liveTable(session: DocumentSession): TableModel {
  const object = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === W4B_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return object.table;
}

function contentAt(session: DocumentSession, rowIndex: number, columnIndex: number): CellContent | undefined {
  const table = liveTable(session);
  return table.cells.find((cell) => cell.rowId === table.rows[rowIndex].id && cell.columnId === table.columns[columnIndex].id)?.content;
}

function textAt(session: DocumentSession, rowIndex: number, columnIndex: number): string | null {
  const content = contentAt(session, rowIndex, columnIndex);
  if (!content || content.type === 'empty') return null;
  return content.type === 'richText' ? projectEditableRichText(content.value) : `[${content.type}]`;
}

async function openTableGrid(container: HTMLElement): Promise<HTMLElement> {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${W4B_OBJECT_ID}"]`);
  if (!hit) throw new Error('Missing table hit target');
  fireEvent.pointerDown(hit, { pointerId: 81, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId: 81, button: 0, clientX: 100, clientY: 100 });
  const shell = container.querySelector<HTMLElement>('[data-vnext-shell]')!;
  await waitFor(() => {
    if (shell.getAttribute('data-editor-mode') !== 'table-grid') fireEvent.click(screen.getByRole('button', { name: 'Editar tabela' }));
    expect(shell).toHaveAttribute('data-editor-mode', 'table-grid');
  }, { timeout: 3_000 });
  return screen.getByRole('grid', { name: 'Grade da tabela' });
}

const cellEditor = () => screen.getByRole('textbox', { name: /^Conteúdo da célula, / });
const flushMicrotasks = () => act(async () => { await Promise.resolve(); });
/** After a row is added or removed the grid stays on screen and keeps the focus, before the table is measured again. */
const gridKeepsFocus = async () => {
  await flushMicrotasks();
  expect(screen.getByRole('grid', { name: 'Grade da tabela' })).toHaveFocus();
};

describe('FR-30 · fill a table only with the keyboard, typing inside the cells', () => {
  it('types, Enter goes down, Tab goes right, Esc cancels, Tab on the last cell adds a row', async () => {
    const session = createDocumentSession(plainTableDocument(2, 3), { createId: ids('generated') });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    expect(document.activeElement).toBe(grid);

    // A key on the selected cell opens the editor inside the cell with that key.
    fireEvent.keyDown(grid, { key: 'P' });
    expect(cellEditor()).toHaveAccessibleName('Conteúdo da célula, linha 1, coluna 1');
    expect(cellEditor()).toHaveValue('P');
    expect(container.querySelector('[data-cell-inline-anchor]')).not.toBeNull();
    // The content type is not in the way: it lives in the side panel, under "Avançado", closed.
    expect(screen.queryByRole('combobox', { name: 'Tipo de conteúdo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avançado' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(cellEditor(), { target: { value: 'Pressão' } });
    fireEvent.keyDown(cellEditor(), { key: 'Enter' });
    await flushMicrotasks();
    expect(textAt(session, 0, 0)).toBe('Pressão');
    expect(screen.queryByRole('textbox', { name: /^Conteúdo da célula, / })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('grid', { name: 'Grade da tabela' }));

    // Enter went down: the next key edits row 2, column 1.
    fireEvent.keyDown(document.activeElement!, { key: '1' });
    expect(cellEditor()).toHaveAccessibleName('Conteúdo da célula, linha 2, coluna 1');
    fireEvent.change(cellEditor(), { target: { value: '10 bar' } });
    fireEvent.keyDown(cellEditor(), { key: 'Tab' });
    await flushMicrotasks();
    expect(textAt(session, 1, 0)).toBe('10 bar');

    // Tab went right; Esc forgets only what was typed in this edit.
    fireEvent.keyDown(document.activeElement!, { key: 'x' });
    expect(cellEditor()).toHaveAccessibleName('Conteúdo da célula, linha 2, coluna 2');
    fireEvent.keyDown(cellEditor(), { key: 'Escape' });
    await flushMicrotasks();
    expect(textAt(session, 1, 1)).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^Conteúdo da célula, / })).not.toBeInTheDocument();

    // F2 edits keeping the content; an empty cell starts as text, never as "Vazio".
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'F2' });
    expect(cellEditor()).toHaveAccessibleName('Conteúdo da célula, linha 2, coluna 3');
    expect(cellEditor()).toHaveValue('');
    fireEvent.change(cellEditor(), { target: { value: '±0,5 %' } });
    fireEvent.keyDown(cellEditor(), { key: 'Tab' });
    await flushMicrotasks();
    expect(textAt(session, 1, 2)).toBe('±0,5 %');
    expect(liveTable(session).rows).toHaveLength(3);
    expect(screen.getByText('Linha adicionada no fim da tabela.')).toBeInTheDocument();
    await gridKeepsFocus();

    // The new row is ready: the next key edits its first cell.
    fireEvent.keyDown(document.activeElement!, { key: 'Z' });
    expect(cellEditor()).toHaveAccessibleName('Conteúdo da célula, linha 3, coluna 1');
    fireEvent.keyDown(cellEditor(), { key: 'Escape' });
    await flushMicrotasks();

    // One Desfazer takes the added row away; the typed values stay.
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(liveTable(session).rows).toHaveLength(2);
    expect(textAt(session, 1, 2)).toBe('±0,5 %');
  });

  it('the symbol bar types technical symbols where the caret is; Alt+Enter breaks the line', async () => {
    const session = createDocumentSession(plainTableDocument(2, 2), { createId: ids('generated') });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'F2' });
    fireEvent.change(cellEditor(), { target: { value: '25 C' } });
    (cellEditor() as HTMLTextAreaElement).setSelectionRange(3, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Inserir ±' }));
    expect(cellEditor()).toHaveValue('25 ±C');
    fireEvent.keyDown(cellEditor(), { key: 'Enter', altKey: true });
    expect((cellEditor() as HTMLTextAreaElement).value).toContain('\n');
    fireEvent.keyDown(cellEditor(), { key: 'Enter' });
    await flushMicrotasks();
    expect(textAt(session, 0, 0)).toMatch(/^25 ±\n?C$|^25 ±C\n$/);
  });

  it('clicking another cell while typing saves the cell and moves there', async () => {
    const session = createDocumentSession(plainTableDocument(2, 2), { createId: ids('generated') });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const grid = await openTableGrid(container);
    fireEvent.keyDown(grid, { key: 'A' });
    const other = container.querySelector<HTMLElement>('[data-table-cell="1:1"]')!;
    fireEvent.pointerDown(other, { pointerId: 9, button: 0, clientX: 10, clientY: 10 });
    await flushMicrotasks();
    expect(textAt(session, 0, 0)).toBe('A');
    fireEvent.keyDown(document.activeElement!, { key: 'B' });
    expect(cellEditor()).toHaveAccessibleName('Conteúdo da célula, linha 2, coluna 2');
  });
});

describe('FR-34 · "+" and the right-click menu in the real editor', () => {
  it('"+" inserts a row below; the menu deletes the 2 selected rows and one Desfazer restores them', async () => {
    const session = createDocumentSession(plainTableDocument(4, 2), { createId: ids('generated') });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    await openTableGrid(container);

    fireEvent.click(screen.getByRole('button', { name: 'Inserir linha abaixo da linha 1' }));
    expect(liveTable(session).rows.map((row) => row.id)).toEqual(['r0', expect.any(String), 'r1', 'r2', 'r3']);
    expect(screen.getByText('Linha inserida abaixo.')).toBeInTheDocument();
    await gridKeepsFocus();

    const cellAt = (row: number, column: number) => container.querySelector<HTMLElement>(`[data-table-cell="${row}:${column}"]`)!;
    fireEvent.pointerDown(cellAt(2, 0), { pointerId: 11, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(cellAt(2, 0), { pointerId: 11, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerDown(cellAt(3, 1), { pointerId: 12, button: 0, shiftKey: true, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(cellAt(3, 1), { pointerId: 12, button: 0, clientX: 5, clientY: 5 });
    fireEvent.contextMenu(cellAt(3, 0), { clientX: 50, clientY: 50 });
    const menu = screen.getByRole('menu', { name: 'Ações da tabela' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir 2 linhas' }));
    expect(liveTable(session).rows.map((row) => row.id)).toEqual(['r0', expect.any(String), 'r3']);
    expect(screen.getByText('2 linhas excluídas. Para voltar, use Desfazer.')).toBeInTheDocument();
    await gridKeepsFocus();

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(liveTable(session).rows.map((row) => row.id)).toEqual(['r0', expect.any(String), 'r1', 'r2', 'r3']);
  });

  it('the menu inserts a column to the left of the right-clicked cell', async () => {
    const session = createDocumentSession(plainTableDocument(2, 2), { createId: ids('generated') });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    await openTableGrid(container);
    fireEvent.contextMenu(container.querySelector<HTMLElement>('[data-table-cell="0:1"]')!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Inserir coluna à esquerda' }));
    const columns = liveTable(session).columns.map((column) => column.id);
    expect(columns).toHaveLength(3);
    expect([columns[0], columns[2]]).toEqual(['c0', 'c1']);
    expect(screen.getByText('Coluna inserida à esquerda.')).toBeInTheDocument();
  });
});

describe('FR-22 · opening a cell without typing is not an unsaved change', () => {
  async function dispose(runtime: VNextPersistenceRuntime) {
    await act(async () => { await runtime.dispose(); });
  }

  it('the save state stays clean while the cell is open unchanged, and follows the typed value', async () => {
    const document = createW4BTableDocument();
    const repository = new StrictCasCatalogRepository(document);
    const active = runtimeFixture(repository, document, 14200, { autosave: false });
    const { container } = render(<VNextApp runtime={active.runtime} simpleByDefault />);
    const grid = await openTableGrid(container);
    const barrier = active.runtime.workspace.getAuthoringBarrier();
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(false);

    fireEvent.keyDown(grid, { key: 'F2' });
    expect(cellEditor()).toHaveValue('Texto inicial');
    expect(barrier.hasPendingDraft()).toBe(false);
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(false);
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();

    fireEvent.change(cellEditor(), { target: { value: 'Texto inicial 2' } });
    expect(barrier.hasPendingDraft()).toBe(true);
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(true);
    expect(await screen.findAllByText('Alterações não salvas')).not.toHaveLength(0);

    fireEvent.change(cellEditor(), { target: { value: 'Texto inicial' } });
    expect(barrier.hasPendingDraft()).toBe(false);
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(false);

    fireEvent.keyDown(cellEditor(), { key: 'Escape' });
    await dispose(active.runtime);
  });

  it('opening a text box without typing is not an unsaved change and autosave does not close it', async () => {
    const base = documentFixture();
    const document: CatalogDocument = {
      ...base,
      pages: [{
        ...base.pages[0],
        objects: [{
          id: 'text-target', type: 'text', frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 }, zIndex: 0,
          text: plainRichText('text-local', 'Modelo'),
          style: { fontFamily: 'Noto Sans', fontSizePt: 12, lineHeight: 1.2, fontWeight: 700, color: '#172033', textAlign: 'left' },
        }],
      }],
    };
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 14300, { autosaveClock: clock, debounceMs: 25 });
    const { container } = render(<VNextApp runtime={active.runtime} simpleByDefault />);
    const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
    page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 44, button: 0, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(hit, { pointerId: 44, button: 0, clientX: 80, clientY: 80 });
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="edit-text"]')!);
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    expect(textarea).toHaveValue('Modelo');
    const barrier = active.runtime.workspace.getAuthoringBarrier();
    expect(barrier.hasPendingDraft()).toBe(false);
    expect(barrier.captureRecoveryOverlay?.()).toBeUndefined();
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(false);
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();

    // A change made before (here, the title) is saved while the text box stays open and untouched.
    act(() => { expect(active.session.execute({ type: 'document.rename', title: 'Catálogo novo' }).ok).toBe(true); });
    await act(async () => {
      clock.advanceBy(100);
      await settleAsyncWork(4);
      await active.runtime.saveCoordinator.waitForActiveSave();
    });
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-text-edit-textarea]')).not.toBeNull();

    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Modelo TA-25N' } });
    expect(barrier.hasPendingDraft()).toBe(true);
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(true);
    expect(await screen.findAllByText('Alterações não salvas')).not.toHaveLength(0);
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Modelo' } });
    expect(barrier.hasPendingDraft()).toBe(false);
    await dispose(active.runtime);
  });
});
