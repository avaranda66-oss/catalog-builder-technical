import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainRichText, type CellContent } from '@/vnext/domain';
import { TableCellEditorSection, type TableCellEditorSectionProps } from '@/vnext/app/editor/TableCellEditorSection';
import { createTableCellDraft } from '@/vnext/editor/table-cell-draft';

/**
 * FR-30 (slice 2A): the side panel of a cell edit. The value is typed in the cell; "Tipo de conteúdo", "Código
 * técnico" and "Medição" sit under "Avançado", closed in the simple mode unless the cell already holds a code or a
 * measurement.
 */

afterEach(cleanup);

function props(content: CellContent, overrides: Partial<TableCellEditorSectionProps> = {}): TableCellEditorSectionProps {
  const draft = createTableCellDraft({ pageId: 'p', objectId: 'o', tableId: 't', cellId: 'c' }, content);
  return {
    cellDraft: draft,
    cellDraftRef: { current: draft },
    cellEditorFieldRef: { current: null },
    simple: true,
    notifyCellDraftChanged: vi.fn(),
    commitCellEdit: vi.fn(),
    cancelCellEdit: vi.fn(),
    ...overrides,
  };
}

describe('TableCellEditorSection after FR-30', () => {
  it('a text cell in the simple mode shows the hint, the buttons and a closed "Avançado"', () => {
    render(<TableCellEditorSection {...props({ type: 'richText', value: plainRichText('r', 'Faixa') })} />);
    expect(screen.getByText('Digite direto na célula da tabela. Enter salva e desce; Tab vai para a direita; Esc cancela.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Tipo de conteúdo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const advanced = screen.getByRole('button', { name: 'Avançado' });
    expect(advanced).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();

    fireEvent.click(advanced);
    expect(screen.getByRole('button', { name: 'Ocultar Avançado' })).toHaveAttribute('aria-expanded', 'true');
    const type = screen.getByRole('combobox', { name: 'Tipo de conteúdo' });
    expect(within(type).getAllByRole('option').map((option) => option.textContent)).toEqual(['Texto', 'Código técnico', 'Medição', 'Vazio']);
    expect(type).toHaveValue('richText');
  });

  it('an empty cell opens as "Texto", never as "Vazio"', () => {
    render(<TableCellEditorSection {...props({ type: 'empty' })} />);
    expect(screen.queryByText('A célula ficará vazia.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Avançado' }));
    expect(screen.getByRole('combobox', { name: 'Tipo de conteúdo' })).toHaveValue('richText');
  });

  it('a code or a measurement opens "Avançado" with its fields; it can still be closed', () => {
    render(<TableCellEditorSection {...props({ type: 'technicalCode', value: 'TA-25N' })} />);
    expect(screen.getByRole('combobox', { name: 'Tipo de conteúdo' })).toHaveValue('technicalCode');
    expect(screen.getByRole('textbox', { name: 'Código' })).toHaveValue('TA-25N');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Avançado' }));
    expect(screen.queryByRole('textbox', { name: 'Código' })).not.toBeInTheDocument();
    cleanup();
    render(<TableCellEditorSection {...props({ type: 'measurement', valueText: '12', unit: 'mm' })} />);
    expect(screen.getByRole('textbox', { name: 'Valor' })).toHaveValue('12');
    expect(screen.getByRole('textbox', { name: 'Unidade' })).toHaveValue('mm');
  });

  it('outside the simple mode "Avançado" starts open', () => {
    render(<TableCellEditorSection {...props({ type: 'richText', value: plainRichText('r', 'A') }, { simple: false })} />);
    expect(screen.getByRole('combobox', { name: 'Tipo de conteúdo' })).toBeInTheDocument();
  });

  it('leaves the focus to the editor inside the cell when it is on screen', () => {
    const inline = document.createElement('textarea');
    document.body.append(inline);
    const fieldRef: TableCellEditorSectionProps['cellEditorFieldRef'] = { current: inline };
    render(<TableCellEditorSection {...props({ type: 'technicalCode', value: 'A' }, { cellEditorFieldRef: fieldRef })} />);
    expect(fieldRef.current).toBe(inline);
    inline.remove();
    cleanup();
    const detached: TableCellEditorSectionProps['cellEditorFieldRef'] = { current: inline };
    render(<TableCellEditorSection {...props({ type: 'technicalCode', value: 'A' }, { cellEditorFieldRef: detached })} />);
    expect(detached.current).toBe(screen.getByRole('textbox', { name: 'Código' }));
  });

  it('marks and images stay read-only with the type shown but disabled', () => {
    render(<TableCellEditorSection {...props({ type: 'marker', legendEntryId: 'l' })} />);
    expect(screen.queryByRole('button', { name: 'Avançado' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo de conteúdo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeDisabled();
    expect(screen.queryByText(/Digite direto na célula/)).not.toBeInTheDocument();
  });
});
