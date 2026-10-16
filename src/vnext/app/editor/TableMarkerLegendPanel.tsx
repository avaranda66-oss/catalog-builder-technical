import React from 'react';
import { projectEditableRichText } from '../../application';
import type { Cell, TableObject } from '../../domain';
import type { TableAnnotation, TableLegendEntry } from '../../domain/editorial-model';
import { legendUsageCount } from '../../editor/table-marker-authoring';
import { annotationUsageCount } from '../../editor/table-semantic-authoring';
import type { TableAuthoringMode } from './TableGridToolbar';

export interface TableMarkerLegendPanelProps {
  tableObject: TableObject;
  mode: TableAuthoringMode;
  selectedAnchorCells: readonly Cell[];
  /** Exactly one free cell is selected (notes on a cell). */
  selectedSemanticCell?: Cell;
  /** A cell is being edited: notes and legend wait until it is finished. */
  cellEditing: boolean;
  tableSemanticDisabled: boolean;
  tableSemanticDisabledReasonId?: string;
  setMarkerPanelOpen(open: boolean): void;
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
        <span>{usageCount === 1 ? 'Usado 1 vez' : `Usado ${usageCount} vezes`}</span>
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
      {editableText === null && <p>Esta explicação tem formatação especial e não pode ser alterada aqui.</p>}
      <div className="vnext-cell-edit-actions">
        <button type="button" data-editor-action="update-legend" disabled={mutationDisabled} onClick={() => onUpdate(markerCode, editableText === null ? undefined : plainText)}>
          Atualizar legenda
        </button>
        <button type="button" data-editor-action="move-legend-up" disabled={mutationDisabled || !canMoveUp} onClick={onMoveUp}>Mover para cima</button>
        <button type="button" data-editor-action="move-legend-down" disabled={mutationDisabled || !canMoveDown} onClick={onMoveDown}>Mover para baixo</button>
        <button type="button" data-editor-action="locate-legend-usage" disabled={usageCount === 0} onClick={onLocate}>
          Localizar usos
        </button>
        <button type="button" data-editor-action="remove-legend" disabled={mutationDisabled || usageCount > 0} title={usageCount > 0 ? `Usada em ${usageCount === 1 ? '1 célula' : `${usageCount} células`}. Tire o marcador das células antes de excluir.` : undefined} onClick={onRemove}>
          Excluir legenda
        </button>
      </div>
    </div>
  );
}

/**
 * "Notas e legenda" (opened from the Notas part of the table panel): every note, footnote and caption, the markers
 * of the cells and their legend. Moved out of TableInspectorPanel (FR-33, 2D) with the same actions; the texts are
 * plain Portuguese now.
 */
export function TableMarkerLegendPanel({
  tableObject,
  mode,
  selectedAnchorCells,
  selectedSemanticCell,
  cellEditing,
  tableSemanticDisabled,
  tableSemanticDisabledReasonId,
  setMarkerPanelOpen,
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
}: TableMarkerLegendPanelProps) {
  return (
    <section className="vnext-marker-legend-panel" data-marker-legend-panel="">
      <div className="vnext-legend-entry-heading">
        <h3>Notas, marcadores e legenda</h3>
        <button type="button" data-editor-action="close-marker-panel" onClick={() => setMarkerPanelOpen(false)}>Fechar</button>
      </div>
      <p>As notas aparecem abaixo da tabela. Um marcador (como *) liga uma célula a uma explicação da legenda.</p>
      <fieldset className="vnext-marker-create" data-annotation-create="">
        <legend>Adicionar nota ou legenda</legend>
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
            placeholder="Texto da nota"
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
                <span>{usageCount === 1 ? 'Usada 1 vez' : `Usada ${usageCount} vezes`}</span>
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
                <p>Esta nota tem formatação especial e não pode ser alterada aqui.</p>
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
      <p>O marcador liga a célula a uma explicação da legenda.</p>
      <label>
        <span>Marcador existente</span>
        <select data-marker-picker="" value={markerLegendChoice} onChange={(event) => setMarkerLegendChoice(event.target.value)}>
          <option value="">Selecione um marcador</option>
          {tableObject.table.legend.map((entry) => {
            const text = projectEditableRichText(entry.text) ?? 'Explicação com formatação especial';
            const usage = legendUsageCount(tableObject.table, entry.id);
            return <option key={entry.id} value={entry.id}>{entry.markerCode} — {text} ({usage === 1 ? 'usado 1 vez' : `usado ${usage} vezes`})</option>;
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
          <textarea data-new-marker-text="" value={newMarkerText} onChange={(event) => setNewMarkerText(event.target.value.replace(/\r\n?/g, '\n'))} placeholder="O que o marcador significa" />
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
  );
}
