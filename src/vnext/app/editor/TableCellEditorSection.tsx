import React from 'react';
import { projectEditableRichText } from '../../application';
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

/**
 * FR-92 (costura 2.0): the cell content editor of the side panel, moved out of EditorWorkspace without
 * changing behavior. The draft and the commit/cancel decisions stay in EditorWorkspace; this file only
 * shows the fields and reports each change.
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
  return (
    <div data-cell-edit-session="">
      <label>
        <span>Tipo de conteúdo</span>
        <select
          data-cell-content-type=""
          value={cellDraft.activeType}
          disabled={cellDraft.originalContent.type === 'marker' || cellDraft.originalContent.type === 'image'}
          onChange={(event) => {
            const next = changeTableCellDraftType(cellDraft, event.target.value as EditableCellType);
            notifyCellDraftChanged(next);
          }}
        >
          <option value="empty">Vazio</option>
          <option value="richText">Texto</option>
          <option value="technicalCode">Código técnico</option>
          <option value="measurement">Medição</option>
          {cellDraft.originalContent.type === 'marker' && <option value="marker">Marcador</option>}
          {cellDraft.originalContent.type === 'image' && <option value="image">Imagem</option>}
        </select>
      </label>
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
      {cellDraft.activeType === 'richText' && (
        <label>
          <span>Texto</span>
          <textarea
            ref={(node) => { cellEditorFieldRef.current = node; }}
            data-cell-rich-text=""
            value={cellDraft.richText}
            disabled={projectEditableRichText(cellDraft.originalContent.type === 'richText'
              ? cellDraft.originalContent.value
              : { paragraphs: [] }) === null}
            onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
              richText: event.target.value.replace(/\r\n?/g, '\n'),
            }))}
            onCompositionStart={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraft, true))}
            onCompositionEnd={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraftRef.current ?? cellDraft, false))}
          />
        </label>
      )}
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
      {cellDraft.activeType === 'empty' && <p data-cell-empty-content="">A célula ficará vazia.</p>}
      {cellDraft.activeType === 'marker' && <p data-cell-readonly-content="">{simple ? 'Marcador existente. Use Notas e legenda para revisar as notas e os símbolos da tabela.' : 'Marcador existente. A edição de marcadores será disponibilizada em uma etapa posterior.'}</p>}
      {cellDraft.activeType === 'image' && <p data-cell-readonly-content="">{simple ? 'Para ajustar esta imagem, abra Detalhes da tabela e use Imagem da célula.' : 'Imagem existente. A edição de imagem da célula não faz parte desta etapa.'}</p>}
      {cellDraft.originalContent.type !== 'marker' && cellDraft.originalContent.type !== 'image' && (
        <button type="button" data-editor-action="clear-cell-content"
          onClick={() => notifyCellDraftChanged(clearTableCellDraft(cellDraft))}>
          Limpar conteúdo
        </button>
      )}
      <div className="vnext-cell-edit-actions">
        <button type="button" data-editor-action="cancel-cell-content" onClick={() => cancelCellEdit()}>Cancelar</button>
        <button type="button" data-editor-action="commit-cell-content"
          disabled={cellDraft.originalContent.type === 'marker' || cellDraft.originalContent.type === 'image'}
          onClick={() => commitCellEdit()}>
          Concluir
        </button>
      </div>
    </div>
  );
}
