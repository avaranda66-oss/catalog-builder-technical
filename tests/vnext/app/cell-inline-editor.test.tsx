import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainRichText, type CellContent } from '@/vnext/domain';
import { CellInlineEditor, type CellInlineEditorCell } from '@/vnext/app/editor/CellInlineEditor';
import { resetStageZoomStore, setStageZoomChoice } from '@/vnext/app/editor/use-stage-zoom';
import { createTableCellDraft, startTableCellDraftByTyping, type TableCellDraft } from '@/vnext/editor/table-cell-draft';

/**
 * FR-30 (slice 2A): the editor drawn inside the table cell, like Excel.
 */

afterEach(() => {
  cleanup();
  try { window.localStorage.clear(); } catch { /* storage may be blocked */ }
  resetStageZoomStore();
});

const identity = { pageId: 'p', objectId: 'o', tableId: 't', cellId: 'c' };
const CELL: CellInlineEditorCell = { widthPx: 120, heightPx: 20, rowIndex: 2, columnIndex: 1 };

function renderEditor(content: CellContent, options: { typed?: string; cell?: CellInlineEditorCell } = {}) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const changes: TableCellDraft[] = [];
  const draftRef: React.MutableRefObject<TableCellDraft | null> = { current: null };
  const fieldRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null> = { current: null };
  const opened = createTableCellDraft(identity, content);
  const initial = options.typed === undefined ? opened : startTableCellDraftByTyping(opened, options.typed);
  function Harness() {
    const [draft, setDraft] = React.useState(initial);
    draftRef.current = draft;
    return (
      <CellInlineEditor
        draft={draft}
        draftRef={draftRef}
        fieldRef={fieldRef}
        cell={options.cell ?? CELL}
        onDraftChange={(next) => { draftRef.current = next; changes.push(next); setDraft(next); }}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }
  const view = render(<Harness />);
  return { ...view, onCommit, onCancel, changes, draftRef, fieldRef };
}

const textOf = (value: string): CellContent => ({ type: 'richText', value: plainRichText('r', value) });

describe('CellInlineEditor', () => {
  it('opens on the cell with the content, focused, caret at the end and the position in its name', () => {
    const { fieldRef } = renderEditor(textOf('Faixa'));
    const field = screen.getByRole('textbox', { name: 'Conteúdo da célula, linha 3, coluna 2' });
    expect(field).toHaveValue('Faixa');
    expect(document.activeElement).toBe(field);
    expect((field as HTMLTextAreaElement).selectionStart).toBe(5);
    expect(fieldRef.current).toBe(field);
    expect(screen.getByText('Enter salva e desce · Tab vai para a direita · Alt+Enter quebra a linha · Esc cancela')).toBeInTheDocument();
  });

  it('an empty cell opens as text, ready to type (never as "Vazio")', () => {
    renderEditor({ type: 'empty' });
    expect(screen.getByRole('textbox', { name: /Conteúdo da célula/ })).toHaveValue('');
    expect(screen.queryByText(/ficará vazia/)).not.toBeInTheDocument();
  });

  it('a key typed on the selected cell replaced the content', () => {
    renderEditor(textOf('Antigo'), { typed: 'N' });
    expect(screen.getByRole('textbox', { name: /Conteúdo da célula/ })).toHaveValue('N');
  });

  it('Enter saves and goes down, Shift+Enter up, Tab right, Shift+Tab left, Esc cancels', () => {
    const { onCommit, onCancel } = renderEditor(textOf('A'));
    const field = screen.getByRole('textbox', { name: /Conteúdo da célula/ });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(field, { key: 'Tab' });
    fireEvent.keyDown(field, { key: 'Tab', shiftKey: true });
    expect(onCommit.mock.calls).toEqual([['down'], ['up'], ['right'], ['left']]);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Alt+Enter breaks the line where the caret is, without saving', () => {
    const { onCommit, changes } = renderEditor(textOf('AB'));
    const field = screen.getByRole('textbox', { name: /Conteúdo da célula/ }) as HTMLTextAreaElement;
    field.setSelectionRange(1, 1);
    fireEvent.keyDown(field, { key: 'Enter', altKey: true });
    expect(field).toHaveValue('A\nB');
    expect(changes.at(-1)).toMatchObject({ richText: 'A\nB', dirty: true });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not save while an accent or IME composition is in progress', () => {
    const { onCommit } = renderEditor(textOf('A'));
    const field = screen.getByRole('textbox', { name: /Conteúdo da célula/ });
    fireEvent.compositionStart(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('down');
  });

  it('the symbol bar inserts technical symbols at the caret and keeps typing in the cell', () => {
    const { changes } = renderEditor(textOf('25 C'));
    const toolbar = screen.getByRole('toolbar', { name: 'Símbolos técnicos e ações da célula' });
    for (const symbol of ['±', '°C', '%', '³', '²', 'Ø', '×', 'Δ', 'µ', 'Ω']) {
      expect(screen.getByRole('button', { name: `Inserir ${symbol}` })).toBeInTheDocument();
    }
    expect(toolbar).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: /Conteúdo da célula/ }) as HTMLTextAreaElement;
    field.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Inserir ±' }));
    expect(field).toHaveValue('±25 C');
    expect(changes.at(-1)?.richText).toBe('±25 C');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(1);
  });

  it('typing updates the shared draft and dirty goes back to false when the text is restored', () => {
    const { changes } = renderEditor(textOf('Faixa'));
    const field = screen.getByRole('textbox', { name: /Conteúdo da célula/ });
    fireEvent.change(field, { target: { value: 'Faixas' } });
    expect(changes.at(-1)).toMatchObject({ richText: 'Faixas', dirty: true });
    fireEvent.change(field, { target: { value: 'Faixa' } });
    expect(changes.at(-1)).toMatchObject({ richText: 'Faixa', dirty: false });
  });

  it('the ✓ and ✕ buttons save in place and cancel', () => {
    const { onCommit, onCancel } = renderEditor(textOf('A'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar esta célula' }));
    expect(onCommit).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar esta edição' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('edits a technical code in the cell on one line, without symbols', () => {
    const { changes, onCommit } = renderEditor({ type: 'technicalCode', value: 'TA-25N' });
    const field = screen.getByRole('textbox', { name: 'Código técnico da célula, linha 3, coluna 2' });
    expect(field).toHaveValue('TA-25N');
    expect(screen.queryByRole('button', { name: 'Inserir ±' })).not.toBeInTheDocument();
    fireEvent.keyDown(field, { key: 'Enter', altKey: true });
    expect(field).toHaveValue('TA-25N');
    fireEvent.change(field, { target: { value: 'TA-30N' } });
    expect(changes.at(-1)).toMatchObject({ activeType: 'technicalCode', technicalCode: 'TA-30N', dirty: true });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('down');
  });

  it('edits the number of a measurement and explains where the unit is changed', () => {
    const { changes } = renderEditor({ type: 'measurement', valueText: '12', unit: 'mm' });
    const field = screen.getByRole('textbox', { name: 'Valor da medição da célula, linha 3, coluna 2' });
    expect(field).toHaveValue('12');
    expect(screen.getByText(/Unidade: mm\. Para mudar a unidade, use Avançado no painel ao lado\./)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '12.5' } });
    expect(changes.at(-1)).toMatchObject({ measurement: { valueText: '12.5', unit: 'mm' } });
  });

  it('marks, images and specially formatted text are shown as a note, never as a field', () => {
    const { unmount } = renderEditor({ type: 'marker', legendEntryId: 'l' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Este conteúdo não é editado aqui. Veja o painel ao lado.');
    expect(screen.getByRole('button', { name: 'Salvar esta célula' })).toBeDisabled();
    unmount();
    renderEditor({ type: 'richText', value: { paragraphs: [{ id: 'p', inlines: [
      { kind: 'text', id: 'a', text: 'A', marks: [] },
      { kind: 'text', id: 'b', text: 'B', marks: [] },
    ] }] } });
    expect(screen.getByRole('note')).toHaveTextContent('Este texto tem formatação especial e não pode ser editado aqui.');
  });

  it('is readable at any page zoom: counter-scaled, 220 px wide at least, and as wide as the cell on screen', () => {
    act(() => setStageZoomChoice('75'));
    const { container, unmount } = renderEditor(textOf('A'));
    const editor = container.querySelector<HTMLElement>('[data-cell-inline-editor]')!;
    expect(Number(editor.style.zoom)).toBeCloseTo(1 / 0.75, 5);
    const field = screen.getByRole('textbox', { name: /Conteúdo da célula/ });
    expect(field.style.width).toBe('220px');
    expect(field.style.minHeight).toBe('40px');
    unmount();
    act(() => setStageZoomChoice('125'));
    renderEditor(textOf('A'), { cell: { widthPx: 300, heightPx: 48, rowIndex: 0, columnIndex: 0 } });
    const wide = screen.getByRole('textbox', { name: /Conteúdo da célula/ });
    expect(wide.style.width).toBe('375px');
    expect(wide.style.minHeight).toBe('60px');
  });
});
