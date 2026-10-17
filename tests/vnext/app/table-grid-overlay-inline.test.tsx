import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePlans } from '@/vnext/rendering';
import { mmToU } from '@/vnext/domain';
import { TableGridOverlay } from '@/vnext/app/table-grid-overlay';
import type { CellInlineEditorCell } from '@/vnext/app/editor/CellInlineEditor';
import type { TableGridCommand } from '@/vnext/editor/table-grid-commands';
import {
  tableCellSelection,
  tableRowSelection,
  tableSelectionIdentity,
  type TableSelection,
} from '@/vnext/editor/table-selection';
import { createW4ATableDocument, W4A_OBJECT_ID, W4A_PAGE_ID, W4A_TABLE_ID } from '../proof/fixtures/w4a-table-document';

/**
 * FR-30 and FR-34 in the table grid (slice 2A): typing on a selected cell starts the edit, the editor sits on the
 * cell, pressing another cell while typing saves and moves, the "+" buttons and the right-click menu.
 * The W4.A table has 3 rows × 3 columns and a 2 × 2 merged cell starting at row 2, column 2.
 */

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
});

interface SetupOptions {
  editingCellId?: string;
  selection?: (identity: ReturnType<typeof tableSelectionIdentity>) => TableSelection;
  dimensionEditingEnabled?: boolean;
}

function setup(options: SetupOptions = {}) {
  const document = createW4ATableDocument();
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('Missing Table fixture');
  const table = object.table;
  const plan = compilePlans(document).plans.get(table.id)!;
  plan.rowQ = [640, 720, 800];
  plan.gridOffsetYQ = 160;
  const identity = tableSelectionIdentity(W4A_PAGE_ID, W4A_OBJECT_ID, W4A_TABLE_ID);
  const initial = options.selection?.(identity)
    ?? tableCellSelection(identity, { rowId: table.rows[0].id, columnId: table.columns[0].id });
  const changes: TableSelection[] = [];
  const onTypeToEdit = vi.fn();
  const onGridCommand = vi.fn<(command: TableGridCommand) => void>();
  const onCellPressWhileEditing = vi.fn();
  const editorCells: CellInlineEditorCell[] = [];

  function Harness() {
    const [selection, setSelection] = React.useState<TableSelection>(initial);
    return <TableGridOverlay
      table={table}
      plan={plan}
      identity={identity}
      selection={selection}
      localSequence={0}
      pageWidthU={mmToU(document.pages[0].widthMm)}
      pageHeightU={mmToU(document.pages[0].heightMm)}
      onSelectionChange={(next) => { changes.push(next); setSelection(next); }}
      onStaleGesture={vi.fn()}
      editingCellId={options.editingCellId}
      dimensionEditingEnabled={options.dimensionEditingEnabled ?? !options.editingCellId}
      onTypeToEdit={onTypeToEdit}
      onGridCommand={onGridCommand}
      onCellPressWhileEditing={onCellPressWhileEditing}
      renderCellEditor={(cell) => {
        editorCells.push(cell);
        return <textarea aria-label="Editor da célula" />;
      }}
    />;
  }
  const view = render(<Harness />);
  const grid = screen.getByRole('grid', { name: 'Grade da tabela' });
  return { ...view, grid, table, plan, identity, changes, onTypeToEdit, onGridCommand, onCellPressWhileEditing, editorCells };
}

describe('FR-30 typing on a selected cell', () => {
  it('a printable key starts the edit with that key and keeps it from reaching the page', () => {
    const { grid, onTypeToEdit } = setup();
    const event = new KeyboardEvent('keydown', { key: 'N', bubbles: true, cancelable: true });
    grid.dispatchEvent(event);
    expect(onTypeToEdit).toHaveBeenCalledWith('N');
    expect(event.defaultPrevented).toBe(true);
    fireEvent.keyDown(grid, { key: '°', ctrlKey: true, altKey: true });
    expect(onTypeToEdit).toHaveBeenLastCalledWith('°');
  });

  it('an accent key opens the editor empty and lets the browser finish the letter', () => {
    const { grid, onTypeToEdit } = setup();
    const event = new KeyboardEvent('keydown', { key: 'Dead', bubbles: true, cancelable: true });
    grid.dispatchEvent(event);
    expect(onTypeToEdit).toHaveBeenCalledWith('');
    expect(event.defaultPrevented).toBe(false);
  });

  it('shortcuts, named keys and a row selection do not start typing', () => {
    const { grid, onTypeToEdit } = setup({ selection: (identity) => tableRowSelection(identity, 'w4a-row-min') });
    fireEvent.keyDown(grid, { key: 'a' });
    expect(onTypeToEdit).not.toHaveBeenCalled();
    cleanup();
    const other = setup();
    for (const key of ['Enter', 'F2', 'Tab', 'ArrowDown', 'Delete']) fireEvent.keyDown(other.grid, { key });
    fireEvent.keyDown(other.grid, { key: 'c', ctrlKey: true });
    expect(other.onTypeToEdit).not.toHaveBeenCalled();
  });
});

describe('FR-30 the editor sits on the cell being edited', () => {
  it('is placed from the page tracks with the size of the cell', () => {
    const { container, plan, editorCells } = setup({ editingCellId: 'w4a-cell-0-2' });
    const anchor = container.querySelector<HTMLElement>('[data-cell-inline-anchor]')!;
    const left = plan.trackQ[0] + plan.trackQ[1];
    expect(anchor.style.left).toBe(`${left / 64}px`);
    expect(anchor.style.top).toBe(`${160 / 64}px`);
    expect(anchor.style.width).toBe(`${plan.trackQ[2] / 64}px`);
    expect(anchor.style.height).toBe(`${640 / 64}px`);
    expect(editorCells.at(-1)).toEqual({ widthPx: plan.trackQ[2] / 64, heightPx: 10, rowIndex: 0, columnIndex: 2 });
    expect(screen.getByRole('textbox', { name: 'Editor da célula' })).toBeInTheDocument();
  });

  it('covers the whole merged cell', () => {
    const { plan, editorCells } = setup({ editingCellId: 'w4a-cell-1-1' });
    expect(editorCells.at(-1)).toEqual({
      widthPx: (plan.trackQ[1] + plan.trackQ[2]) / 64,
      heightPx: (720 + 800) / 64,
      rowIndex: 1,
      columnIndex: 1,
    });
  });

  it('pressing another cell while typing saves and moves there instead of changing the selection', () => {
    const { container, changes, onCellPressWhileEditing, onTypeToEdit } = setup({ editingCellId: 'w4a-cell-0-0' });
    const target = container.querySelector<HTMLElement>('[data-table-cell="2:0"]')!;
    fireEvent.pointerDown(target, { pointerId: 5, button: 0, clientX: 10, clientY: 90 });
    expect(onCellPressWhileEditing).toHaveBeenCalledWith({ rowId: 'w4a-row-auto', columnId: 'w4a-column-a' });
    expect(changes).toEqual([]);
    fireEvent.keyDown(container.querySelector('[data-table-grid-overlay]')!, { key: 'x' });
    expect(onTypeToEdit).not.toHaveBeenCalled();
  });

  it('shows no "+" buttons and no menu while typing', () => {
    const { container, onGridCommand } = setup({ editingCellId: 'w4a-cell-0-0' });
    expect(container.querySelector('[data-table-insert-row-after]')).toBeNull();
    fireEvent.contextMenu(container.querySelector('[data-table-cell="0:1"]')!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onGridCommand).not.toHaveBeenCalled();
  });
});

describe('FR-34 "+" between rows and columns', () => {
  it('inserts a row below a row and a column to the right of a column', () => {
    const { onGridCommand } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Inserir linha abaixo da linha 2' }));
    expect(onGridCommand).toHaveBeenLastCalledWith({ type: 'insert', axis: 'row', position: 'after', referenceAxisId: 'w4a-row-min' });
    fireEvent.click(screen.getByRole('button', { name: 'Inserir coluna à direita da coluna 1' }));
    expect(onGridCommand).toHaveBeenLastCalledWith({ type: 'insert', axis: 'column', position: 'after', referenceAxisId: 'w4a-column-a' });
    expect(screen.getAllByRole('button', { name: /^Inserir linha abaixo/ })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^Inserir coluna à direita/ })).toHaveLength(3);
  });

  it('each "+" sits on the boundary after its row or column', () => {
    const { container, plan } = setup();
    const row = container.querySelector<HTMLElement>('[data-table-insert-row-after="0"]')!;
    expect(row.style.top).toBe(`${(160 + 640) / 64}px`);
    const column = container.querySelector<HTMLElement>('[data-table-insert-column-after="1"]')!;
    expect(column.style.left).toBe(`${(plan.trackQ[0] + plan.trackQ[1]) / 64}px`);
  });
});

describe('FR-34 right-click menu of the grid', () => {
  it('right-click on a cell selects it and offers inserting and deleting around it', () => {
    const { container, changes, onGridCommand, grid } = setup();
    fireEvent.contextMenu(container.querySelector('[data-table-cell="0:2"]')!, { clientX: 300, clientY: 40 });
    expect(changes.at(-1)).toMatchObject({ kind: 'cell', focus: { rowId: 'w4a-row-header', columnId: 'w4a-column-c' } });
    const menu = screen.getByRole('menu', { name: 'Ações da tabela' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Inserir linha acima',
      'Inserir linha abaixo',
      'Inserir coluna à esquerda',
      'Inserir coluna à direita',
      'Excluir linha',
      'Excluir coluna',
    ]);
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Inserir linha acima' }));
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inserir coluna à esquerda' }));
    expect(onGridCommand).toHaveBeenCalledWith({ type: 'insert', axis: 'column', position: 'before' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(grid).toBeInTheDocument();
  });

  it('offers "Desmesclar células" on a merged cell and sends the delete commands', () => {
    const { container, onGridCommand } = setup();
    fireEvent.contextMenu(container.querySelector('[data-table-cell="1:1"]')!);
    const menu = screen.getByRole('menu', { name: 'Ações da tabela' });
    expect(within(menu).getByRole('menuitem', { name: 'Excluir 2 linhas' })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Desmesclar células' }));
    expect(onGridCommand).toHaveBeenCalledWith({ type: 'unmerge' });
    fireEvent.contextMenu(container.querySelector('[data-table-cell="0:0"]')!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir linha' }));
    expect(onGridCommand).toHaveBeenLastCalledWith({ type: 'remove', axis: 'row' });
  });

  it('right-click on a row number keeps the row selection and offers only the row actions', () => {
    const { container, changes } = setup();
    fireEvent.contextMenu(container.querySelector('[data-table-row-selector="0"]')!);
    expect(changes.at(-1)).toMatchObject({ kind: 'rows', anchorRowId: 'w4a-row-header' });
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent);
    // Same rule as the table panel: whole rows give rows to insert next to and to delete, no column.
    expect(items).toEqual(['Inserir linha acima', 'Inserir linha abaixo', 'Excluir linha']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    // A row number selects that row only (the table panel's rule); a merged cell in the way is explained on click.
    fireEvent.contextMenu(container.querySelector('[data-table-row-selector="2"]')!);
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Excluir linha' })).toBeInTheDocument();
  });

  it('the keyboard moves through the menu, Esc closes it and gives the focus back to the grid', () => {
    const { grid } = setup();
    grid.focus();
    fireEvent.keyDown(grid, { key: 'ContextMenu' });
    const menu = screen.getByRole('menu', { name: 'Ações da tabela' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Inserir linha abaixo');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toHaveTextContent('Excluir coluna');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Inserir linha acima');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(grid);
  });

  it('Shift+F10 also opens it, and a press outside closes it without doing anything', () => {
    const { grid, onGridCommand } = setup();
    fireEvent.keyDown(grid, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onGridCommand).not.toHaveBeenCalled();
  });
});
