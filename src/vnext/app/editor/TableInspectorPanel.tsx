import React from 'react';
import { projectEditableRichText, type CellPropertyPatch } from '../../application';
import type { CatalogDocument, Cell, TableObject } from '../../domain';
import type { TableAnnotation } from '../../domain/editorial-model';
import { formatDecimalPtBr } from '../../editor/decimal-ptbr';
import type {
  ColumnDimensionProjection,
  prepareRowsSetProperties,
  RowDimensionProjection,
} from '../../editor/table-dimension-authoring';
import type { TableFitHeightPreparation } from '../../editor/table-fit-height-authoring';
import type { TableLookRequest } from '../../editor/table-look-authoring';
import type { TableSelection } from '../../editor/table-selection';
import type { TableStyleScope } from '../../editor/table-style-authoring';
import { TableStyleInspector } from '../TableStyleInspector';
import { TableDecimalField } from './TableDecimalField';
import type { TableAuthoringMode } from './TableGridToolbar';
import { TableLookSection } from './TableLookSection';
import { TableMarkerLegendPanel, type TableMarkerLegendPanelProps } from './TableMarkerLegendPanel';
import { TableNotesSection } from './TableNotesSection';
import { TableStructureSection } from './TableStructureSection';
import { TableContinuationSection, type TableContinuationControl } from './TableContinuationSection';

type TableStyleInspectorProps = React.ComponentProps<typeof TableStyleInspector>;

/** The callbacks and values of "Notas e legenda", passed through to TableMarkerLegendPanel. */
type MarkerLegendProps = Omit<
  TableMarkerLegendPanelProps,
  'tableObject' | 'mode' | 'selectedAnchorCells' | 'selectedSemanticCell' | 'cellEditing'
  | 'tableSemanticDisabled' | 'tableSemanticDisabledReasonId' | 'setMarkerPanelOpen'
>;

export interface TableInspectorPanelProps extends MarkerLegendProps {
  /** The selected table; the panel is shown only for a table. */
  tableObject: TableObject;
  documentStyle: CatalogDocument['style'];
  /** Photos of the catalog, offered for an image cell. */
  assets: CatalogDocument['assets'];
  simple: boolean;
  mode: TableAuthoringMode;
  tableSelection: TableSelection | null;
  /** "Detalhes da tabela" (simple mode only). */
  tableInspectorAdvancedOpen: boolean;
  setTableInspectorAdvancedOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Title, notes and legend can be changed only when the table is free (not locked, no cell being edited).
  tableSemanticDisabled: boolean;
  tableSemanticDisabledReason?: string;
  tableSemanticDisabledReasonId?: string;

  // Title of the table
  selectedTableTitleValue: string;
  hasTableTitleDraft: boolean;
  updateTableTitleDraft(value: string): void;
  setTableTitleComposition(composing: boolean, value: string): void;
  applyTableTitleDraft(): unknown;
  cancelTableTitleDraft(): void;
  runTableTitleSet(plainText: string | null): void;
  startTableGrid(object: TableObject): unknown;
  markerPanelOpen: boolean;
  setMarkerPanelOpen(open: boolean): void;

  // "Ajustar altura"
  fitHeightPreparation: TableFitHeightPreparation | { ok: false; reason: string; message: string } | null;
  runFitHeight(): void;

  // FR-35 "Continuar na próxima página": shown while the table does not fit on its page.
  continuation?: TableContinuationControl;

  // FR-33 "Estilo": task presets, the three switches and the P/M/G size, each one undo step.
  runTableLook(request: TableLookRequest, successMessage: string): void;

  // FR-34 "Estrutura": rows and columns of the selected cell or range.
  runTableAxisInsert(axis: 'row' | 'column', position: 'before' | 'after'): void;
  runTableAxisRemove(axis: 'row' | 'column'): void;

  // FR-33 "Notas": a note under the table in one click.
  /** Adds a note under the table; true when it was added. */
  addQuickNote(): boolean;
  removeQuickNote(annotation: TableAnnotation): void;

  // Text, colours and borders (TableStyleInspector)
  tableStyleScope?: TableStyleScope;
  tableStyleRoleScope: TableStyleInspectorProps['roleScope'];
  tableStyleDisabled: boolean;
  tableStyleDisabledReasonId?: string;
  tableStyleDisabledReason?: string;
  tableStyleAdvancedOpen: boolean;
  tableStylePaddingLinked: boolean;
  setTableStyleRoleScope: TableStyleInspectorProps['onRoleScopeChange'];
  setTableStyleAdvancedOpen: TableStyleInspectorProps['onAdvancedOpenChange'];
  setTableStylePaddingLinked: TableStyleInspectorProps['onPaddingLinkedChange'];
  runTableStylePatch: TableStyleInspectorProps['onPatch'];
  runTableBorderPreset: TableStyleInspectorProps['onBorderPreset'];
  runAnnotationGap: TableStyleInspectorProps['onAnnotationGap'];

  // Selected rows
  rowDimensionProjection?: RowDimensionProjection;
  effectiveRowHeightMode?: RowDimensionProjection['heightMode'];
  selectedRowAxisIds: readonly string[];
  runRowProperties(next: Parameters<typeof prepareRowsSetProperties>[3], message: string): void;
  runRowHeightMode(mode: 'AUTO' | 'MIN_MM' | 'FIXED_MM'): void;
  runRowHeightValue(raw: string): void;
  runAxisReorder(axis: 'row' | 'column', direction: -1 | 1): void;

  // Selected columns
  columnDimensionProjection?: ColumnDimensionProjection;
  selectedColumnAxisIds: readonly string[];
  columnDimensionsAdvancedOpen: boolean;
  setColumnDimensionsAdvancedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  runColumnMode(mode: 'fixed' | 'flex'): void;
  runColumnNumber(field: 'fixed' | 'weight' | 'min' | 'max', raw: string): void;
  runEqualizeColumns(): void;

  // Selected cells
  selectedAnchorCells: readonly Cell[];
  /** Exactly one free cell is selected (image cell, notes on a cell). */
  selectedSemanticCell?: Cell;
  /** A cell is being edited: structure, notes and legend wait until it is finished. */
  cellEditing: boolean;
  startCellEdit(): unknown;
  /** The cell content editor (TableCellEditorSection), shown while a cell is being edited. */
  cellEditor?: React.ReactNode;
  /** Line breaks of the selected cells, changed from "Texto, cores e bordas". */
  commonWrapPolicy?: NonNullable<Cell['contentPresentation']>['wrapPolicy'];
  runCellPropertyPatch(patch: CellPropertyPatch): void;

  // Image of the cell
  imageCellAssetChoice: string;
  setImageCellAssetChoice(value: string): void;
  imageCellFit: 'contain' | 'cover';
  setImageCellFit(fit: 'contain' | 'cover'): void;
  imageCellWidthMm: string;
  setImageCellWidthMm(value: string): void;
  imageCellHeightMm: string;
  setImageCellHeightMm(value: string): void;
  /** False when photos cannot be sent from this editor. */
  canUploadCellImage: boolean;
  runImageCellSet(): void;
  runImageCellUpload(): void;
  runImageCellClear(): void;
}

const MIXED = 'Vários valores';

/** "1 célula selecionada." / "3 células selecionadas." */
export function selectedCellsText(count: number): string {
  return count === 1 ? '1 célula selecionada.' : `${count} células selecionadas.`;
}

/** Millimetres of a projected length in canonical units, or "several values". */
function mmOrMixed(valueU: number | 'mixed' | undefined): number | 'mixed' | undefined {
  return valueU === 'mixed' ? 'mixed' : typeof valueU === 'number' ? valueU / 10_000 : undefined;
}

/** A text field of the image size kept as text by the editor ("20"), read back as a number. */
function imageSizeValue(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) ? value : undefined;
}

/** All selected cells share the wrap policy (or none of them has one). */
function wrapPolicyOf(cells: readonly Cell[], common: TableInspectorPanelProps['commonWrapPolicy']): 'wrap' | 'nowrap' | 'mixed' | undefined {
  if (cells.length === 0) return undefined;
  if (common !== undefined) return common;
  return cells.every((cell) => cell.contentPresentation?.wrapPolicy === undefined) ? undefined : 'mixed';
}

/**
 * FR-33 (2D): one panel for a selected table, in the order the father uses it:
 * - the selected cells and their editor (only while a cell or range is selected);
 * - "Estilo": four task presets with a drawing, three switches and the P/M/G text size;
 * - "Estrutura": rows and columns of the selected cell or range (FR-34);
 * - "Notas": the notes printed under the table and "Adicionar nota" in one click;
 * - the title of the table;
 * - "Detalhes da tabela" (closed in the simple mode): height, text, colours and borders, rows, columns and the image
 *   of a cell. The fine controls (each side, line height of the text) stay closed inside it.
 * Every change to the catalog is still decided in EditorWorkspace.
 */
export function TableInspectorPanel(props: TableInspectorPanelProps) {
  const {
    tableObject,
    documentStyle,
    assets,
    simple,
    mode,
    tableSelection,
    tableInspectorAdvancedOpen,
    setTableInspectorAdvancedOpen,
    tableSemanticDisabled,
    tableSemanticDisabledReason,
    tableSemanticDisabledReasonId,
    selectedTableTitleValue,
    hasTableTitleDraft,
    updateTableTitleDraft,
    setTableTitleComposition,
    applyTableTitleDraft,
    cancelTableTitleDraft,
    runTableTitleSet,
    startTableGrid,
    markerPanelOpen,
    setMarkerPanelOpen,
    fitHeightPreparation,
    runFitHeight,
    continuation,
    runTableLook,
    runTableAxisInsert,
    runTableAxisRemove,
    addQuickNote,
    removeQuickNote,
    tableStyleScope,
    tableStyleRoleScope,
    tableStyleDisabled,
    tableStyleDisabledReasonId,
    tableStyleDisabledReason,
    tableStyleAdvancedOpen,
    tableStylePaddingLinked,
    setTableStyleRoleScope,
    setTableStyleAdvancedOpen,
    setTableStylePaddingLinked,
    runTableStylePatch,
    runTableBorderPreset,
    runAnnotationGap,
    rowDimensionProjection,
    effectiveRowHeightMode,
    selectedRowAxisIds,
    runRowProperties,
    runRowHeightMode,
    runRowHeightValue,
    runAxisReorder,
    columnDimensionProjection,
    selectedColumnAxisIds,
    columnDimensionsAdvancedOpen,
    setColumnDimensionsAdvancedOpen,
    runColumnMode,
    runColumnNumber,
    runEqualizeColumns,
    selectedAnchorCells,
    selectedSemanticCell,
    cellEditing,
    startCellEdit,
    cellEditor,
    commonWrapPolicy,
    runCellPropertyPatch,
    imageCellAssetChoice,
    setImageCellAssetChoice,
    imageCellFit,
    setImageCellFit,
    imageCellWidthMm,
    setImageCellWidthMm,
    imageCellHeightMm,
    setImageCellHeightMm,
    canUploadCellImage,
    runImageCellSet,
    runImageCellUpload,
    runImageCellClear,
    ...markerLegend
  } = props;
  const locked = Boolean(tableObject.locked);
  const detailsOpen = !simple || tableInspectorAdvancedOpen;
  const gridOnly = mode !== 'table-grid';
  const openAllNotes = () => {
    if (mode === 'select') startTableGrid(tableObject);
    setMarkerPanelOpen(true);
  };
  return (
    <>
      {!locked && tableSelection && (
        <>
          <div className="vnext-divider" />
          <section className="vnext-cell-inspector" data-table-cell-inspector="">
            <h3>Células da tabela</h3>
            <p>{selectedCellsText(selectedAnchorCells.length)}</p>
            {!cellEditing && (
              <button type="button" className="vnext-inspector-action" data-editor-action="edit-cell-content"
                disabled={selectedAnchorCells.length !== 1} onClick={() => startCellEdit()}>
                Editar conteúdo
              </button>
            )}
            {cellEditor}
          </section>
        </>
      )}

      {continuation && <TableContinuationSection {...continuation} tableObject={tableObject} />}

      <div className="vnext-divider" />
      <TableLookSection
        table={tableObject.table}
        documentStyle={documentStyle}
        disabled={tableStyleDisabled}
        disabledReason={tableStyleDisabledReason}
        onRequest={runTableLook}
      />

      {!locked && (
        <>
          <div className="vnext-divider" />
          <TableStructureSection
            table={tableObject.table}
            mode={mode}
            tableSelection={tableSelection}
            runTableAxisInsert={runTableAxisInsert}
            runTableAxisRemove={runTableAxisRemove}
          />
        </>
      )}

      <div className="vnext-divider" />
      <TableNotesSection
        table={tableObject.table}
        disabled={tableSemanticDisabled}
        disabledReason={tableSemanticDisabledReason}
        disabledReasonId={tableSemanticDisabledReasonId}
        onAddNote={addQuickNote}
        onUpdateNote={markerLegend.runAnnotationUpdate}
        onRemoveNote={removeQuickNote}
        onOpenAllNotes={openAllNotes}
      />
      {markerPanelOpen && !locked && tableSelection && (
        <>
          <div className="vnext-divider" />
          <TableMarkerLegendPanel
            {...markerLegend}
            tableObject={tableObject}
            mode={mode}
            selectedAnchorCells={selectedAnchorCells}
            selectedSemanticCell={selectedSemanticCell}
            cellEditing={cellEditing}
            tableSemanticDisabled={tableSemanticDisabled}
            tableSemanticDisabledReasonId={tableSemanticDisabledReasonId}
            setMarkerPanelOpen={setMarkerPanelOpen}
          />
        </>
      )}

      <div className="vnext-divider" />
      <section className="vnext-table-semantic-title" data-table-semantic-title="" data-table-title-session="">
        <h3>Título da tabela</h3>
        {tableObject.table.title && projectEditableRichText(tableObject.table.title) === null ? (
          <p data-table-title-readonly="">
            Este título tem formatação especial e foi mantido como está. Ele não pode ser alterado aqui.
          </p>
        ) : (
          <label>
            <span>Título</span>
            <textarea
              data-table-title-input=""
              value={selectedTableTitleValue}
              disabled={tableSemanticDisabled}
              aria-describedby={tableSemanticDisabledReasonId}
              onChange={(event) => updateTableTitleDraft(event.target.value)}
              onCompositionStart={(event) => setTableTitleComposition(true, event.currentTarget.value)}
              onCompositionEnd={(event) => setTableTitleComposition(false, event.currentTarget.value)}
            />
          </label>
        )}
        <div className="vnext-cell-edit-actions">
          <button
            type="button"
            data-editor-action="set-table-title"
            disabled={tableSemanticDisabled || (tableObject.table.title !== undefined && projectEditableRichText(tableObject.table.title) === null)}
            aria-describedby={tableSemanticDisabledReasonId}
            onClick={() => { applyTableTitleDraft(); }}
          >
            Salvar título
          </button>
          <button
            type="button"
            data-editor-action="cancel-table-title-draft"
            disabled={!hasTableTitleDraft}
            onClick={cancelTableTitleDraft}
          >
            Cancelar alterações do título
          </button>
          <button
            type="button"
            data-editor-action="clear-table-title"
            disabled={tableSemanticDisabled || !tableObject.table.title}
            aria-describedby={tableSemanticDisabledReasonId}
            onClick={() => runTableTitleSet(null)}
          >
            Remover título
          </button>
        </div>
      </section>

      {simple && (
        <>
          <button
            type="button"
            className="vnext-inspector-action vnext-inspector-disclosure"
            data-editor-action="toggle-table-inspector-advanced"
            aria-expanded={tableInspectorAdvancedOpen}
            aria-controls="vnext-table-advanced-details"
            onClick={() => setTableInspectorAdvancedOpen((open) => !open)}
          >
            {tableInspectorAdvancedOpen ? 'Ocultar detalhes da tabela' : 'Detalhes da tabela'}
          </button>
          <p className="vnext-disclosure-help">Altura, texto, cores, bordas, larguras e imagem na célula.</p>
        </>
      )}
      {detailsOpen && (
        <div id="vnext-table-advanced-details" data-table-advanced-details="">
          <div className="vnext-divider" />
          <section
            className="vnext-fit-height-section"
            data-table-fit-height=""
            data-fit-height-measured-q={fitHeightPreparation?.ok ? fitHeightPreparation.prepared.measuredIntrinsicHeightQ : undefined}
            data-fit-height-prepared-u={fitHeightPreparation?.ok ? fitHeightPreparation.prepared.preparedHeightU : undefined}
          >
            <h3>Altura da tabela</h3>
            {fitHeightPreparation?.ok && (
              <p data-fit-height-measurement="">
                Altura necessária: {formatDecimalPtBr(fitHeightPreparation.prepared.preparedHeightU / 10_000, 2)} mm
              </p>
            )}
            <button
              type="button"
              className="vnext-inspector-action"
              data-editor-action="fit-table-height"
              disabled={!fitHeightPreparation?.ok}
              aria-describedby={!fitHeightPreparation?.ok ? `fit-height-reason-${tableObject.id}` : undefined}
              onClick={runFitHeight}
            >
              Ajustar altura
            </button>
            {!fitHeightPreparation?.ok && (
              <p id={`fit-height-reason-${tableObject.id}`} data-fit-height-disabled-reason="">
                {fitHeightPreparation?.message ?? 'Medindo tabela…'}
              </p>
            )}
            {fitHeightPreparation?.ok && fitHeightPreparation.prepared.tallerThanPage && (
              <p className="vnext-fit-height-advisory" data-fit-height-page-advisory="">
                A tabela é mais alta que uma página A4. Para levar as linhas que sobram para outra página, use “Continuar na próxima página”.
              </p>
            )}
          </section>

          {tableStyleScope && (
            <>
              <div className="vnext-divider" />
              <TableStyleInspector
                table={tableObject.table}
                documentStyle={documentStyle}
                scope={tableStyleScope}
                roleScope={tableStyleRoleScope}
                disabled={tableStyleDisabled}
                disabledReasonId={tableStyleDisabledReasonId}
                disabledReason={tableStyleDisabledReason}
                advancedOpen={tableStyleAdvancedOpen}
                paddingLinked={tableStylePaddingLinked}
                onRoleScopeChange={setTableStyleRoleScope}
                onAdvancedOpenChange={setTableStyleAdvancedOpen}
                onPaddingLinkedChange={setTableStylePaddingLinked}
                onPatch={runTableStylePatch}
                onBorderPreset={runTableBorderPreset}
                onAnnotationGap={runAnnotationGap}
                wrapPolicy={wrapPolicyOf(selectedAnchorCells, commonWrapPolicy)}
                onWrapPolicy={(wrapPolicy) => runCellPropertyPatch({ wrapPolicy })}
              />
            </>
          )}

          {!locked && tableSelection && rowDimensionProjection && (
            <>
              <div className="vnext-divider" />
              <section className="vnext-table-dimension-inspector" data-table-row-dimensions="">
                <h3>{rowDimensionProjection.rowIds.length === 1 ? 'Linha' : `${rowDimensionProjection.rowIds.length} linhas`}</h3>
                {mode === 'cell-edit' && (
                  <p id={`table-row-dimension-disabled-${tableObject.id}`}>
                    Conclua ou cancele a edição da célula para alterar a estrutura da tabela.
                  </p>
                )}
                <label>
                  <span>Tipo da linha</span>
                  <select
                    data-row-property="role"
                    value={rowDimensionProjection.role}
                    disabled={gridOnly}
                    aria-describedby={gridOnly ? `table-row-dimension-disabled-${tableObject.id}` : undefined}
                    onChange={(event) => runRowProperties(
                      { role: event.target.value as 'header' | 'body' | 'section' },
                      'Tipo da linha atualizado.'
                    )}
                  >
                    {rowDimensionProjection.role === 'mixed' && <option value="mixed" disabled>{MIXED}</option>}
                    <option value="header">Cabeçalho</option>
                    <option value="body">Corpo</option>
                    <option value="section">Seção</option>
                  </select>
                </label>
                <label>
                  <span>Altura</span>
                  <select
                    data-row-property="height-mode"
                    value={effectiveRowHeightMode ?? rowDimensionProjection.heightMode}
                    disabled={gridOnly}
                    onChange={(event) => runRowHeightMode(event.target.value as 'AUTO' | 'MIN_MM' | 'FIXED_MM')}
                  >
                    {rowDimensionProjection.heightMode === 'mixed' && <option value="mixed" disabled>{MIXED}</option>}
                    <option value="AUTO">Automática</option>
                    <option value="MIN_MM">Mínima</option>
                    <option value="FIXED_MM">Exata</option>
                  </select>
                </label>
                {(effectiveRowHeightMode === 'MIN_MM' || effectiveRowHeightMode === 'FIXED_MM') && (
                  <label>
                    <span>Valor</span>
                    <TableDecimalField
                      name="Altura da linha"
                      unit="mm"
                      example="8"
                      className="vnext-dimension-value"
                      value={mmOrMixed(rowDimensionProjection.valueU)}
                      disabled={gridOnly}
                      inputProps={{ 'data-row-property': 'height-mm' }}
                      onCommit={(value) => { if (value !== null) runRowHeightValue(String(value)); }}
                    />
                  </label>
                )}
                <div className="vnext-dimension-actions">
                  <button type="button" data-editor-action="row-height-auto"
                    disabled={gridOnly} onClick={() => runRowHeightMode('AUTO')}>
                    Voltar para automática
                  </button>
                  <button type="button" data-editor-action="move-row-up"
                    disabled={gridOnly || selectedRowAxisIds.length !== 1 || tableObject.table.rows[0]?.id === selectedRowAxisIds[0]}
                    onClick={() => runAxisReorder('row', -1)}>Mover para cima</button>
                  <button type="button" data-editor-action="move-row-down"
                    disabled={gridOnly || selectedRowAxisIds.length !== 1 || tableObject.table.rows.at(-1)?.id === selectedRowAxisIds[0]}
                    onClick={() => runAxisReorder('row', 1)}>Mover para baixo</button>
                </div>
              </section>
            </>
          )}

          {!locked && tableSelection && columnDimensionProjection && (
            <>
              <div className="vnext-divider" />
              <section className="vnext-table-dimension-inspector" data-table-column-dimensions="">
                <h3>{columnDimensionProjection.columnIds.length === 1 ? 'Coluna' : `${columnDimensionProjection.columnIds.length} colunas`}</h3>
                {mode === 'cell-edit' && (
                  <p id={`table-column-dimension-disabled-${tableObject.id}`}>
                    Conclua ou cancele a edição da célula para alterar a estrutura da tabela.
                  </p>
                )}
                <label>
                  <span>Largura</span>
                  <select
                    data-column-property="width-mode"
                    value={columnDimensionProjection.widthMode}
                    disabled={gridOnly}
                    onChange={(event) => runColumnMode(event.target.value as 'fixed' | 'flex')}
                  >
                    {columnDimensionProjection.widthMode === 'mixed' && <option value="mixed" disabled>{MIXED}</option>}
                    <option value="flex">Flexível</option>
                    <option value="fixed">Fixa</option>
                  </select>
                </label>
                {columnDimensionProjection.widthMode === 'fixed' && (
                  <label>
                    <span>Largura fixa</span>
                    <TableDecimalField
                      name="Largura da coluna"
                      unit="mm"
                      example="40"
                      className="vnext-dimension-value"
                      value={mmOrMixed(columnDimensionProjection.fixedWidthU)}
                      disabled={gridOnly}
                      inputProps={{ 'data-column-property': 'fixed-mm' }}
                      onCommit={(value) => { if (value !== null) runColumnNumber('fixed', String(value)); }}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="vnext-inspector-action"
                  data-editor-action="toggle-column-dimension-advanced"
                  aria-expanded={columnDimensionsAdvancedOpen}
                  onClick={() => setColumnDimensionsAdvancedOpen((open) => !open)}
                >
                  {columnDimensionsAdvancedOpen ? 'Ocultar limites da largura' : 'Limites da largura'}
                </button>
                {columnDimensionsAdvancedOpen && (
                  <div className="vnext-dimension-advanced" data-column-dimension-advanced="">
                    {columnDimensionProjection.widthMode === 'flex' && (
                      <label>
                        <span>Proporção da largura</span>
                        <TableDecimalField
                          name="Proporção da largura"
                          example="2"
                          integer
                          value={columnDimensionProjection.flexWeight}
                          disabled={gridOnly}
                          inputProps={{ 'data-column-property': 'weight' }}
                          onCommit={(value) => { if (value !== null) runColumnNumber('weight', String(value)); }}
                        />
                      </label>
                    )}
                    <label>
                      <span>Mínimo (mm)</span>
                      <TableDecimalField
                        name="Largura mínima"
                        unit="mm"
                        example="15"
                        value={mmOrMixed(columnDimensionProjection.minU)}
                        disabled={gridOnly}
                        inputProps={{ 'data-column-property': 'min-mm' }}
                        onCommit={(value) => { if (value !== null) runColumnNumber('min', String(value)); }}
                      />
                    </label>
                    <label>
                      <span>Máximo (mm)</span>
                      <TableDecimalField
                        name="Largura máxima"
                        unit="mm"
                        example="60"
                        allowEmpty
                        value={mmOrMixed(columnDimensionProjection.maxU)}
                        placeholder="Sem limite"
                        disabled={gridOnly}
                        inputProps={{ 'data-column-property': 'max-mm' }}
                        onCommit={(value) => runColumnNumber('max', value === null ? '' : String(value))}
                      />
                    </label>
                  </div>
                )}
                <div className="vnext-dimension-actions">
                  <button type="button" data-editor-action="equalize-columns"
                    disabled={gridOnly || selectedColumnAxisIds.length < 2}
                    onClick={runEqualizeColumns}>Igualar larguras</button>
                  <button type="button" data-editor-action="move-column-left"
                    disabled={gridOnly || selectedColumnAxisIds.length !== 1 || tableObject.table.columns[0]?.id === selectedColumnAxisIds[0]}
                    onClick={() => runAxisReorder('column', -1)}>Mover para esquerda</button>
                  <button type="button" data-editor-action="move-column-right"
                    disabled={gridOnly || selectedColumnAxisIds.length !== 1 || tableObject.table.columns.at(-1)?.id === selectedColumnAxisIds[0]}
                    onClick={() => runAxisReorder('column', 1)}>Mover para direita</button>
                </div>
              </section>
            </>
          )}

          {!locked && tableSelection && (
            <>
              <div className="vnext-divider" />
              <section className="vnext-image-cell-panel" data-image-cell-authoring="">
                <h3>Imagem da célula</h3>
                {!selectedSemanticCell ? (
                  <p>Selecione exatamente uma célula para inserir ou editar uma imagem.</p>
                ) : (
                  <>
                    <label>
                      <span>Imagem do catálogo</span>
                      <select
                        data-image-cell-asset=""
                        value={imageCellAssetChoice}
                        disabled={tableSemanticDisabled}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onChange={(event) => setImageCellAssetChoice(event.target.value)}
                      >
                        <option value="">Escolha uma imagem</option>
                        {assets.map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.name} — {asset.alt}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Ajuste</span>
                      <select
                        data-image-cell-fit=""
                        value={imageCellFit}
                        disabled={tableSemanticDisabled}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onChange={(event) => setImageCellFit(event.target.value as 'contain' | 'cover')}
                      >
                        <option value="contain">Imagem inteira</option>
                        <option value="cover">Preencher a célula</option>
                      </select>
                    </label>
                    <label>
                      <span>Largura</span>
                      <TableDecimalField
                        name="Largura da imagem"
                        unit="mm"
                        example="20"
                        live
                        value={imageSizeValue(imageCellWidthMm)}
                        disabled={tableSemanticDisabled}
                        describedBy={tableSemanticDisabledReasonId}
                        inputProps={{ 'data-image-cell-width': '' }}
                        onCommit={(value) => { if (value !== null) setImageCellWidthMm(String(value)); }}
                      />
                    </label>
                    <label>
                      <span>Altura</span>
                      <TableDecimalField
                        name="Altura da imagem"
                        unit="mm"
                        example="20"
                        live
                        value={imageSizeValue(imageCellHeightMm)}
                        disabled={tableSemanticDisabled}
                        describedBy={tableSemanticDisabledReasonId}
                        inputProps={{ 'data-image-cell-height': '' }}
                        onCommit={(value) => { if (value !== null) setImageCellHeightMm(String(value)); }}
                      />
                    </label>
                    <div className="vnext-cell-edit-actions">
                      <button
                        type="button"
                        data-editor-action="set-cell-image"
                        disabled={tableSemanticDisabled || !imageCellAssetChoice}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onClick={runImageCellSet}
                      >
                        {selectedSemanticCell.content.type === 'image' ? 'Substituir imagem' : 'Inserir imagem'}
                      </button>
                      <button
                        type="button"
                        data-editor-action="upload-cell-image"
                        disabled={tableSemanticDisabled || !canUploadCellImage}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onClick={runImageCellUpload}
                      >
                        Enviar foto…
                      </button>
                      <button
                        type="button"
                        data-editor-action="clear-cell-image"
                        disabled={tableSemanticDisabled || selectedSemanticCell.content.type !== 'image'}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onClick={runImageCellClear}
                      >
                        Remover imagem
                      </button>
                    </div>
                    {tableSemanticDisabledReason && <p>{tableSemanticDisabledReason}</p>}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
