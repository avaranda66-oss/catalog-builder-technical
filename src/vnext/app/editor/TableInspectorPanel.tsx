import React from 'react';
import { projectEditableRichText, type CellPropertyPatch } from '../../application';
import type { CatalogDocument, Cell, TableObject } from '../../domain';
import type { TableAnnotation, TableLegendEntry } from '../../domain/editorial-model';
import { formatDecimalPtBr } from '../../editor/decimal-ptbr';
import type {
  ColumnDimensionProjection,
  prepareRowsSetProperties,
  RowDimensionProjection,
} from '../../editor/table-dimension-authoring';
import type { TableFitHeightPreparation } from '../../editor/table-fit-height-authoring';
import { legendUsageCount } from '../../editor/table-marker-authoring';
import type { TableSelection } from '../../editor/table-selection';
import { annotationUsageCount } from '../../editor/table-semantic-authoring';
import type { TableStyleScope } from '../../editor/table-style-authoring';
import { TableStyleInspector } from '../TableStyleInspector';
import type { TableAuthoringMode } from './TableGridToolbar';

type TableStyleInspectorProps = React.ComponentProps<typeof TableStyleInspector>;
type CellStyleKey = keyof NonNullable<Cell['style']>;
type CellEdge = 'top' | 'right' | 'bottom' | 'left';

export interface TableInspectorPanelProps {
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

  // Colors, borders and presets (TableStyleInspector)
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
  runTablePreset: TableStyleInspectorProps['onPreset'];
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

  // Notes, markers and legend
  newAnnotationKind: 'caption' | 'note' | 'footnote';
  setNewAnnotationKind(kind: 'caption' | 'note' | 'footnote'): void;
  newAnnotationTarget: 'TABLE' | 'CELL';
  setNewAnnotationTarget(target: 'TABLE' | 'CELL'): void;
  newAnnotationText: string;
  setNewAnnotationText(value: string): void;
  runAnnotationCreate(): void;
  runAnnotationUpdate(annotation: TableAnnotation, plainText: string): void;
  runAnnotationReference(annotation: TableAnnotation, scope: 'TABLE' | 'CELL', mode: 'attach' | 'detach'): void;
  runAnnotationReorder(annotationId: string, direction: 'up' | 'down'): void;
  runAnnotationRemove(annotation: TableAnnotation): void;
  markerLegendChoice: string;
  setMarkerLegendChoice(value: string): void;
  runExistingMarkerAssignment(): void;
  runMarkerDetach(): void;
  newMarkerCode: string;
  setNewMarkerCode(value: string): void;
  newMarkerText: string;
  setNewMarkerText(value: string): void;
  runNewMarkerAssignment(): void;
  runLegendCreateOnly(): void;
  runLegendUpdate(entry: TableLegendEntry, markerCode: string, plainText?: string): void;
  runLegendRemove(entry: TableLegendEntry): void;
  runLegendReorder(legendEntryId: string, direction: 'up' | 'down'): void;
  locateLegendUsage(legendEntryId: string): void;

  // "Propriedades da seleção"
  commonCellStyleValue<K extends CellStyleKey>(key: K): NonNullable<Cell['style']>[K] | undefined;
  commonWrapPolicy?: NonNullable<Cell['contentPresentation']>['wrapPolicy'];
  propertySelectionKey: string;
  runCellPropertyPatch(patch: CellPropertyPatch): void;
  commitCellColor(key: 'color' | 'background', raw: string): void;
  cellPaddingText(edge: CellEdge): string;
  commitCellPadding(edge: CellEdge, input: HTMLInputElement): void;
}

function LegendEditorRow({
  entry,
  usageCount,
  canMoveUp,
  canMoveDown,
  mutationDisabled,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onLocate,
}: {
  entry: TableLegendEntry;
  usageCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  mutationDisabled: boolean;
  onUpdate(markerCode: string, plainText?: string): void;
  onRemove(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onLocate(): void;
}) {
  const editableText = projectEditableRichText(entry.text);
  const [markerCode, setMarkerCode] = React.useState(entry.markerCode);
  const [plainText, setPlainText] = React.useState(editableText ?? '');
  React.useEffect(() => {
    setMarkerCode(entry.markerCode);
    setPlainText(projectEditableRichText(entry.text) ?? '');
  }, [entry]);
  return (
    <div className="vnext-legend-entry-editor" data-legend-entry-id={entry.id}>
      <div className="vnext-legend-entry-heading">
        <strong>{entry.markerCode}</strong>
        <span>{usageCount} uso(s)</span>
      </div>
      <label>
        <span>Código do marcador</span>
        <input data-legend-marker-code={entry.id} value={markerCode} onChange={(event) => setMarkerCode(event.target.value)} />
      </label>
      <label>
        <span>Descrição</span>
        <textarea
          data-legend-text={entry.id}
          value={plainText}
          disabled={editableText === null}
          onChange={(event) => setPlainText(event.target.value.replace(/\r\n?/g, '\n'))}
        />
      </label>
      {editableText === null && <p>Texto avançado preservado; edição simples bloqueada.</p>}
      <div className="vnext-cell-edit-actions">
        <button type="button" data-editor-action="update-legend" disabled={mutationDisabled} onClick={() => onUpdate(markerCode, editableText === null ? undefined : plainText)}>
          Atualizar legenda
        </button>
        <button type="button" data-editor-action="move-legend-up" disabled={mutationDisabled || !canMoveUp} onClick={onMoveUp}>Mover para cima</button>
        <button type="button" data-editor-action="move-legend-down" disabled={mutationDisabled || !canMoveDown} onClick={onMoveDown}>Mover para baixo</button>
        <button type="button" data-editor-action="locate-legend-usage" disabled={usageCount === 0} onClick={onLocate}>
          Localizar usos
        </button>
        <button type="button" data-editor-action="remove-legend" disabled={mutationDisabled || usageCount > 0} title={usageCount > 0 ? `Usado por ${usageCount} célula(s).` : undefined} onClick={onRemove}>
          Excluir legenda
        </button>
      </div>
    </div>
  );
}

/**
 * FR-92 (costura 2.0): everything the side panel shows for a selected table (title, height,
 * appearance, rows, columns, cells, image cell, notes and legend). Moved out of EditorWorkspace
 * without changing behavior or texts; every change to the catalog is still decided there.
 */
export function TableInspectorPanel({
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
  runTablePreset,
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
  newAnnotationKind,
  setNewAnnotationKind,
  newAnnotationTarget,
  setNewAnnotationTarget,
  newAnnotationText,
  setNewAnnotationText,
  runAnnotationCreate,
  runAnnotationUpdate,
  runAnnotationReference,
  runAnnotationReorder,
  runAnnotationRemove,
  markerLegendChoice,
  setMarkerLegendChoice,
  runExistingMarkerAssignment,
  runMarkerDetach,
  newMarkerCode,
  setNewMarkerCode,
  newMarkerText,
  setNewMarkerText,
  runNewMarkerAssignment,
  runLegendCreateOnly,
  runLegendUpdate,
  runLegendRemove,
  runLegendReorder,
  locateLegendUsage,
  commonCellStyleValue,
  commonWrapPolicy,
  propertySelectionKey,
  runCellPropertyPatch,
  commitCellColor,
  cellPaddingText,
  commitCellPadding,
}: TableInspectorPanelProps) {
  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-table-semantic-title" data-table-semantic-title="" data-table-title-session="">
        <h3>Título da tabela</h3>
        {tableObject.table.title && projectEditableRichText(tableObject.table.title) === null ? (
          <p data-table-title-readonly="">
            Este título possui RichText avançado e foi preservado sem achatamento. A edição avançada pertence à etapa profissional de RichText.
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
        {tableSemanticDisabledReason && tableSemanticDisabledReasonId && (
          <p id={tableSemanticDisabledReasonId} data-table-semantic-disabled-reason="">
            {tableSemanticDisabledReason}
          </p>
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
          <button
            type="button"
            data-editor-action="open-table-semantics"
            disabled={tableSemanticDisabled}
            aria-describedby={tableSemanticDisabledReasonId}
            onClick={() => {
              if (mode === 'select') startTableGrid(tableObject);
              setMarkerPanelOpen(true);
            }}
          >
            Notas e legenda
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
        <p className="vnext-disclosure-help">Altura, dimensões, cores e bordas.</p>
        </>
      )}
      {(!simple || tableInspectorAdvancedOpen) && <div id="vnext-table-advanced-details" data-table-advanced-details="">
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
            A tabela é mais alta que uma página A4. Ajustar altura iguala o quadro ao conteúdo, mas não resolve a publicação em uma única página.
          </p>
        )}
      </section>
      </div>}
      {tableStyleScope && (!simple || tableInspectorAdvancedOpen) && (
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
            onPreset={runTablePreset}
            onAnnotationGap={runAnnotationGap}
          />
        </>
      )}
      {!tableObject.locked && tableSelection && rowDimensionProjection && (!simple || tableInspectorAdvancedOpen) && (
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
                disabled={mode !== 'table-grid'}
                aria-describedby={mode !== 'table-grid' ? `table-row-dimension-disabled-${tableObject.id}` : undefined}
                onChange={(event) => runRowProperties(
                  { role: event.target.value as 'header' | 'body' | 'section' },
                  'Tipo da linha atualizado.'
                )}
              >
                {rowDimensionProjection.role === 'mixed' && <option value="mixed" disabled>Misto</option>}
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
                disabled={mode !== 'table-grid'}
                onChange={(event) => runRowHeightMode(event.target.value as 'AUTO' | 'MIN_MM' | 'FIXED_MM')}
              >
                {rowDimensionProjection.heightMode === 'mixed' && <option value="mixed" disabled>Misto</option>}
                <option value="AUTO">Automática</option>
                <option value="MIN_MM">Mínima</option>
                <option value="FIXED_MM">Exata</option>
              </select>
            </label>
            {(effectiveRowHeightMode === 'MIN_MM' || effectiveRowHeightMode === 'FIXED_MM') && (
              <label>
                <span>Valor</span>
                <div className="vnext-dimension-value">
                  <input
                    key={rowDimensionProjection.rowIds.join(':') + ':' + String(rowDimensionProjection.valueU)}
                    data-row-property="height-mm"
                    type="text"
                    inputMode="decimal"
                    defaultValue={typeof rowDimensionProjection.valueU === 'number' ? String(rowDimensionProjection.valueU / 10_000) : ''}
                    placeholder={rowDimensionProjection.valueU === 'mixed' ? 'Misto' : undefined}
                    disabled={mode !== 'table-grid'}
                    onBlur={(event) => runRowHeightValue(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />
                  <span>mm</span>
                </div>
              </label>
            )}
            <div className="vnext-dimension-actions">
              <button type="button" data-editor-action="row-height-auto"
                disabled={mode !== 'table-grid'} onClick={() => runRowHeightMode('AUTO')}>
                Voltar para automática
              </button>
              <button type="button" data-editor-action="move-row-up"
                disabled={mode !== 'table-grid' || selectedRowAxisIds.length !== 1 || tableObject?.table.rows[0]?.id === selectedRowAxisIds[0]}
                onClick={() => runAxisReorder('row', -1)}>Mover para cima</button>
              <button type="button" data-editor-action="move-row-down"
                disabled={mode !== 'table-grid' || selectedRowAxisIds.length !== 1 || tableObject?.table.rows.at(-1)?.id === selectedRowAxisIds[0]}
                onClick={() => runAxisReorder('row', 1)}>Mover para baixo</button>
            </div>
          </section>
        </>
      )}
      {!tableObject.locked && tableSelection && columnDimensionProjection && (!simple || tableInspectorAdvancedOpen) && (
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
                disabled={mode !== 'table-grid'}
                onChange={(event) => runColumnMode(event.target.value as 'fixed' | 'flex')}
              >
                {columnDimensionProjection.widthMode === 'mixed' && <option value="mixed" disabled>Misto</option>}
                <option value="flex">Flexível</option>
                <option value="fixed">Fixa</option>
              </select>
            </label>
            {columnDimensionProjection.widthMode === 'fixed' && (
              <label>
                <span>Largura fixa</span>
                <div className="vnext-dimension-value">
                  <input
                    key={columnDimensionProjection.columnIds.join(':') + ':' + String(columnDimensionProjection.fixedWidthU)}
                    data-column-property="fixed-mm"
                    type="text"
                    inputMode="decimal"
                    defaultValue={typeof columnDimensionProjection.fixedWidthU === 'number' ? String(columnDimensionProjection.fixedWidthU / 10_000) : ''}
                    placeholder={columnDimensionProjection.fixedWidthU === 'mixed' ? 'Misto' : undefined}
                    disabled={mode !== 'table-grid'}
                    onBlur={(event) => runColumnNumber('fixed', event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />
                  <span>mm</span>
                </div>
              </label>
            )}
            <button
              type="button"
              className="vnext-inspector-action"
              data-editor-action="toggle-column-dimension-advanced"
              aria-expanded={columnDimensionsAdvancedOpen}
              onClick={() => setColumnDimensionsAdvancedOpen((open) => !open)}
            >
              {columnDimensionsAdvancedOpen ? 'Ocultar avançado' : 'Avançado'}
            </button>
            {columnDimensionsAdvancedOpen && (
              <div className="vnext-dimension-advanced" data-column-dimension-advanced="">
                {columnDimensionProjection.widthMode === 'flex' && (
                  <label>
                    <span>Peso flexível</span>
                    <input
                      key={columnDimensionProjection.columnIds.join(':') + ':weight:' + String(columnDimensionProjection.flexWeight)}
                      data-column-property="weight"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={typeof columnDimensionProjection.flexWeight === 'number' ? columnDimensionProjection.flexWeight : ''}
                      placeholder={columnDimensionProjection.flexWeight === 'mixed' ? 'Misto' : undefined}
                      disabled={mode !== 'table-grid'}
                      onBlur={(event) => runColumnNumber('weight', event.target.value)}
                    />
                  </label>
                )}
                <label>
                  <span>Mínimo (mm)</span>
                  <input
                    key={columnDimensionProjection.columnIds.join(':') + ':min:' + String(columnDimensionProjection.minU)}
                    data-column-property="min-mm"
                    type="text"
                    inputMode="decimal"
                    defaultValue={typeof columnDimensionProjection.minU === 'number' ? String(columnDimensionProjection.minU / 10_000) : ''}
                    placeholder={columnDimensionProjection.minU === 'mixed' ? 'Misto' : undefined}
                    disabled={mode !== 'table-grid'}
                    onBlur={(event) => runColumnNumber('min', event.target.value)}
                  />
                </label>
                <label>
                  <span>Máximo (mm)</span>
                  <input
                    key={columnDimensionProjection.columnIds.join(':') + ':max:' + String(columnDimensionProjection.maxU)}
                    data-column-property="max-mm"
                    type="text"
                    inputMode="decimal"
                    defaultValue={typeof columnDimensionProjection.maxU === 'number' ? String(columnDimensionProjection.maxU / 10_000) : ''}
                    placeholder={columnDimensionProjection.maxU === 'mixed' ? 'Misto' : 'Sem limite'}
                    disabled={mode !== 'table-grid'}
                    onBlur={(event) => runColumnNumber('max', event.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="vnext-dimension-actions">
              <button type="button" data-editor-action="equalize-columns"
                disabled={mode !== 'table-grid' || selectedColumnAxisIds.length < 2}
                onClick={runEqualizeColumns}>Igualar larguras</button>
              <button type="button" data-editor-action="move-column-left"
                disabled={mode !== 'table-grid' || selectedColumnAxisIds.length !== 1 || tableObject?.table.columns[0]?.id === selectedColumnAxisIds[0]}
                onClick={() => runAxisReorder('column', -1)}>Mover para esquerda</button>
              <button type="button" data-editor-action="move-column-right"
                disabled={mode !== 'table-grid' || selectedColumnAxisIds.length !== 1 || tableObject?.table.columns.at(-1)?.id === selectedColumnAxisIds[0]}
                onClick={() => runAxisReorder('column', 1)}>Mover para direita</button>
            </div>
          </section>
        </>
      )}
      {!tableObject.locked && tableSelection && (
        <>
          <div className="vnext-divider" />
          <section className="vnext-cell-inspector" data-table-cell-inspector="">
            <h3>Células da tabela</h3>
            <p>{selectedAnchorCells.length} célula(s) selecionada(s).</p>
            {!cellEditing && (
              <button type="button" className="vnext-inspector-action" data-editor-action="edit-cell-content"
                disabled={selectedAnchorCells.length !== 1} onClick={() => startCellEdit()}>
                Editar conteúdo
              </button>
            )}
            {cellEditor}

            {(!simple || tableInspectorAdvancedOpen) && <>
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
                      <option value="contain">Conter</option>
                      <option value="cover">Preencher</option>
                    </select>
                  </label>
                  <label>
                    <span>Largura</span>
                    <div>
                      <input
                        data-image-cell-width=""
                        type="text"
                        inputMode="decimal"
                        value={imageCellWidthMm}
                        disabled={tableSemanticDisabled}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onChange={(event) => setImageCellWidthMm(event.target.value)}
                      />
                      <span>mm</span>
                    </div>
                  </label>
                  <label>
                    <span>Altura</span>
                    <div>
                      <input
                        data-image-cell-height=""
                        type="text"
                        inputMode="decimal"
                        value={imageCellHeightMm}
                        disabled={tableSemanticDisabled}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onChange={(event) => setImageCellHeightMm(event.target.value)}
                      />
                      <span>mm</span>
                    </div>
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
                      Upload
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
            </>}

            {markerPanelOpen && tableObject && !tableObject.locked && (
              <>
                <div className="vnext-divider" />
                <section className="vnext-marker-legend-panel" data-marker-legend-panel="">
                  <div className="vnext-legend-entry-heading">
                    <h3>Notas, marcadores e legenda</h3>
                    <button type="button" data-editor-action="close-marker-panel" onClick={() => setMarkerPanelOpen(false)}>Fechar</button>
                  </div>
                  <p>Notas, legendas e marcadores usam as superfícies semânticas canônicas desta tabela.</p>
                  <fieldset className="vnext-marker-create" data-annotation-create="">
                    <legend>Adicionar anotação</legend>
                    <label>
                      <span>Tipo</span>
                      <select
                        data-annotation-kind=""
                        value={newAnnotationKind}
                        disabled={tableSemanticDisabled}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onChange={(event) => {
                          const kind = event.target.value as 'caption' | 'note' | 'footnote';
                          setNewAnnotationKind(kind);
                          if (kind === 'caption') setNewAnnotationTarget('TABLE');
                        }}
                      >
                        <option value="caption">Legenda da tabela</option>
                        <option value="note">Nota</option>
                        <option value="footnote">Nota de rodapé</option>
                      </select>
                    </label>
                    <label>
                      <span>Aplicar a</span>
                      <select
                        data-annotation-target=""
                        value={newAnnotationKind === 'caption' ? 'TABLE' : newAnnotationTarget}
                        disabled={tableSemanticDisabled || newAnnotationKind === 'caption'}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onChange={(event) => setNewAnnotationTarget(event.target.value as 'TABLE' | 'CELL')}
                      >
                        <option value="TABLE">Tabela</option>
                        <option value="CELL" disabled={!selectedSemanticCell}>Célula selecionada</option>
                      </select>
                    </label>
                    <label>
                      <span>Texto</span>
                      <textarea
                        data-new-annotation-text=""
                        value={newAnnotationText}
                        disabled={tableSemanticDisabled}
                        aria-describedby={tableSemanticDisabledReasonId}
                        onChange={(event) => setNewAnnotationText(event.target.value.replace(/\r\n?/g, '\n'))}
                        placeholder="Texto técnico da anotação"
                      />
                    </label>
                    <button
                      type="button"
                      data-editor-action="create-annotation"
                      disabled={cellEditing || !newAnnotationText.trim() || (newAnnotationTarget === 'CELL' && newAnnotationKind !== 'caption' && !selectedSemanticCell)}
                      onClick={runAnnotationCreate}
                    >
                      Criar e aplicar
                    </button>
                  </fieldset>
                  <div className="vnext-legend-list" data-annotation-list="">
                    {tableObject.table.annotations.length === 0 ? (
                      <p>Nenhuma anotação criada.</p>
                    ) : tableObject.table.annotations.map((annotation, annotationIndex) => {
                      const editable = projectEditableRichText(annotation.text);
                      const tableAttached = (tableObject.table.annotationIds ?? []).includes(annotation.id);
                      const cellAttached = Boolean(selectedSemanticCell?.annotationIds?.includes(annotation.id));
                      const usageCount = annotationUsageCount(tableObject.table, annotation.id);
                      return (
                        <div key={annotation.id} className="vnext-legend-entry-editor" data-annotation-entry-id={annotation.id}>
                          <div className="vnext-legend-entry-heading">
                            <strong>{annotation.kind === 'caption' ? 'Legenda' : annotation.kind === 'note' ? 'Nota' : 'Nota de rodapé'}</strong>
                            <span>{usageCount} referência(s)</span>
                          </div>
                          <label>
                            <span>Texto</span>
                            <textarea
                              key={annotation.id + ':' + JSON.stringify(annotation.text)}
                              data-annotation-text={annotation.id}
                              defaultValue={editable ?? ''}
                              disabled={editable === null || cellEditing}
                              onBlur={(event) => {
                                if (editable !== null && event.target.value !== editable) runAnnotationUpdate(annotation, event.target.value);
                              }}
                            />
                          </label>
                          {editable === null && (
                            <p>RichText avançado preservado; edição simples indisponível nesta etapa.</p>
                          )}
                          <div className="vnext-cell-edit-actions">
                            <button type="button" data-editor-action="annotation-table-reference"
                              disabled={cellEditing}
                              onClick={() => runAnnotationReference(annotation, 'TABLE', tableAttached ? 'detach' : 'attach')}>
                              {tableAttached ? 'Remover da tabela' : 'Aplicar à tabela'}
                            </button>
                            {annotation.kind !== 'caption' && (
                              <button type="button" data-editor-action="annotation-cell-reference"
                                disabled={cellEditing || !selectedSemanticCell}
                                onClick={() => runAnnotationReference(annotation, 'CELL', cellAttached ? 'detach' : 'attach')}>
                                {cellAttached ? 'Remover da célula' : 'Aplicar à célula'}
                              </button>
                            )}
                            <button type="button" data-editor-action="move-annotation-up"
                              disabled={cellEditing || annotationIndex === 0}
                              onClick={() => runAnnotationReorder(annotation.id, 'up')}>Mover para cima</button>
                            <button type="button" data-editor-action="move-annotation-down"
                              disabled={cellEditing || annotationIndex === tableObject.table.annotations.length - 1}
                              onClick={() => runAnnotationReorder(annotation.id, 'down')}>Mover para baixo</button>
                            <button type="button" data-editor-action="remove-annotation"
                              disabled={cellEditing || usageCount > 0}
                              title={usageCount > 0 ? 'Remova as referências antes de excluir.' : undefined}
                              onClick={() => runAnnotationRemove(annotation)}>Excluir</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="vnext-divider" />
                  <p>O marcador referencia uma entrada da legenda desta tabela.</p>
                  <label>
                    <span>Marcador existente</span>
                    <select data-marker-picker="" value={markerLegendChoice} onChange={(event) => setMarkerLegendChoice(event.target.value)}>
                      <option value="">Selecione um marcador</option>
                      {tableObject.table.legend.map((entry) => {
                        const text = projectEditableRichText(entry.text) ?? 'Descrição avançada';
                        const usage = legendUsageCount(tableObject.table, entry.id);
                        return <option key={entry.id} value={entry.id}>{entry.markerCode} — {text} ({usage} uso(s))</option>;
                      })}
                    </select>
                  </label>
                  <div className="vnext-cell-edit-actions">
                    <button type="button" data-editor-action="apply-existing-marker" disabled={!markerLegendChoice || mode !== 'table-grid'} onClick={runExistingMarkerAssignment}>Aplicar marcador</button>
                    <button type="button" data-editor-action="detach-marker" disabled={mode !== 'table-grid' || selectedAnchorCells.length === 0 || selectedAnchorCells.some((cell) => cell.content.type !== 'marker')} onClick={runMarkerDetach}>Remover marcador da célula</button>
                  </div>
                  <fieldset className="vnext-marker-create">
                    <legend>Novo marcador</legend>
                    <label>
                      <span>Código</span>
                      <input data-new-marker-code="" value={newMarkerCode} onChange={(event) => setNewMarkerCode(event.target.value)} placeholder="Ex.: *, †, A, 1" />
                    </label>
                    <label>
                      <span>Descrição</span>
                      <textarea data-new-marker-text="" value={newMarkerText} onChange={(event) => setNewMarkerText(event.target.value.replace(/\r\n?/g, '\n'))} placeholder="Descrição técnica da legenda" />
                    </label>
                    <div className="vnext-cell-edit-actions">
                      <button type="button" data-editor-action="create-and-assign-marker" disabled={mode !== 'table-grid'} onClick={runNewMarkerAssignment}>Criar e aplicar</button>
                      <button type="button" data-editor-action="create-legend" disabled={mode !== 'table-grid'} onClick={runLegendCreateOnly}>Criar legenda</button>
                    </div>
                  </fieldset>
                  <div className="vnext-legend-list" data-legend-list="">
                    {tableObject.table.legend.length === 0 ? (
                      <p>Nenhuma legenda criada.</p>
                    ) : tableObject.table.legend.map((entry, legendIndex) => (
                      <LegendEditorRow
                        key={entry.id}
                        entry={entry}
                        usageCount={legendUsageCount(tableObject.table, entry.id)}
                        canMoveUp={!cellEditing && legendIndex > 0}
                        canMoveDown={!cellEditing && legendIndex < tableObject.table.legend.length - 1}
                        mutationDisabled={cellEditing}
                        onUpdate={(markerCode, plainText) => runLegendUpdate(entry, markerCode, plainText)}
                        onRemove={() => runLegendRemove(entry)}
                        onMoveUp={() => runLegendReorder(entry.id, 'up')}
                        onMoveDown={() => runLegendReorder(entry.id, 'down')}
                        onLocate={() => locateLegendUsage(entry.id)}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {(!simple || tableInspectorAdvancedOpen) && <>
            <div className="vnext-divider" />
            <h3>Propriedades da seleção</h3>
            <label>
              <span>Alinhamento</span>
              <select data-cell-property="textAlign" value={String(commonCellStyleValue('textAlign') ?? '')}
                onChange={(event) => runCellPropertyPatch({
                  textAlign: event.target.value === '' ? null : event.target.value as 'left' | 'center' | 'right',
                })}>
                <option value="">Herdado</option><option value="left">Esquerda</option>
                <option value="center">Centro</option><option value="right">Direita</option>
              </select>
            </label>
            <label>
              <span>Peso</span>
              <select data-cell-property="fontWeight" value={String(commonCellStyleValue('fontWeight') ?? '')}
                onChange={(event) => runCellPropertyPatch({
                  fontWeight: event.target.value === '' ? null : Number(event.target.value) as 400 | 700,
                })}>
                <option value="">Herdado</option><option value="400">Normal</option><option value="700">Negrito</option>
              </select>
            </label>
            <label>
              <span>Quebra</span>
              <select data-cell-property="wrapPolicy" value={commonWrapPolicy ?? ''}
                onChange={(event) => runCellPropertyPatch({
                  wrapPolicy: event.target.value === '' ? null : event.target.value as 'wrap' | 'nowrap',
                })}>
                <option value="">Automático · Herdado</option><option value="wrap">Quebrar</option>
                <option value="nowrap">Não quebrar</option>
              </select>
            </label>
            <label>
              <span>Cor do texto</span>
              <input key={propertySelectionKey + ':color'} data-cell-property="color" type="text"
                defaultValue={String(commonCellStyleValue('color') ?? '')} placeholder="Herdado"
                onBlur={(event) => commitCellColor('color', event.target.value)} />
            </label>
            <label>
              <span>Fundo</span>
              <input key={propertySelectionKey + ':background'} data-cell-property="background" type="text"
                defaultValue={String(commonCellStyleValue('background') ?? '')} placeholder="Herdado"
                onBlur={(event) => commitCellColor('background', event.target.value)} />
            </label>
            <fieldset>
              <legend>Padding (mm)</legend>
              {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                <label key={edge}>
                  <span>{{ top: 'Superior', right: 'Direita', bottom: 'Inferior', left: 'Esquerda' }[edge]}</span>
                  <input
                    key={propertySelectionKey + ':padding:' + edge}
                    data-cell-padding={edge}
                    type="text"
                    inputMode="decimal"
                    defaultValue={cellPaddingText(edge)}
                    placeholder="Herdado"
                    onBlur={(event) => commitCellPadding(edge, event.target)}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />
                </label>
              ))}
              <button type="button" data-editor-action="reset-cell-padding"
                onClick={() => runCellPropertyPatch({ paddingMm: null })}>
                Redefinir todo padding
              </button>
            </fieldset>
            </>}
          </section>
        </>
      )}
    </>
  );
}
