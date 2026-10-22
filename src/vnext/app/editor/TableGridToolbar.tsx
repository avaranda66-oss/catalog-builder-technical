import React from 'react';
import { EDITING_STRUCTURE_REASON, removeAxisLabel } from '../../editor/table-axis-authoring';
import type { TableSelection } from '../../editor/table-selection';

/** The editor modes, as EditorWorkspace keeps them. */
export type TableAuthoringMode = 'select' | 'text-edit' | 'table-grid' | 'cell-edit';

/** Whether a merge or unmerge can run now, and the plain reason when it cannot. */
export interface TableMergeAvailability {
  enabled: boolean;
  reason?: string;
}

export interface TableGridToolbarProps {
  simple: boolean;
  mode: TableAuthoringMode;
  tableSelection: TableSelection | null;
  /** "Opções da tabela" (simple mode only). */
  tableOptionsOpen: boolean;
  setTableOptionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Why row or column actions are unavailable; `undefined` means they can run. */
  rowAxisReason?: string;
  columnAxisReason?: string;
  /** FR-34: rows and columns the current cell, range or side selection touches (names "Excluir 3 linhas"). */
  rowAxisCount?: number;
  columnAxisCount?: number;
  /** Why the selected rows or columns cannot be removed (the last one stays); falls back to the axis reason. */
  removeRowReason?: string;
  removeColumnReason?: string;
  runTableAxisInsert(axis: 'row' | 'column', position: 'before' | 'after', count?: number): void;
  runTableAxisRemove(axis: 'row' | 'column'): void;
  tableRowsToInsert: string;
  setTableRowsToInsert(value: string): void;
  currentMergeEligibility: TableMergeAvailability;
  currentUnmergeEligibility: TableMergeAvailability;
  runTableMerge(): void;
  runTableUnmerge(): void;
  tableRangeExtensionArmed: boolean;
  toggleTableRangeExtension(): void;
  runTableBulkClear(): void;
  setMarkerPanelOpen(open: boolean): void;
  runVisibleTableCopy(): unknown;
  setTablePasteFallbackOpen: React.Dispatch<React.SetStateAction<boolean>>;
  leaveTableGrid(): unknown;
}

/**
 * FR-92 (costura 2.0): the bar above the page while a table grid is being edited (rows, columns,
 * merge, copy and paste). Every action is still decided in EditorWorkspace.
 * FR-34 (2D): rows and columns follow the selected cell or range, "Excluir 3 linhas" removes them all at once, and
 * the duplicated "Legenda" button is gone ("Notas e legenda" opens the same panel).
 */
export function TableGridToolbar({
  simple,
  mode,
  tableSelection,
  tableOptionsOpen,
  setTableOptionsOpen,
  rowAxisReason,
  columnAxisReason,
  rowAxisCount = 1,
  columnAxisCount = 1,
  removeRowReason,
  removeColumnReason,
  runTableAxisInsert,
  runTableAxisRemove,
  tableRowsToInsert,
  setTableRowsToInsert,
  currentMergeEligibility,
  currentUnmergeEligibility,
  runTableMerge,
  runTableUnmerge,
  tableRangeExtensionArmed,
  toggleTableRangeExtension,
  runTableBulkClear,
  setMarkerPanelOpen,
  runVisibleTableCopy,
  setTablePasteFallbackOpen,
  leaveTableGrid,
}: TableGridToolbarProps) {
  // FR-34: rows and columns come from the selected cell or range; a cell being edited is finished first.
  const structureLocked = mode !== 'table-grid';
  const structureReason = (reason?: string) => mode === 'cell-edit' ? EDITING_STRUCTURE_REASON : reason;
  const rowRemoval = rowAxisReason ?? removeRowReason;
  const columnRemoval = columnAxisReason ?? removeColumnReason;
  // A disabled button cannot take the focus: its reason is also written under the row and column buttons.
  const noteId = 'vnext-table-axis-toolbar-note';
  const notes = [...new Set([structureReason(rowRemoval), structureReason(columnRemoval)].filter((note): note is string => Boolean(note)))];
  const noteFor = (reason: string | undefined) => notes.length > 0 && (structureLocked || reason) ? noteId : undefined;
  return (
    <div className="vnext-table-axis-toolbar" data-table-axis-toolbar="" aria-label="Estrutura da tabela">
      <strong>{simple ? 'Editar tabela' : 'Grade da tabela'}</strong>
      {simple && <p className="vnext-disclosure-help">Clique em uma célula para selecionar. Dê dois cliques ou pressione Enter para editar. Linhas e colunas ficam no painel ao lado, em Estrutura; mesclagens ficam em Opções da tabela.</p>}
      {simple && (
        <button
          type="button"
          className="vnext-table-options-toggle"
          data-editor-action="toggle-table-options"
          aria-expanded={tableOptionsOpen}
          onClick={() => setTableOptionsOpen((open) => !open)}
        >
          {tableOptionsOpen ? 'Ocultar opções da tabela' : 'Opções da tabela'}
        </button>
      )}
      {(!simple || tableOptionsOpen) && <>
      <div className="vnext-tool-group" aria-label="Ações de linha">
        <button type="button" data-editor-action="insert-row-before" disabled={structureLocked || Boolean(rowAxisReason)} title={structureReason(rowAxisReason)} aria-describedby={noteFor(rowAxisReason)} onClick={() => runTableAxisInsert('row', 'before')}>Linha acima</button>
        <button type="button" data-editor-action="insert-row-after" disabled={structureLocked || Boolean(rowAxisReason)} title={structureReason(rowAxisReason)} aria-describedby={noteFor(rowAxisReason)} onClick={() => runTableAxisInsert('row', 'after')}>Linha abaixo</button>
        <button type="button" data-editor-action="remove-row" disabled={structureLocked || Boolean(rowRemoval)} title={structureReason(rowRemoval)} aria-describedby={noteFor(rowRemoval)} onClick={() => runTableAxisRemove('row')}>{removeAxisLabel('row', rowAxisCount)}</button>
      </div>
      <div className="vnext-tool-group" aria-label="Adicionar várias linhas">
        <label>Quantidade de linhas <input type="number" min="1" max="100" step="1" aria-label="Quantidade de linhas para adicionar" data-table-row-count="" value={tableRowsToInsert} onChange={event => setTableRowsToInsert(event.target.value)} style={{ width: '64px' }} /></label>
        <button type="button" data-editor-action="insert-rows-after" disabled={structureLocked || Boolean(rowAxisReason)} title={structureReason(rowAxisReason)} aria-describedby={noteFor(rowAxisReason)} onClick={() => runTableAxisInsert('row', 'after', Number(tableRowsToInsert))}>Adicionar linhas abaixo</button>
      </div>
      <div className="vnext-tool-group" aria-label="Ações de coluna">
        <button type="button" data-editor-action="insert-column-before" disabled={structureLocked || Boolean(columnAxisReason)} title={structureReason(columnAxisReason)} aria-describedby={noteFor(columnAxisReason)} onClick={() => runTableAxisInsert('column', 'before')}>Coluna à esquerda</button>
        <button type="button" data-editor-action="insert-column-after" disabled={structureLocked || Boolean(columnAxisReason)} title={structureReason(columnAxisReason)} aria-describedby={noteFor(columnAxisReason)} onClick={() => runTableAxisInsert('column', 'after')}>Coluna à direita</button>
        <button type="button" data-editor-action="remove-column" disabled={structureLocked || Boolean(columnRemoval)} title={structureReason(columnRemoval)} aria-describedby={noteFor(columnRemoval)} onClick={() => runTableAxisRemove('column')}>{removeAxisLabel('column', columnAxisCount)}</button>
      </div>
      <div className="vnext-tool-group" aria-label="Mesclagem de células">
        <button
          type="button"
          data-editor-action="merge-cells"
          disabled={!currentMergeEligibility.enabled}
          title={currentMergeEligibility.reason}
          onClick={runTableMerge}
        >Mesclar células</button>
        <button
          type="button"
          data-editor-action="unmerge-cell"
          disabled={!currentUnmergeEligibility.enabled}
          title={currentUnmergeEligibility.reason}
          onClick={runTableUnmerge}
        >Desmesclar células</button>
      </div>
      <div className="vnext-tool-group" aria-label="Conteúdo em lote">
        <button
          type="button"
          data-editor-action="extend-table-selection"
          aria-pressed={tableRangeExtensionArmed}
          className={tableRangeExtensionArmed ? 'is-active' : undefined}
          disabled={mode !== 'table-grid' || !tableSelection || tableSelection.kind === 'table'}
          onClick={toggleTableRangeExtension}
        >Estender seleção</button>
        <button type="button" data-editor-action="clear-table-cells" disabled={mode !== 'table-grid'} onClick={runTableBulkClear}>Limpar conteúdo</button>
        <button type="button" data-editor-action="marker-panel" disabled={mode !== 'table-grid'} onClick={() => setMarkerPanelOpen(true)}>Notas e legenda</button>
      </div>
      </>}
      <div className="vnext-tool-group" aria-label="Copiar e colar dados">
        <button type="button" data-editor-action="copy-table-cells" disabled={mode !== 'table-grid'} onClick={() => { void runVisibleTableCopy(); }}>Copiar</button>
        <button type="button" data-editor-action="paste-table-cells" disabled={mode !== 'table-grid'} onClick={() => setTablePasteFallbackOpen((open) => !open)}>Colar</button>
      </div>
      <button type="button" className="vnext-leave-table-grid" data-editor-action="leave-table-grid" onClick={() => leaveTableGrid()}>Voltar ao objeto</button>
      {/* Last, on a line of its own, and always there: the note comes and goes with the selection and the cell editing
          (the click that ends it is the same click on "Desmesclar", "Voltar ao objeto"...), so the line keeps its
          height when it is empty and nothing under the pointer, nor the page below the bar, ever moves. */}
      {(!simple || tableOptionsOpen) && (
        <p id={noteId} className="vnext-disclosure-help vnext-table-axis-note" data-table-axis-note={notes.length > 0 ? '' : undefined}>{notes.join(' ')}</p>
      )}
    </div>
  );
}

export interface TableGridPasteFallbackProps {
  tablePasteFallbackText: string;
  setTablePasteFallbackText(value: string): void;
  setTablePasteFallbackOpen(open: boolean): void;
  applyNativePasteFallback(): void;
}

/** FR-92 (costura 2.0): the "Colar" area opened from the grid bar, where spreadsheet data is pasted by hand. */
export function TableGridPasteFallback({
  tablePasteFallbackText,
  setTablePasteFallbackText,
  setTablePasteFallbackOpen,
  applyNativePasteFallback,
}: TableGridPasteFallbackProps) {
  return (
    <div className="vnext-table-paste-fallback" data-table-paste-fallback="" role="region" aria-label="Colar dados na tabela">
      <p className="vnext-disclosure-help">Selecione uma célula inicial para colar uma área da planilha. Os dados devem caber nas linhas e colunas existentes. Use Desfazer para recuperar o conteúdo anterior.</p>
      <label>
        <span>Cole aqui dados do Excel ou do Google Planilhas</span>
        <textarea
          data-table-paste-textarea=""
          value={tablePasteFallbackText}
          onChange={(event) => setTablePasteFallbackText(event.target.value)}
          placeholder={'Ex.: Produto\tFaixa\nTA-25N\t-25 °C a 140 °C'}
        />
      </label>
      <div className="vnext-cell-edit-actions">
        <button type="button" data-editor-action="apply-native-table-paste" onClick={applyNativePasteFallback}>Aplicar conteúdo colado</button>
        <button type="button" data-editor-action="cancel-native-table-paste" onClick={() => { setTablePasteFallbackOpen(false); setTablePasteFallbackText(''); }}>Cancelar</button>
      </div>
    </div>
  );
}
