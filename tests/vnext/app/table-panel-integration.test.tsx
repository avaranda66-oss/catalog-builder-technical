import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createDocumentSession, projectEditableRichText, type DocumentSession } from '@/vnext/application';
import { createNewTableModel, createTableInsertSpec, createW2CDemoDocument, NEW_TABLE_PRESET_ID } from '@/vnext/app/editor-defaults';
import { completeNewTableLook } from '@/vnext/app/editor/table-structure-actions';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { CatalogDocument, TableObject } from '@/vnext/domain';

/**
 * Onda 2 · 2D in the real editor (simple mode): one table panel — "Estilo", "Estrutura", "Notas" — wired to the
 * session. FR-33 presets and notes are one Desfazer each; FR-34 rows come from the selected cell or range and
 * "Excluir 5 linhas" is one Desfazer.
 */

afterEach(cleanup);
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
});

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function emptyPageSession(): DocumentSession {
  const base = createW2CDemoDocument(ids('doc'));
  const document: CatalogDocument = { ...base, pages: [{ ...base.pages[0], objects: [] }] };
  return createDocumentSession(document, { createId: ids('generated') });
}

/** A catalog page with only an 8 × 3 table made as the editor makes it (whole "Especificações" look, header row). */
function sessionWithTable(): { session: DocumentSession; objectId: string } {
  const session = emptyPageSession();
  const document = session.getSnapshot().document;
  const page = document.pages[0];
  const result = session.execute(
    { type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, createNewTableModel({ rows: 8, columns: 3 }), document.style) },
    { transactionId: 'new-table' }
  );
  if (!result.ok) throw new Error('Could not insert the table');
  const objectId = result.metadata.createdIds[0];
  completeNewTableLook(session, { pageId: page.id, objectId }, NEW_TABLE_PRESET_ID, 'new-table');
  return { session, objectId };
}

function tableOf(session: DocumentSession, objectId: string): TableObject {
  const object = session.getSnapshot().document.pages.flatMap((page) => page.objects).find((entry) => entry.id === objectId);
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return object;
}

function enableMeasurement() {
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
  return () => {
    computedStyle.mockRestore();
    HTMLImageElement.prototype.decode = originalDecode;
    Range.prototype.getClientRects = originalRects;
  };
}

function selectTable(container: HTMLElement, objectId: string) {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (page) page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${objectId}"]`);
  if (!hit) throw new Error('Missing table hit target');
  fireEvent.pointerDown(hit, { pointerId: 81, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId: 81, button: 0, clientX: 100, clientY: 100 });
}

async function enterGrid(container: HTMLElement) {
  const shell = container.querySelector<HTMLElement>('[data-vnext-shell]')!;
  await waitFor(() => {
    if (shell.getAttribute('data-editor-mode') !== 'table-grid') fireEvent.click(screen.getByRole('button', { name: 'Editar tabela' }));
    expect(shell).toHaveAttribute('data-editor-mode', 'table-grid');
  }, { timeout: 15_000 });
  return container.querySelector<HTMLElement>('[data-table-grid-overlay]')!;
}

const panel = () => screen.getByRole('complementary', { name: 'Propriedades do objeto' });
const status = (container: HTMLElement) => container.querySelector('[role="status"]');
const undo = (container: HTMLElement) => fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);

// The whole editor renders in jsdom: under the full suite in parallel one test can take more than the 5 s default.
describe('FR-34 rows from the selected cell or range, in the real editor', { timeout: 20_000 }, () => {
  it('"Linha abaixo" goes under the selected cell; "Excluir 5 linhas" removes a range at once and one Desfazer brings it back', async () => {
    const { session, objectId } = sessionWithTable();
    const restore = enableMeasurement();
    try {
      const { container } = render(<VNextApp session={session} simpleByDefault />);
      selectTable(container, objectId);
      const overlay = await enterGrid(container);
      const structure = within(panel()).getByRole('region', { name: 'Estrutura' });

      // From the first cell, two rows down: row 3 of the table.
      fireEvent.keyDown(overlay, { key: 'ArrowDown' });
      fireEvent.keyDown(overlay, { key: 'ArrowDown' });
      const original = session.getSnapshot().document;
      const before = tableOf(session, objectId).table;
      fireEvent.click(within(structure).getByRole('button', { name: 'Linha abaixo' }));
      const inserted = tableOf(session, objectId).table;
      expect(inserted.rows).toHaveLength(9);
      const newRow = inserted.rows[3];
      expect(before.rows.some((row) => row.id === newRow.id)).toBe(false);
      expect(newRow.role).toBe('body');
      expect(status(container)).toHaveTextContent('Linha inserida.');
      // The new cell is selected, ready to be typed in.
      expect(within(panel()).getByText('1 célula selecionada.')).toBeInTheDocument();

      // A range of five rows (Shift+↓ four times) is removed at once.
      const grid = () => container.querySelector<HTMLElement>('[data-table-grid-overlay]')!;
      // The grid comes back once the taller table is measured again.
      await waitFor(() => expect(grid()).toBeTruthy(), { timeout: 5_000 });
      expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-editor-mode', 'table-grid');
      for (let index = 0; index < 4; index += 1) fireEvent.keyDown(grid(), { key: 'ArrowDown', shiftKey: true });
      expect(within(structure).getByRole('button', { name: /^Excluir (linha|\d+ linhas)$/ })).toHaveTextContent('Excluir 5 linhas');
      const beforeRemoval = session.getSnapshot().document;
      fireEvent.click(within(structure).getByRole('button', { name: 'Excluir 5 linhas' }));
      const removed = tableOf(session, objectId).table;
      expect(removed.rows).toHaveLength(4);
      expect(removed.rows.some((row) => row.id === newRow.id)).toBe(false);
      expect(status(container)).toHaveTextContent('5 linhas excluídas. Para voltar, use Desfazer.');

      undo(container);
      expect(session.getSnapshot().document).toEqual(beforeRemoval);
      // The new row and the frame that grew for it (when it did) go away with one Desfazer.
      undo(container);
      expect(session.getSnapshot().document).toEqual(original);
    } finally {
      restore();
    }
  });

  it('the last row stays: removing every row is refused with the reason on the button', async () => {
    const { session, objectId } = sessionWithTable();
    const restore = enableMeasurement();
    try {
      const { container } = render(<VNextApp session={session} simpleByDefault />);
      selectTable(container, objectId);
      const overlay = await enterGrid(container);
      for (let index = 0; index < 7; index += 1) fireEvent.keyDown(overlay, { key: 'ArrowDown', shiftKey: true });
      const structure = within(panel()).getByRole('region', { name: 'Estrutura' });
      const remove = within(structure).getByRole('button', { name: 'Excluir 8 linhas' });
      expect(remove).toBeDisabled();
      expect(remove).toHaveAttribute('title', 'A tabela precisa de pelo menos uma linha.');
    } finally {
      restore();
    }
  });
});

describe('FR-33 presets by task and one-click notes, in the real editor', { timeout: 20_000 }, () => {
  it('"Tabela" creates a table with the whole "Especificações" look, shown as such, and one Desfazer removes it', async () => {
    const session = emptyPageSession();
    const restore = enableMeasurement();
    try {
      const { container } = render(<VNextApp session={session} simpleByDefault />);
      const before = session.getSnapshot().document;
      fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="add-table"]')!);
      const object = session.getSnapshot().document.pages[0].objects.find((entry): entry is TableObject => entry.type === 'table');
      if (!object) throw new Error('Missing new table');
      expect(object.table.columns[0].width).toEqual({ mode: 'fixed', mm: 68 });
      const gallery = within(panel()).getByRole('group', { name: 'Estilos prontos' });
      expect(within(gallery).getByRole('button', { name: /^Especificações/ })).toHaveAttribute('aria-pressed', 'true');
      expect(within(panel()).getByRole('checkbox', { name: 'Primeira coluna destacada' })).toBeChecked();
      expect(within(panel()).getByRole('checkbox', { name: 'Cabeçalho' })).toBeChecked();
      expect(within(panel()).getByRole('checkbox', { name: 'Linhas alternadas' })).not.toBeChecked();
      // The measured "Ajustar altura" may join the same step; one Desfazer still removes everything.
      await waitFor(() => expect(container.querySelector('[data-table-auto-fit]')).toBeNull(), { timeout: 5_000 });
      undo(container);
      expect(session.getSnapshot().document).toEqual(before);
    } finally {
      restore();
    }
  });

  it('"Comparativo de modelos" changes the look in one Desfazer', () => {
    const { session, objectId } = sessionWithTable();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    selectTable(container, objectId);
    const before = session.getSnapshot().document;
    const gallery = within(panel()).getByRole('group', { name: 'Estilos prontos' });
    expect(within(gallery).getByRole('button', { name: /^Especificações/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(gallery).getByRole('button', { name: /^Comparativo de modelos/ }));
    expect(within(gallery).getByRole('button', { name: /^Comparativo de modelos/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel()).getByRole('checkbox', { name: 'Linhas alternadas' })).toBeChecked();
    expect(within(panel()).getByRole('checkbox', { name: 'Primeira coluna destacada' })).toBeChecked();
    expect(status(container)).toHaveTextContent('Estilo "Comparativo de modelos" aplicado. Para voltar, use Desfazer.');

    undo(container);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('"Adicionar nota" puts a note under the table, ready to be typed over, and Desfazer removes it', () => {
    const { session, objectId } = sessionWithTable();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    selectTable(container, objectId);
    const before = session.getSnapshot().document;
    fireEvent.click(within(panel()).getByRole('button', { name: 'Adicionar nota' }));
    const note = within(panel()).getByRole('textbox', { name: 'Nota 1' });
    expect(note).toHaveValue('A COMPLETAR');
    expect(note).toHaveFocus();
    fireEvent.change(note, { target: { value: 'Valores medidos a 20 °C.' } });
    fireEvent.blur(note);
    const [annotation] = tableOf(session, objectId).table.annotations;
    expect(projectEditableRichText(annotation.text)).toBe('Valores medidos a 20 °C.');
    undo(container);
    undo(container);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('shows about twenty controls for a selected table in the simple mode, without the duplicated blocks', () => {
    const { session, objectId } = sessionWithTable();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    selectTable(container, objectId);
    expect(panel().querySelectorAll('button, input, select, textarea').length).toBeLessThanOrEqual(22);
    expect(visibleControls(panel()).length).toBeLessThanOrEqual(20);
    expect(within(panel()).queryByText('Propriedades da seleção')).toBeNull();
    expect(within(panel()).queryByText(/Padding|HEX|RichText|Misto/)).toBeNull();
    expect(panel().textContent).not.toMatch(FORBIDDEN_TABLE_WORDS);
    expect(within(panel()).getAllByRole('button', { name: 'Notas e legenda' })).toHaveLength(1);
  });

  it('keeps the panel short while a cell is selected in the grid, and the bar above the page to four buttons', async () => {
    const { session, objectId } = sessionWithTable();
    const restore = enableMeasurement();
    try {
      const { container } = render(<VNextApp session={session} simpleByDefault />);
      selectTable(container, objectId);
      await enterGrid(container);
      const controls = visibleControls(panel());
      // Grid mode adds the selected cells and "Estrutura" (6 buttons): 26 controls today, with the folded parts closed
      // (4 of them are the table title). Recorded for the FR-33 gate; select mode stays at about 20 (test above).
      expect(controls.length).toBeLessThanOrEqual(GRID_MODE_PANEL_CONTROLS);
      // FR-20: none of the internal words the father would not know.
      expect(panel().textContent).not.toMatch(FORBIDDEN_TABLE_WORDS);
      const bar = container.querySelector<HTMLElement>('[data-table-axis-toolbar]')!;
      expect(Array.from(bar.querySelectorAll('button, input')).map((control) => control.textContent?.trim())).toEqual([
        'Opções da tabela', 'Copiar', 'Colar', 'Voltar ao objeto',
      ]);
    } finally {
      restore();
    }
  });

  it('writes "Conclua a edição da célula" as the last line of the bar, so the click that ends the cell lands on its button', async () => {
    // W4.C proof (21/10): the reason sat between "Colunas" and "Desmesclar células"; the click on "Desmesclar" first
    // finished the cell, the reason vanished, the button jumped 62 px up and the click was lost.
    const { session, objectId } = sessionWithTable();
    const restore = enableMeasurement();
    try {
      const { container } = render(<VNextApp session={session} simpleByDefault />);
      selectTable(container, objectId);
      await enterGrid(container);
      const bar = container.querySelector<HTMLElement>('[data-table-axis-toolbar]')!;
      fireEvent.click(within(bar).getByRole('button', { name: 'Opções da tabela' }));
      const controlsOf = () => Array.from(bar.querySelectorAll<HTMLElement>('button, input'))
        .map((control) => control.getAttribute('data-editor-action') ?? control.getAttribute('aria-label'));
      const gridControls = controlsOf();
      expect(gridControls).toContain('unmerge-cell');
      expect(gridControls).toContain('leave-table-grid');

      fireEvent.keyDown(screen.getByRole('grid', { name: 'Grade da tabela' }), { key: 'F2' });
      await waitFor(() => expect(container.querySelector('[data-cell-edit-session]')).not.toBeNull());
      const note = bar.querySelector<HTMLElement>('[data-table-axis-note]');
      expect(note?.textContent).toContain('Conclua a edição da célula antes de mudar linhas e colunas.');
      expect(bar.lastElementChild).toBe(note);
      for (const control of bar.querySelectorAll('button, input')) {
        expect(note!.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      }
      expect(controlsOf()).toEqual(gridControls);
      expect(bar.querySelector('[data-editor-action="remove-row"]')).toHaveAttribute('aria-describedby', note!.id);
    } finally {
      restore();
    }
  });
});

/**
 * Controls a person sees in the panel: not hidden, not folded inside a closed "details" (its summary stays visible)
 * and not the "Localizar" of each problem listed for the table (that list depends on the content, not on the panel).
 */
function visibleControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, input, select, textarea')).filter((control) => {
    if (control.closest('[hidden], [data-editor-diagnostics] li') || (control instanceof HTMLInputElement && control.type === 'hidden')) return false;
    const folded = control.closest('details:not([open])');
    return !folded || Boolean(control.closest('summary'));
  });
}

/** FR-20: words of the code, not of the father (the Onda 5 sweep extends this list to the whole editor). */
const FORBIDDEN_TABLE_WORDS = /\b(?:padding|hex|richtext|misto|tsv|inspector|gesto|eixos?)\b|\(s\)|superfícies semânticas|peso flexível/i;

/** Recorded for the FR-33 gate: the most controls the table panel shows in grid mode by default. */
const GRID_MODE_PANEL_CONTROLS = 26;
