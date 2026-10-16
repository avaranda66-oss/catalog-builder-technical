import React from 'react';
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
 * merge, copy and paste). Moved out of EditorWorkspace without changing behavior; every action is
 * still decided there.
 */
export function TableGridToolbar({
  simple,
  mode,
  tableSelection,
  tableOptionsOpen,
  setTableOptionsOpen,
  rowAxisReason,
  columnAxisReason,
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
  return (
    <div className="vnext-table-axis-toolbar" data-table-axis-toolbar="" aria-label="Estrutura da tabela">
      <strong>{simple ? 'Editar tabela' : 'Grade da tabela'}</strong>
      {simple && <p className="vnext-disclosure-help">Clique em uma célula para selecionar. Dê dois cliques ou pressione Enter para editar. Em Opções da tabela, organize linhas, colunas e mesclagens.</p>}
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
        <button type="button" data-editor-action="insert-row-before" disabled={mode !== 'table-grid' || Boolean(rowAxisReason)} title={mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : rowAxisReason} onClick={() => runTableAxisInsert('row', 'before')}>Linha antes</button>
        <button type="button" data-editor-action="insert-row-after" disabled={mode !== 'table-grid' || Boolean(rowAxisReason)} title={mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : rowAxisReason} onClick={() => runTableAxisInsert('row', 'after')}>Linha depois</button>
        <button type="button" data-editor-action="remove-row" disabled={mode !== 'table-grid' || Boolean(rowAxisReason)} title={mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : rowAxisReason} onClick={() => runTableAxisRemove('row')}>Remover linha</button>
      </div>
      <div className="vnext-tool-group" aria-label="Adicionar várias linhas">
        <label>Quantidade de linhas <input type="number" min="1" max="100" step="1" aria-label="Quantidade de linhas para adicionar" data-table-row-count="" value={tableRowsToInsert} onChange={event => setTableRowsToInsert(event.target.value)} style={{ width: '64px' }} /></label>
        <button type="button" data-editor-action="insert-rows-after" disabled={mode !== 'table-grid' || Boolean(rowAxisReason)} title={mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : rowAxisReason} onClick={() => runTableAxisInsert('row', 'after', Number(tableRowsToInsert))}>Adicionar linhas depois</button>
      </div>
      <div className="vnext-tool-group" aria-label="Ações de coluna">
        <button type="button" data-editor-action="insert-column-before" disabled={mode !== 'table-grid' || Boolean(columnAxisReason)} title={mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : columnAxisReason} onClick={() => runTableAxisInsert('column', 'before')}>Coluna antes</button>
        <button type="button" data-editor-action="insert-column-after" disabled={mode !== 'table-grid' || Boolean(columnAxisReason)} title={mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : columnAxisReason} onClick={() => runTableAxisInsert('column', 'after')}>Coluna depois</button>
        <button type="button" data-editor-action="remove-column" disabled={mode !== 'table-grid' || Boolean(columnAxisReason)} title={mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : columnAxisReason} onClick={() => runTableAxisRemove('column')}>Remover coluna</button>
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
        <button type="button" data-editor-action="legend-panel" disabled={mode !== 'table-grid'} onClick={() => setMarkerPanelOpen(true)}>Legenda</button>
      </div>
      </>}
      <div className="vnext-tool-group" aria-label="Copiar e colar dados">
        <button type="button" data-editor-action="copy-table-cells" disabled={mode !== 'table-grid'} onClick={() => { void runVisibleTableCopy(); }}>Copiar</button>
        <button type="button" data-editor-action="paste-table-cells" disabled={mode !== 'table-grid'} onClick={() => setTablePasteFallbackOpen((open) => !open)}>Colar</button>
      </div>
      <button type="button" className="vnext-leave-table-grid" data-editor-action="leave-table-grid" onClick={() => leaveTableGrid()}>Voltar ao objeto</button>
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
        <span>Cole aqui dados do Excel, Google Sheets ou TSV</span>
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
