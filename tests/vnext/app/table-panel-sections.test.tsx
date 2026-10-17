import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession } from '@/vnext/application';
import { TABLE_PRESETS } from '@/vnext/application/table-preset-registry';
import { createNewTableModel, createTableInsertSpec, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { TableColorField } from '@/vnext/app/editor/TableColorField';
import { TableDecimalField } from '@/vnext/app/editor/TableDecimalField';
import { selectedCellsText } from '@/vnext/app/editor/TableInspectorPanel';
import { TableLookSection, tableLookMessage } from '@/vnext/app/editor/TableLookSection';
import { TableNotesSection } from '@/vnext/app/editor/TableNotesSection';
import { TableStructureSection } from '@/vnext/app/editor/TableStructureSection';
import { TableStyleInspector } from '@/vnext/app/TableStyleInspector';
import { plainRichText, type CatalogDocument, type TableModel, type TableObject } from '@/vnext/domain';
import {
  tableCellSelection,
  tableRangeSelection,
  tableRowSelection,
  tableSelectionIdentity,
} from '@/vnext/editor/table-selection';

afterEach(cleanup);

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

/** A table as the editor creates it (house preset, header row), inside a document. */
function styledTable(size = { rows: 6, columns: 3 }): { document: CatalogDocument; object: TableObject } {
  const document = createW2CDemoDocument(ids('doc'));
  const session = createDocumentSession(document, { createId: ids('generated') });
  const page = document.pages[0];
  const result = session.execute({ type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, createNewTableModel(size), document.style) });
  if (!result.ok) throw new Error('Could not insert the table');
  const object = result.document.pages[0].objects.find((entry) => entry.id === result.metadata.createdIds[0]);
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return { document: result.document, object };
}

const identityOf = (object: TableObject) => tableSelectionIdentity('page', object.id, object.table.id);
const point = (table: TableModel, row: number, column: number) => ({ rowId: table.rows[row].id, columnId: table.columns[column].id });

describe('FR-10 (2D) number fields of the table panel', () => {
  function renderField(overrides: Partial<React.ComponentProps<typeof TableDecimalField>> = {}) {
    const onCommit = vi.fn();
    render(
      <label>
        <span>Espaço interno</span>
        <TableDecimalField name="Espaço interno" unit="mm" range="zeroOrMore" example="1,5" value={2} onCommit={onCommit} {...overrides} />
      </label>
    );
    return { onCommit, input: screen.getByRole('textbox', { name: /^Espaço interno/ }) };
  }

  it('shows the value with a comma and accepts "1,5" and "1.5"', () => {
    const { onCommit, input } = renderField({ value: 2.5 });
    expect(input).toHaveValue('2,5');
    fireEvent.change(input, { target: { value: '1,5' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(1.5);
    fireEvent.change(input, { target: { value: '0.8' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith(0.8);
  });

  it('refuses "abc" with a visible message next to the field and keeps the current value', () => {
    const { onCommit, input } = renderField();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('2');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const message = screen.getByText('Espaço interno: digite um número em milímetros, como 1,5 (zero ou mais). O valor anterior foi mantido.');
    expect(input.getAttribute('aria-describedby')).toContain(message.id);
    // Typing again clears the message.
    fireEvent.change(input, { target: { value: '3' } });
    expect(screen.queryByText(/O valor anterior foi mantido/)).toBeNull();
  });

  it('Esc puts the current value back without applying anything', () => {
    const { onCommit, input } = renderField();
    fireEvent.change(input, { target: { value: '9,9' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('2');
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('refuses zero where it must be positive, a fraction where it must be whole, and sends empty as "inherit"', () => {
    const positive = renderField({ range: 'positive', name: 'Altura da linha', example: '8' });
    fireEvent.change(positive.input, { target: { value: '0' } });
    fireEvent.blur(positive.input);
    expect(positive.onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('Altura da linha: digite um número em milímetros, como 8 (maior que zero). O valor anterior foi mantido.')).toBeInTheDocument();
    cleanup();

    const whole = renderField({ integer: true, unit: undefined, name: 'Proporção da largura', example: '2', range: 'positive' });
    fireEvent.change(whole.input, { target: { value: '1,5' } });
    fireEvent.blur(whole.input);
    expect(whole.onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('Proporção da largura: digite um número inteiro, como 2 (maior que zero). O valor anterior foi mantido.')).toBeInTheDocument();
    cleanup();

    const inherit = renderField({ allowEmpty: true });
    fireEvent.change(inherit.input, { target: { value: '' } });
    fireEvent.blur(inherit.input);
    expect(inherit.onCommit).toHaveBeenCalledWith(null);
  });

  it('a live field (size of a cell image) sends every valid number while typing and still explains a refusal', () => {
    const { onCommit, input } = renderField({ live: true, value: 20, name: 'Largura da imagem', example: '20', range: 'positive' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '25,5' } });
    expect(onCommit).toHaveBeenLastCalledWith(25.5);
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Largura da imagem: digite um número em milímetros/)).toBeInTheDocument();
  });
});

describe('FR-10 (2D) colours without typing a code', () => {
  it('offers the catalog colours and the browser colour picker, applied when the picker closes', () => {
    const onPick = vi.fn();
    const { container } = render(
      <TableColorField swatchLabel="Cor de fundo" pickerLabel="Outra cor de fundo" value="#003366" palette={['#003366', '#DCECFF']}
        pickerProps={{ 'data-style-property': 'background' }} onPick={onPick} />
    );
    expect(screen.getByRole('button', { name: 'Cor de fundo #003366' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cor de fundo #DCECFF' }));
    expect(onPick).toHaveBeenLastCalledWith('#DCECFF');
    const picker = container.querySelector<HTMLInputElement>('input[type="color"][data-style-property="background"]');
    if (!picker) throw new Error('Missing colour picker');
    expect(screen.getByLabelText('Outra cor de fundo')).toBe(picker);
    fireEvent.input(picker, { target: { value: '#ffaa00' } });
    expect(onPick).toHaveBeenCalledTimes(1);
    fireEvent.change(picker, { target: { value: '#ffaa00' } });
    expect(onPick).toHaveBeenLastCalledWith('#FFAA00');
    expect(container.querySelector('input[type="text"]')).toBeNull();
  });
});

describe('FR-33 "Estilo": presets by task, three switches and P/M/G', () => {
  it('shows the four presets with a drawing, marks the current one and the parts that are on', () => {
    const { document, object } = styledTable();
    const onRequest = vi.fn();
    const { container } = render(<TableLookSection table={object.table} documentStyle={document.style} disabled={false} onRequest={onRequest} />);
    const gallery = screen.getByRole('group', { name: 'Estilos prontos' });
    const names = TABLE_PRESETS.map((preset) => preset.label);
    expect(names).toEqual(['Especificações', 'Comparativo de modelos', 'Códigos de pedido', 'Acessórios']);
    for (const name of names) expect(within(gallery).getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    expect(container.querySelectorAll('svg.vnext-table-look-thumb')).toHaveLength(4);
    // Only the house base, without its highlighted first column: no style is shown as applied.
    for (const name of names) expect(within(gallery).getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('checkbox', { name: 'Cabeçalho' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Linhas alternadas' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Primeira coluna destacada' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Texto médio' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(gallery).getByRole('button', { name: /^Comparativo de modelos/ }));
    expect(onRequest).toHaveBeenLastCalledWith({ kind: 'preset', presetId: 'comparison' }, 'Estilo "Comparativo de modelos" aplicado. Para voltar, use Desfazer.');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Linhas alternadas' }));
    expect(onRequest).toHaveBeenLastCalledWith({ kind: 'banded', on: true }, 'Linhas alternadas ativadas.');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Primeira coluna destacada' }));
    expect(onRequest).toHaveBeenLastCalledWith({ kind: 'firstColumn', on: true }, 'Primeira coluna destacada.');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cabeçalho' }));
    expect(onRequest).toHaveBeenLastCalledWith({ kind: 'header', on: false }, 'A tabela ficou sem cabeçalho.');
    fireEvent.click(screen.getByRole('button', { name: 'Texto grande' }));
    expect(onRequest).toHaveBeenLastCalledWith({ kind: 'size', size: 'large' }, 'Texto da tabela no tamanho G.');
  });

  it('is disabled with its reason while a cell is being edited or the table is locked', () => {
    const { document, object } = styledTable();
    render(<TableLookSection table={object.table} documentStyle={document.style} disabled disabledReason="Conclua ou cancele a edição da célula para alterar a apresentação da tabela." onRequest={vi.fn()} />);
    const preset = screen.getByRole('button', { name: /^Acessórios/ });
    expect(preset).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Cabeçalho' })).toBeDisabled();
    expect(screen.getByText('Conclua ou cancele a edição da célula para alterar a apresentação da tabela.').id).toBe(preset.getAttribute('aria-describedby'));
  });

  it('names every message in plain Portuguese', () => {
    expect(tableLookMessage({ kind: 'header', on: true })).toBe('A primeira linha virou o cabeçalho.');
    expect(tableLookMessage({ kind: 'firstColumn', on: false })).toBe('A primeira coluna ficou sem destaque.');
    expect(tableLookMessage({ kind: 'size', size: 'small' })).toBe('Texto da tabela no tamanho P.');
  });
});

describe('FR-34 "Estrutura": rows and columns from the selected cell or range', () => {
  it('asks for a cell outside the grid, then acts on the selected cell', () => {
    const { object } = styledTable();
    const insert = vi.fn();
    const remove = vi.fn();
    const { rerender } = render(<TableStructureSection table={object.table} mode="select" tableSelection={null} runTableAxisInsert={insert} runTableAxisRemove={remove} />);
    const region = screen.getByRole('region', { name: 'Estrutura' });
    expect(within(region).queryByRole('button')).toBeNull();
    expect(within(region).getByText('Para inserir ou excluir linhas e colunas, clique em Editar tabela e escolha uma célula.')).toBeInTheDocument();

    const cell = tableCellSelection(identityOf(object), point(object.table, 2, 1));
    rerender(<TableStructureSection table={object.table} mode="table-grid" tableSelection={cell} runTableAxisInsert={insert} runTableAxisRemove={remove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Linha abaixo' }));
    expect(insert).toHaveBeenLastCalledWith('row', 'after');
    fireEvent.click(screen.getByRole('button', { name: 'Coluna à esquerda' }));
    expect(insert).toHaveBeenLastCalledWith('column', 'before');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir linha' }));
    expect(remove).toHaveBeenLastCalledWith('row');
  });

  it('names "Excluir 5 linhas" for a range and keeps the last row and column', () => {
    const { object } = styledTable({ rows: 8, columns: 3 });
    const range = tableRangeSelection(identityOf(object), point(object.table, 1, 0), point(object.table, 5, 1));
    const remove = vi.fn();
    const { rerender } = render(<TableStructureSection table={object.table} mode="table-grid" tableSelection={range} runTableAxisInsert={vi.fn()} runTableAxisRemove={remove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir 5 linhas' }));
    expect(remove).toHaveBeenCalledWith('row');
    expect(screen.getByRole('button', { name: 'Excluir 2 colunas' })).toBeEnabled();

    const allRows = tableRowSelection(identityOf(object), object.table.rows[0].id, object.table.rows.at(-1)!.id);
    rerender(<TableStructureSection table={object.table} mode="table-grid" tableSelection={allRows} runTableAxisInsert={vi.fn()} runTableAxisRemove={remove} />);
    const all = screen.getByRole('button', { name: 'Excluir 8 linhas' });
    expect(all).toBeDisabled();
    expect(all).toHaveAttribute('title', 'A tabela precisa de pelo menos uma linha.');
    // A row selection has no column: the column buttons explain what to do.
    expect(screen.getByRole('button', { name: 'Coluna à direita' })).toHaveAttribute('title', 'Clique numa célula da tabela para inserir ou excluir colunas.');
    // A disabled button cannot take the focus: the reason is also written under its group and read with it.
    expect(within(screen.getByRole('group', { name: 'Linhas' })).getByText('A tabela precisa de pelo menos uma linha.')).toBeVisible();
    expect(all).toHaveAccessibleDescription('A tabela precisa de pelo menos uma linha.');
    expect(screen.getByRole('button', { name: 'Linha abaixo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Linha abaixo' })).not.toHaveAttribute('aria-describedby');
    expect(within(screen.getByRole('group', { name: 'Colunas' })).getByText('Clique numa célula da tabela para inserir ou excluir colunas.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Coluna à direita' })).toHaveAccessibleDescription('Clique numa célula da tabela para inserir ou excluir colunas.');
  });

  it('waits for the cell being edited, with the plain reason', () => {
    const { object } = styledTable();
    const cell = tableCellSelection(identityOf(object), point(object.table, 1, 1));
    render(<TableStructureSection table={object.table} mode="cell-edit" tableSelection={cell} runTableAxisInsert={vi.fn()} runTableAxisRemove={vi.fn()} />);
    const above = screen.getByRole('button', { name: 'Linha acima' });
    expect(above).toBeDisabled();
    expect(above).toHaveAttribute('title', 'Conclua a edição da célula antes de mudar linhas e colunas.');
    expect(screen.getByText('Conclua a edição da célula antes de mudar linhas e colunas.')).toBeVisible();
    expect(above).toHaveAccessibleDescription('Conclua a edição da célula antes de mudar linhas e colunas.');
  });
});

describe('FR-33 "Notas": a note under the table in one click', () => {
  function tableWithNote(): TableModel {
    const { object } = styledTable();
    return {
      ...object.table,
      annotations: [
        { id: 'note-1', kind: 'note', text: plainRichText('note-1-text', 'Valores a 20 °C.') },
        { id: 'caption-1', kind: 'caption', text: plainRichText('caption-1-text', 'Tabela 1') },
      ],
      annotationIds: ['note-1', 'caption-1'],
    };
  }

  it('adds a note, edits it on leaving the field and removes it', () => {
    const { object } = styledTable();
    const props = {
      disabled: false,
      onAddNote: vi.fn(() => true),
      onUpdateNote: vi.fn(),
      onRemoveNote: vi.fn(),
      onOpenAllNotes: vi.fn(),
    };
    const { rerender } = render(<TableNotesSection table={object.table} {...props} />);
    expect(screen.getByText('As notas aparecem logo abaixo da tabela, no PDF.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar nota' }));
    expect(props.onAddNote).toHaveBeenCalledTimes(1);

    rerender(<TableNotesSection table={tableWithNote()} {...props} />);
    const note = screen.getByRole('textbox', { name: 'Nota 1' });
    expect(note).toHaveValue('Valores a 20 °C.');
    // The new note is focused and selected, ready to be typed over.
    expect(note).toHaveFocus();
    // The caption is not a note: it stays in "Notas e legenda".
    expect(screen.queryByRole('textbox', { name: 'Nota 2' })).toBeNull();
    fireEvent.change(note, { target: { value: 'Valores medidos a 20 °C.' } });
    fireEvent.blur(note);
    expect(props.onUpdateNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }), 'Valores medidos a 20 °C.');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir nota 1' }));
    expect(props.onRemoveNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notas e legenda' }));
    expect(props.onOpenAllNotes).toHaveBeenCalledTimes(1);
  });

  it('keeps a note that cells also use out of the one-click removal', () => {
    const table = tableWithNote();
    const shared: TableModel = { ...table, cells: table.cells.map((cell, index) => index === 4 ? { ...cell, annotationIds: ['note-1'] } : cell) };
    render(<TableNotesSection table={shared} disabled={false} onAddNote={() => true} onUpdateNote={vi.fn()} onRemoveNote={vi.fn()} onOpenAllNotes={vi.fn()} />);
    const remove = screen.getByRole('button', { name: 'Excluir nota 1' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', 'Esta nota também está ligada a células. Exclua em Notas e legenda.');
  });
});

describe('FR-10 / FR-20 (2D) "Texto, cores e bordas"', () => {
  function renderInspector(overrides: Partial<React.ComponentProps<typeof TableStyleInspector>> = {}) {
    const { document, object } = styledTable();
    const onPatch = vi.fn();
    const view = render(
      <TableStyleInspector
        table={object.table}
        documentStyle={document.style}
        scope={{ kind: 'cells', cellIds: [object.table.cells[4].id] }}
        roleScope={null}
        disabled={false}
        advancedOpen
        paddingLinked={false}
        onRoleScopeChange={vi.fn()}
        onAdvancedOpenChange={vi.fn()}
        onPaddingLinkedChange={vi.fn()}
        onPatch={onPatch}
        onBorderPreset={vi.fn()}
        onAnnotationGap={vi.fn()}
        wrapPolicy={undefined}
        onWrapPolicy={vi.fn()}
        {...overrides}
      />
    );
    return { ...view, onPatch, object };
  }

  it('speaks of "Espaço interno" and resets all of it in one click', () => {
    const { onPatch, container } = renderInspector();
    expect(screen.getByText('Espaço interno por lado (mm)')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/padding|Padding|HEX|Misto/);
    const top = container.querySelector<HTMLInputElement>('[data-style-padding-side="top"]')!;
    fireEvent.change(top, { target: { value: '1,5' } });
    fireEvent.blur(top);
    expect(onPatch).toHaveBeenLastCalledWith({ paddingMm: { top: 1.5 } });
    expect(screen.getByRole('button', { name: 'Redefinir todo o espaço interno' })).toBeInTheDocument();
  });

  it('accepts a comma in the text size and explains a refused value', () => {
    const { onPatch, container } = renderInspector();
    const size = container.querySelector<HTMLInputElement>('[data-style-property="fontSizePt"]')!;
    fireEvent.change(size, { target: { value: '9,5' } });
    fireEvent.blur(size);
    expect(onPatch).toHaveBeenLastCalledWith({ fontSizePt: 9.5 });
    fireEvent.change(size, { target: { value: 'grande' } });
    fireEvent.blur(size);
    expect(screen.getByText('Tamanho: digite um número em pontos, como 9 (maior que zero). O valor anterior foi mantido.')).toBeInTheDocument();
    expect(onPatch).toHaveBeenCalledTimes(1);
  });

  it('chooses colours by swatch or colour picker, never by a typed code', () => {
    const { onPatch, container } = renderInspector();
    expect(container.querySelector('input[data-style-property="color"]')).toHaveAttribute('type', 'color');
    expect(container.querySelector('input[data-style-property="background"]')).toHaveAttribute('type', 'color');
    const swatch = container.querySelector<HTMLButtonElement>('[data-style-palette="background"] button')!;
    fireEvent.click(swatch);
    expect(onPatch).toHaveBeenLastCalledWith({ background: swatch.getAttribute('title')!.toUpperCase() });
  });

  it('offers the line breaks of the selected cells', () => {
    const onWrapPolicy = vi.fn();
    renderInspector({ onWrapPolicy, wrapPolicy: 'mixed' });
    const wrap = screen.getByRole('combobox', { name: 'Quebra do texto' });
    expect(wrap).toHaveValue('mixed');
    fireEvent.change(wrap, { target: { value: 'nowrap' } });
    expect(onWrapPolicy).toHaveBeenLastCalledWith('nowrap');
    fireEvent.change(wrap, { target: { value: '' } });
    expect(onWrapPolicy).toHaveBeenLastCalledWith(null);
  });
});

describe('FR-20 (2D) plain counts', () => {
  it('says "1 célula selecionada" and "3 células selecionadas"', () => {
    expect(selectedCellsText(1)).toBe('1 célula selecionada.');
    expect(selectedCellsText(3)).toBe('3 células selecionadas.');
  });
});
