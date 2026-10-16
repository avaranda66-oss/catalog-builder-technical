import React from 'react';
import {
  changeTableCellDraftType,
  clearTableCellDraft,
  confirmTableCellDraftTypeChange,
  createTableCellDraft,
  setTableCellDraftComposition,
  updateTableCellDraft,
  type EditableCellType,
  type TableCellDraft,
} from '../../editor/table-cell-draft';

export interface TableCellEditorSectionProps {
  /** The open cell draft; the section is shown only while one exists. */
  cellDraft: TableCellDraft;
  /** Always the latest draft, so IME composition ends on the newest value. */
  cellDraftRef: React.MutableRefObject<TableCellDraft | null>;
  /** The field that receives focus when the edit starts. */
  cellEditorFieldRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>;
  simple: boolean;
  notifyCellDraftChanged(next: TableCellDraft | null): void;
  commitCellEdit(): unknown;
  cancelCellEdit(): unknown;
}

const advancedType = (type: TableCellDraft['activeType']) => type === 'technicalCode' || type === 'measurement';

/**
 * Side-panel part of the cell edit. Since FR-30 the text itself is typed inside the cell (CellInlineEditor); this
 * section keeps the buttons and, under "Avançado", the content type with "Código técnico" and "Medição". In the
 * simple mode "Avançado" starts closed, unless the cell already holds a code or a measurement. The draft and the
 * commit/cancel decisions stay in EditorWorkspace; this file only shows the fields and reports each change.
 */
export function TableCellEditorSection({
  cellDraft,
  cellDraftRef,
  cellEditorFieldRef,
  simple,
  notifyCellDraftChanged,
  commitCellEdit,
  cancelCellEdit,
}: TableCellEditorSectionProps) {
  const [advancedOpen, setAdvancedOpen] = React.useState(!simple || advancedType(cellDraft.activeType));
  const showAdvanced = advancedOpen || advancedType(cellDraft.activeType);
  const readOnly = cellDraft.originalContent.type === 'marker' || cellDraft.originalContent.type === 'image';
  const advancedId = React.useId();

  return (
    <div data-cell-edit-session="">
      {cellDraft.activeType === 'richText' && (
        <p className="vnext-disclosure-help" data-cell-inline-hint="">
          Digite direto na célula da tabela. Enter salva e desce; Tab vai para a direita; Esc cancela.
        </p>
      )}
      {cellDraft.requiresTypeChangeConfirmation && (
        <div role="alert" data-cell-type-confirmation="">
          <p>Trocar o tipo substituirá o conteúdo atual desta célula.</p>
          <button type="button" onClick={() => notifyCellDraftChanged(confirmTableCellDraftTypeChange(cellDraft))}>
            Confirmar substituição
          </button>
          <button type="button" onClick={() => notifyCellDraftChanged(createTableCellDraft(cellDraft.identity, cellDraft.originalContent))}>
            Manter conteúdo atual
          </button>
        </div>
      )}
      {!readOnly && (
        <button
          type="button"
          className="vnext-inspector-action vnext-inspector-disclosure"
          data-editor-action="toggle-cell-advanced"
          aria-expanded={showAdvanced}
          aria-controls={advancedId}
          disabled={advancedType(cellDraft.activeType)}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {showAdvanced ? 'Ocultar Avançado' : 'Avançado'}
        </button>
      )}
      {(showAdvanced || readOnly) && (
        <div id={advancedId} data-cell-advanced="">
          <label>
            <span>Tipo de conteúdo</span>
            <select
              data-cell-content-type=""
              value={cellDraft.activeType}
              disabled={readOnly}
              onChange={(event) => {
                const next = changeTableCellDraftType(cellDraft, event.target.value as EditableCellType);
                notifyCellDraftChanged(next);
              }}
            >
              <option value="richText">Texto</option>
              <option value="technicalCode">Código técnico</option>
              <option value="measurement">Medição</option>
              <option value="empty">Vazio</option>
              {cellDraft.originalContent.type === 'marker' && <option value="marker">Marcador</option>}
              {cellDraft.originalContent.type === 'image' && <option value="image">Imagem</option>}
            </select>
          </label>
          {cellDraft.activeType === 'technicalCode' && (
            <label>
              <span>Código</span>
              <input
                ref={(node) => { cellEditorFieldRef.current = node; }}
                data-cell-technical-code=""
                type="text"
                value={cellDraft.technicalCode}
                style={{ fontFamily: 'monospace' }}
                onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, { technicalCode: event.target.value }))}
                onCompositionStart={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraft, true))}
                onCompositionEnd={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraftRef.current ?? cellDraft, false))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !cellDraftRef.current?.composing) {
                    event.preventDefault();
                    commitCellEdit();
                  }
                }}
              />
            </label>
          )}
          {cellDraft.activeType === 'measurement' && (
            <div className="vnext-cell-measurement" data-cell-measurement="">
              <label>
                <span>Valor</span>
                <input
                  ref={(node) => { cellEditorFieldRef.current = node; }}
                  data-cell-measurement-value=""
                  type="text"
                  value={cellDraft.measurement.valueText}
                  onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
                    measurement: { valueText: event.target.value },
                  }))}
                  onCompositionStart={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraft, true))}
                  onCompositionEnd={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraftRef.current ?? cellDraft, false))}
                />
              </label>
              <label>
                <span>Unidade</span>
                <input
                  data-cell-measurement-unit=""
                  type="text"
                  value={cellDraft.measurement.unit}
                  onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
                    measurement: { unit: event.target.value },
                  }))}
                />
              </label>
              <label>
                <span>Qualificador</span>
                <select
                  data-cell-measurement-qualifier=""
                  value={cellDraft.measurement.qualifier}
                  onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
                    measurement: { qualifier: event.target.value as TableCellDraft['measurement']['qualifier'] },
                  }))}
                >
                  <option value="">Nenhum</option>
                  <option value="approx">Aproximadamente</option>
                  <option value="min">Mínimo</option>
                  <option value="max">Máximo</option>
                </select>
              </label>
            </div>
          )}
        </div>
      )}
      {cellDraft.activeType === 'empty' && <p data-cell-empty-content="">A célula ficará vazia.</p>}
      {cellDraft.activeType === 'marker' && <p data-cell-readonly-content="">{simple ? 'Marcador existente. Use Notas e legenda para revisar as notas e os símbolos da tabela.' : 'Marcador existente. A edição de marcadores será disponibilizada em uma etapa posterior.'}</p>}
      {cellDraft.activeType === 'image' && <p data-cell-readonly-content="">{simple ? 'Para ajustar esta imagem, abra Detalhes da tabela e use Imagem da célula.' : 'Imagem existente. A edição de imagem da célula não faz parte desta etapa.'}</p>}
      {!readOnly && (
        <button type="button" data-editor-action="clear-cell-content"
          onClick={() => notifyCellDraftChanged(clearTableCellDraft(cellDraft))}>
          Limpar conteúdo
        </button>
      )}
      <div className="vnext-cell-edit-actions">
        <button type="button" data-editor-action="cancel-cell-content" onClick={() => cancelCellEdit()}>Cancelar</button>
        <button type="button" data-editor-action="commit-cell-content"
          disabled={readOnly}
          onClick={() => commitCellEdit()}>
          Concluir
        </button>
      </div>
    </div>
  );
}
