import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import { plainRichText, type Cell, type CatalogDocument, type TableObject, type TextObject } from '@/vnext/domain';
import { LIBRARY_BUTTON_LABEL, LIBRARY_NAVIGATION_MESSAGES } from '@/vnext/app/catalog-navigation';
import { CanvasHeader } from '@/vnext/app/editor/CanvasHeader';
import { TableCellEditorSection, type TableCellEditorSectionProps } from '@/vnext/app/editor/TableCellEditorSection';
import { TableGridPasteFallback, TableGridToolbar, type TableGridToolbarProps } from '@/vnext/app/editor/TableGridToolbar';
import { TableInspectorPanel, type TableInspectorPanelProps } from '@/vnext/app/editor/TableInspectorPanel';
import { TextInspectorSection } from '@/vnext/app/editor/TextInspectorSection';
import { VNextApp } from '@/vnext/app/VNextApp';
import { createTableCellDraft, type TableCellDraft } from '@/vnext/editor/table-cell-draft';
import { tableSelectionIdentity, wholeTableSelection } from '@/vnext/editor/table-selection';
import { VNextPersistenceRuntime, type CatalogRepository, type PersistenceResult } from '@/vnext/persistence';
import { createW4BTableDocument, W4B_OBJECT_ID } from '../proof/fixtures/w4b-table-document';

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

function tableObject(document: CatalogDocument = createW4BTableDocument()): TableObject {
  const object = document.pages[0].objects.find((entry) => entry.id === W4B_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Missing W4.B table');
  return object;
}

function firstCell(table: TableObject): Cell {
  return table.table.cells[0];
}

function cellDraft(content: Cell['content'] = { type: 'technicalCode', value: 'TC-001' }): TableCellDraft {
  return createTableCellDraft({ pageId: 'w4b-page', objectId: W4B_OBJECT_ID, tableId: 'w4b-table', cellId: 'w4b-code' }, content);
}

function toolbarProps(overrides: Partial<TableGridToolbarProps> = {}): TableGridToolbarProps {
  return {
    simple: false,
    mode: 'table-grid',
    tableSelection: null,
    tableOptionsOpen: true,
    setTableOptionsOpen: vi.fn(),
    rowAxisReason: undefined,
    columnAxisReason: undefined,
    runTableAxisInsert: vi.fn(),
    runTableAxisRemove: vi.fn(),
    tableRowsToInsert: '10',
    setTableRowsToInsert: vi.fn(),
    currentMergeEligibility: { enabled: false, reason: 'Selecione duas ou mais células adjacentes.' },
    currentUnmergeEligibility: { enabled: false, reason: 'Selecione uma célula mesclada.' },
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

function panelProps(overrides: Partial<TableInspectorPanelProps> = {}): TableInspectorPanelProps {
  const table = overrides.tableObject ?? tableObject();
  const document = createW4BTableDocument();
  return {
    tableObject: table,
    documentStyle: document.style,
    assets: document.assets,
    simple: false,
    mode: 'table-grid',
    tableSelection: null,
    tableInspectorAdvancedOpen: true,
    setTableInspectorAdvancedOpen: vi.fn(),
    tableSemanticDisabled: false,
    selectedTableTitleValue: '',
    hasTableTitleDraft: false,
    updateTableTitleDraft: vi.fn(),
    setTableTitleComposition: vi.fn(),
    applyTableTitleDraft: vi.fn(),
    cancelTableTitleDraft: vi.fn(),
    runTableTitleSet: vi.fn(),
    startTableGrid: vi.fn(),
    markerPanelOpen: false,
    setMarkerPanelOpen: vi.fn(),
    fitHeightPreparation: null,
    runFitHeight: vi.fn(),
    tableStyleScope: undefined,
    tableStyleRoleScope: null,
    tableStyleDisabled: false,
    tableStyleAdvancedOpen: false,
    tableStylePaddingLinked: true,
    setTableStyleRoleScope: vi.fn(),
    setTableStyleAdvancedOpen: vi.fn(),
    setTableStylePaddingLinked: vi.fn(),
    runTableStylePatch: vi.fn(),
    runTableBorderPreset: vi.fn(),
    runTableLook: vi.fn(),
    runTableAxisInsert: vi.fn(),
    runTableAxisRemove: vi.fn(),
    addQuickNote: vi.fn(() => true),
    removeQuickNote: vi.fn(),
    runAnnotationGap: vi.fn(),
    selectedRowAxisIds: [],
    runRowProperties: vi.fn(),
    runRowHeightMode: vi.fn(),
    runRowHeightValue: vi.fn(),
    runAxisReorder: vi.fn(),
    selectedColumnAxisIds: [],
    columnDimensionsAdvancedOpen: false,
    setColumnDimensionsAdvancedOpen: vi.fn(),
    runColumnMode: vi.fn(),
    runColumnNumber: vi.fn(),
    runEqualizeColumns: vi.fn(),
    selectedAnchorCells: [],
    cellEditing: false,
    startCellEdit: vi.fn(),
    imageCellAssetChoice: '',
    setImageCellAssetChoice: vi.fn(),
    imageCellFit: 'contain',
    setImageCellFit: vi.fn(),
    imageCellWidthMm: '20',
    setImageCellWidthMm: vi.fn(),
    imageCellHeightMm: '20',
    setImageCellHeightMm: vi.fn(),
    canUploadCellImage: false,
    runImageCellSet: vi.fn(),
    runImageCellUpload: vi.fn(),
    runImageCellClear: vi.fn(),
    newAnnotationKind: 'note',
    setNewAnnotationKind: vi.fn(),
    newAnnotationTarget: 'TABLE',
    setNewAnnotationTarget: vi.fn(),
    newAnnotationText: '',
    setNewAnnotationText: vi.fn(),
    runAnnotationCreate: vi.fn(),
    runAnnotationUpdate: vi.fn(),
    runAnnotationReference: vi.fn(),
    runAnnotationReorder: vi.fn(),
    runAnnotationRemove: vi.fn(),
    markerLegendChoice: '',
    setMarkerLegendChoice: vi.fn(),
    runExistingMarkerAssignment: vi.fn(),
    runMarkerDetach: vi.fn(),
    newMarkerCode: '',
    setNewMarkerCode: vi.fn(),
    newMarkerText: '',
    setNewMarkerText: vi.fn(),
    runNewMarkerAssignment: vi.fn(),
    runLegendCreateOnly: vi.fn(),
    runLegendUpdate: vi.fn(),
    runLegendRemove: vi.fn(),
    runLegendReorder: vi.fn(),
    locateLegendUsage: vi.fn(),
    commonWrapPolicy: undefined,
    runCellPropertyPatch: vi.fn(),
    ...overrides,
  };
}

describe('FR-92 CanvasHeader', () => {
  it('shows the page number, the page zoom and the problems of the catalog', () => {
    const document = createW4BTableDocument();
    const session = createDocumentSession(document, { createId: () => 'id' });
    render(
      <CanvasHeader pageNumber={2} pageCount={3} pageWidthMm={210}
        issues={{
          document,
          diagnostics: [{ code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR', details: 'texto não cabe', pageId: document.pages[0].id, objectId: W4B_OBJECT_ID }],
          simple: true, onLocate: vi.fn(), session, measurement: null, prepare: () => true, onMessage: vi.fn(),
        }} />
    );
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Zoom da página' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /a corrigir/ })).toBeInTheDocument();
  });

  it('shows the save text only when it is given (outside the simple mode)', () => {
    const document = createW4BTableDocument();
    const session = createDocumentSession(document, { createId: () => 'id' });
    const issues = { document, diagnostics: [], simple: false, onLocate: vi.fn(), session, measurement: null, prepare: () => true, onMessage: vi.fn() };
    const { container, rerender } = render(<CanvasHeader pageNumber={1} pageCount={1} pageWidthMm={210} issues={issues} />);
    expect(container.querySelector('.vnext-memory-status')).toBeNull();
    rerender(<CanvasHeader pageNumber={1} pageCount={1} pageWidthMm={210} issues={issues} memoryStatus="Rascunho nesta aba" />);
    expect(screen.getByText('Rascunho nesta aba')).toHaveAttribute('data-save-state', '');
  });
});

describe('FR-92 TableGridToolbar', () => {
  it('hides the row and column actions in the simple mode until "Opções da tabela" is opened', () => {
    const setTableOptionsOpen = vi.fn();
    render(<TableGridToolbar {...toolbarProps({ simple: true, tableOptionsOpen: false, setTableOptionsOpen })} />);
    const bar = screen.getByLabelText('Estrutura da tabela');
    expect(within(bar).getByText('Editar tabela')).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Linha acima' })).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: 'Opções da tabela' }));
    expect(setTableOptionsOpen).toHaveBeenCalledTimes(1);
  });

  it('runs each grid action through the callbacks it receives', () => {
    const props = toolbarProps({ rowAxisReason: undefined, columnAxisReason: undefined });
    render(<TableGridToolbar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Linha abaixo' }));
    expect(props.runTableAxisInsert).toHaveBeenCalledWith('row', 'after');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar linhas abaixo' }));
    expect(props.runTableAxisInsert).toHaveBeenLastCalledWith('row', 'after', 10);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir coluna' }));
    expect(props.runTableAxisRemove).toHaveBeenCalledWith('column');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(props.runVisibleTableCopy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Notas e legenda' }));
    expect(props.setMarkerPanelOpen).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao objeto' }));
    expect(props.leaveTableGrid).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Mesclar células' })).toBeDisabled();
    // FR-33: "Notas e legenda" is the only way to that panel; the duplicated "Legenda" button is gone.
    expect(screen.queryByRole('button', { name: 'Legenda' })).toBeNull();
  });

  it('FR-34 names the removal by the selected rows and explains why the last row stays', () => {
    const props = toolbarProps({ rowAxisCount: 3, columnAxisCount: 2, removeColumnReason: 'A tabela precisa de pelo menos uma coluna.' });
    render(<TableGridToolbar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir 3 linhas' }));
    expect(props.runTableAxisRemove).toHaveBeenCalledWith('row');
    const columns = screen.getByRole('button', { name: 'Excluir 2 colunas' });
    expect(columns).toBeDisabled();
    expect(columns).toHaveAttribute('title', 'A tabela precisa de pelo menos uma coluna.');
    expect(screen.getByRole('button', { name: 'Coluna à direita' })).toBeEnabled();
  });

  it('keeps the structure locked while a cell is being edited, with the plain reason', () => {
    render(<TableGridToolbar {...toolbarProps({ mode: 'cell-edit' })} />);
    const before = screen.getByRole('button', { name: 'Linha acima' });
    expect(before).toBeDisabled();
    expect(before).toHaveAttribute('title', 'Conclua a edição da célula antes de mudar linhas e colunas.');
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeDisabled();
  });
});

describe('FR-92 TableGridPasteFallback', () => {
  it('reports the pasted text, applies it and cancels by closing and clearing', () => {
    const props = {
      tablePasteFallbackText: '',
      setTablePasteFallbackText: vi.fn(),
      setTablePasteFallbackOpen: vi.fn(),
      applyNativePasteFallback: vi.fn(),
    };
    render(<TableGridPasteFallback {...props} />);
    const area = screen.getByRole('region', { name: 'Colar dados na tabela' });
    fireEvent.change(within(area).getByRole('textbox'), { target: { value: 'A\tB' } });
    expect(props.setTablePasteFallbackText).toHaveBeenCalledWith('A\tB');
    fireEvent.click(within(area).getByRole('button', { name: 'Aplicar conteúdo colado' }));
    expect(props.applyNativePasteFallback).toHaveBeenCalledTimes(1);
    fireEvent.click(within(area).getByRole('button', { name: 'Cancelar' }));
    expect(props.setTablePasteFallbackOpen).toHaveBeenCalledWith(false);
    expect(props.setTablePasteFallbackText).toHaveBeenLastCalledWith('');
  });
});

describe('FR-92 TableCellEditorSection', () => {
  function cellProps(overrides: Partial<TableCellEditorSectionProps> = {}): TableCellEditorSectionProps {
    const draft = overrides.cellDraft ?? cellDraft();
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

  it('edits a technical code, focuses through the shared ref and finishes with Concluir or Enter', () => {
    const props = cellProps();
    render(<TableCellEditorSection {...props} />);
    const code = screen.getByRole('textbox', { name: 'Código' });
    expect(code).toHaveValue('TC-001');
    expect(props.cellEditorFieldRef.current).toBe(code);
    fireEvent.change(code, { target: { value: 'TC-002' } });
    expect(props.notifyCellDraftChanged).toHaveBeenCalledWith(expect.objectContaining({ technicalCode: 'TC-002', dirty: true }));
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(props.commitCellEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(props.commitCellEdit).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.cancelCellEdit).toHaveBeenCalledTimes(1);
  });

  it('asks before a type change replaces the content', () => {
    const props = cellProps();
    render(<TableCellEditorSection {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Tipo de conteúdo' }), { target: { value: 'measurement' } });
    const next = vi.mocked(props.notifyCellDraftChanged).mock.calls[0][0];
    expect(next).toEqual(expect.objectContaining({ requiresTypeChangeConfirmation: true }));
    cleanup();
    render(<TableCellEditorSection {...cellProps({ cellDraft: next! })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Trocar o tipo substituirá o conteúdo atual desta célula.');
  });

  it('keeps a marker cell read-only and sends the person to "Notas e legenda"', () => {
    render(<TableCellEditorSection {...cellProps({ cellDraft: cellDraft({ type: 'marker', legendEntryId: 'legend-1' }) })} />);
    expect(screen.getByText(/Use Notas e legenda/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Limpar conteúdo' })).toBeNull();
  });
});

describe('FR-92 TableInspectorPanel', () => {
  it('shows the table title and saves, cancels or removes it through the callbacks', () => {
    const props = panelProps({ selectedTableTitleValue: 'Especificações', hasTableTitleDraft: true });
    render(<TableInspectorPanel {...props} />);
    const title = screen.getByRole('textbox', { name: 'Título' });
    expect(title).toHaveValue('Especificações');
    fireEvent.change(title, { target: { value: 'Especificações técnicas' } });
    expect(props.updateTableTitleDraft).toHaveBeenCalledWith('Especificações técnicas');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar título' }));
    expect(props.applyTableTitleDraft).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar alterações do título' }));
    expect(props.cancelTableTitleDraft).toHaveBeenCalledTimes(1);
  });

  it('opens "Notas e legenda" from the Notas part, entering the grid first when needed', () => {
    const props = panelProps({ mode: 'select' });
    render(<TableInspectorPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notas e legenda' }));
    expect(props.startTableGrid).toHaveBeenCalledWith(props.tableObject);
    expect(props.setMarkerPanelOpen).toHaveBeenCalledWith(true);
  });

  it('hides the details in the simple mode until "Detalhes da tabela" is opened', () => {
    const props = panelProps({ simple: true, tableInspectorAdvancedOpen: false });
    const { container } = render(<TableInspectorPanel {...props} />);
    expect(container.querySelector('[data-table-advanced-details]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes da tabela' }));
    expect(props.setTableInspectorAdvancedOpen).toHaveBeenCalledTimes(1);
  });

  it('renders the cell editor it receives and hides "Editar conteúdo" while a cell is being edited', () => {
    const table = tableObject();
    const selection = wholeTableSelection(tableSelectionIdentity('w4b-page', table.id, table.table.id));
    const props = panelProps({ tableObject: table, tableSelection: selection, selectedAnchorCells: [firstCell(table)] });
    const { rerender } = render(<TableInspectorPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar conteúdo' }));
    expect(props.startCellEdit).toHaveBeenCalledTimes(1);
    rerender(<TableInspectorPanel {...props} cellEditing cellEditor={<div data-testid="cell-editor-slot">editor</div>} />);
    expect(screen.queryByRole('button', { name: 'Editar conteúdo' })).toBeNull();
    expect(screen.getByTestId('cell-editor-slot')).toBeInTheDocument();
  });

  it('allows sending a photo to an image cell only when photos can be sent', () => {
    const table = tableObject();
    const selection = wholeTableSelection(tableSelectionIdentity('w4b-page', table.id, table.table.id));
    const cell = firstCell(table);
    const base = { tableObject: table, tableSelection: selection, selectedAnchorCells: [cell], selectedSemanticCell: cell };
    const { rerender } = render(<TableInspectorPanel {...panelProps({ ...base, canUploadCellImage: false })} />);
    expect(screen.getByRole('button', { name: 'Enviar foto…' })).toBeDisabled();
    const props = panelProps({ ...base, canUploadCellImage: true });
    rerender(<TableInspectorPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar foto…' }));
    expect(props.runImageCellUpload).toHaveBeenCalledTimes(1);
  });
});

describe('FR-92 TextInspectorSection', () => {
  it('adds nothing visible yet: it only reserves the text place of the side panel', () => {
    const document = createW4BTableDocument();
    const session = createDocumentSession(document, { createId: () => 'id' });
    const text: TextObject = {
      id: 'text-1', type: 'text', frame: { xMm: 10, yMm: 10, widthMm: 50, heightMm: 10 }, zIndex: 0,
      text: plainRichText('text-1-content', 'TA-25N'), style: {},
    };
    const { container } = render(
      <TextInspectorSection object={text} simple disabled={false} session={session} measurement={null}
        prepare={() => true} onMessage={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FR-92 editor button back to the Library', () => {
  function unavailable<T>(): Promise<PersistenceResult<T>> {
    return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
  }

  it('reads "Meus catálogos", the same name the waiting messages use', async () => {
    const document = createW4BTableDocument();
    const dependencies: ApplicationExecutionDependencies = { createId: () => 'generated' };
    const session = createDocumentSession(document, dependencies);
    const repository: CatalogRepository = {
      listCatalogs: () => unavailable(),
      getCatalog: () => unavailable(),
      createCatalog: () => unavailable(),
      saveCAS: () => unavailable(),
      archiveCAS: () => unavailable(),
    };
    const runtime = new VNextPersistenceRuntime({
      session,
      repository,
      applicationDependencies: dependencies,
      createMutationId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      createOpenSessionId: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      authLineage: 'user-a:0',
      authorityScopeId: 'user-a',
      binding: {
        catalogId: document.id,
        remoteRevision: 1,
        lastMutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: document.title,
        locale: document.locale,
        createdAt: '2026-09-12T17:00:00.000Z',
        updatedAt: '2026-09-12T17:00:00.000Z',
        createdBy: '99999999-9999-4999-8999-999999999999',
        updatedBy: '99999999-9999-4999-8999-999999999999',
        archivedAt: null,
        documentSchemaVersion: 1,
        documentSnapshot: document,
      },
    });
    const requestLibrary = vi.fn();
    render(<VNextApp runtime={runtime} simpleByDefault onRequestLibrary={requestLibrary} />);
    const library = await waitFor(() => screen.getByRole('button', { name: 'Voltar aos catálogos' }));
    expect(library).toHaveTextContent('Meus catálogos');
    await act(async () => { fireEvent.click(library); });
    expect(requestLibrary).toHaveBeenCalledTimes(1);
    expect(LIBRARY_BUTTON_LABEL).toBe('Meus catálogos');
    expect(LIBRARY_NAVIGATION_MESSAGES.stillSaving).toContain('clique em Meus catálogos de novo');
  });
});
