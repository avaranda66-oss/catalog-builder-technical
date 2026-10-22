import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TableGridToolbar, type TableGridToolbarProps } from '@/vnext/app/editor/TableGridToolbar';

afterEach(cleanup);

const LAST_ROW = 'A tabela precisa de pelo menos uma linha.';

function props(overrides: Partial<TableGridToolbarProps> = {}): TableGridToolbarProps {
  return {
    simple: false,
    mode: 'table-grid',
    tableSelection: null,
    tableOptionsOpen: false,
    setTableOptionsOpen: vi.fn(),
    runTableAxisInsert: vi.fn(),
    runTableAxisRemove: vi.fn(),
    tableRowsToInsert: '1',
    setTableRowsToInsert: vi.fn(),
    currentMergeEligibility: { enabled: false },
    currentUnmergeEligibility: { enabled: false },
    runTableMerge: vi.fn(),
    runTableUnmerge: vi.fn(),
    tableRangeExtensionArmed: false,
    toggleTableRangeExtension: vi.fn(),
    runTableBulkClear: vi.fn(),
    setMarkerPanelOpen: vi.fn(),
    runVisibleTableCopy: vi.fn(),
    setTablePasteFallbackOpen: vi.fn(),
    leaveTableGrid: vi.fn(),
    ...overrides,
  };
}

const bar = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-table-axis-toolbar]')!;
const slot = (container: HTMLElement) => container.querySelector<HTMLElement>('.vnext-table-axis-note')!;

describe('table grid bar: the reason line does not move the page', () => {
  it('keeps the same last line, empty, before the reason appears and after it goes away', () => {
    const { container, rerender } = render(<TableGridToolbar {...props()} />);
    const line = slot(container);
    expect(line).not.toBeNull();
    expect(line.textContent).toBe('');
    expect(line).not.toHaveAttribute('data-table-axis-note');
    expect(bar(container).lastElementChild).toBe(line);
    const lines = bar(container).children.length;

    // The first click selects every row: the reason is written in the line that was already there.
    rerender(<TableGridToolbar {...props({ removeRowReason: LAST_ROW })} />);
    expect(slot(container)).toBe(line);
    expect(line.textContent).toBe(LAST_ROW);
    expect(line).toHaveAttribute('data-table-axis-note');
    expect(bar(container).children).toHaveLength(lines);
    expect(bar(container).lastElementChild).toBe(line);
    expect(bar(container).querySelector('[data-editor-action="remove-row"]')).toHaveAttribute('aria-describedby', line.id);

    // Another click removes it: the line stays, empty, and no button is described by it any more.
    rerender(<TableGridToolbar {...props()} />);
    expect(slot(container)).toBe(line);
    expect(line.textContent).toBe('');
    expect(line).not.toHaveAttribute('data-table-axis-note');
    expect(bar(container).children).toHaveLength(lines);
    expect(bar(container).querySelector('[data-editor-action="remove-row"]')).not.toHaveAttribute('aria-describedby');
  });

  it('also keeps the line while a cell is being edited', () => {
    const { container, rerender } = render(<TableGridToolbar {...props()} />);
    const line = slot(container);
    rerender(<TableGridToolbar {...props({ mode: 'cell-edit' })} />);
    expect(slot(container)).toBe(line);
    expect(line.textContent).toBe('Conclua a edição da célula antes de mudar linhas e colunas.');
    rerender(<TableGridToolbar {...props()} />);
    expect(slot(container)).toBe(line);
    expect(line.textContent).toBe('');
  });

  it('in the simple bar the line exists only with "Opções da tabela" open, where the buttons it describes are', () => {
    const { container, rerender } = render(<TableGridToolbar {...props({ simple: true })} />);
    expect(slot(container)).toBeNull();
    rerender(<TableGridToolbar {...props({ simple: true, tableOptionsOpen: true, removeRowReason: LAST_ROW })} />);
    expect(slot(container).textContent).toBe(LAST_ROW);
  });

  it('the stylesheet keeps one line of height for the empty line', () => {
    const css = readFileSync(resolve(__dirname, '../../../src/vnext/app/styles.css'), 'utf8');
    const rule = css.split('\n').find((line) => line.startsWith('.vnext-table-axis-toolbar > .vnext-table-axis-note {'));
    expect(rule).toBeDefined();
    expect(rule).toMatch(/min-height:\s*1\.5em/);
    expect(rule).toMatch(/line-height:\s*1\.5/);
    expect(rule).toMatch(/flex:\s*0 0 100%/);
  });
});
