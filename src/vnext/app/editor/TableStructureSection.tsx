import type { TableModel } from '../../domain/editorial-model';
import { EDITING_STRUCTURE_REASON, removeAxisLabel, tableStructureAvailability } from '../../editor/table-axis-authoring';
import type { TableSelection } from '../../editor/table-selection';
import type { TableAuthoringMode } from './TableGridToolbar';
import './TablePanel.css';

export interface TableStructureSectionProps {
  readonly table: TableModel;
  readonly mode: TableAuthoringMode;
  readonly tableSelection: TableSelection | null;
  readonly runTableAxisInsert: (axis: 'row' | 'column', position: 'before' | 'after') => void;
  readonly runTableAxisRemove: (axis: 'row' | 'column') => void;
}

/**
 * FR-34 "Estrutura": rows and columns for the cell or range selected now. "Excluir 3 linhas" removes every selected
 * row at once, as one undo step. The frame grows with new rows by itself while the page still has room.
 */
export function TableStructureSection({ table, mode, tableSelection, runTableAxisInsert, runTableAxisRemove }: TableStructureSectionProps) {
  if (mode !== 'table-grid' && mode !== 'cell-edit') {
    return (
      <section className="vnext-table-structure" data-table-structure="" aria-labelledby={`vnext-table-structure-${table.id}`}>
        <h3 id={`vnext-table-structure-${table.id}`}>Estrutura</h3>
        <p className="vnext-disclosure-help">Para inserir ou excluir linhas e colunas, clique em Editar tabela e escolha uma célula.</p>
      </section>
    );
  }
  const editing = mode === 'cell-edit';
  const { rowIds, columnIds, rowReason, columnReason, removeRowReason, removeColumnReason } = tableStructureAvailability(table, tableSelection, editing);
  const hint = editing ? EDITING_STRUCTURE_REASON : rowReason && columnReason ? 'Clique numa célula da tabela para inserir ou excluir linhas e colunas.' : undefined;
  // A disabled button cannot take the focus, so its reason is also written under its group (and read with it).
  const baseId = `vnext-table-structure-${table.id}`;
  const hintId = `${baseId}-hint`;
  const rowsNote = hint ? undefined : rowReason ?? removeRowReason;
  const columnsNote = hint ? undefined : columnReason ?? removeColumnReason;
  const describedBy = (reason: string | undefined, groupNoteId: string) => !reason ? undefined : hint ? hintId : groupNoteId;
  return (
    <section className="vnext-table-structure" data-table-structure="" aria-labelledby={baseId}>
      <h3 id={baseId}>Estrutura</h3>
      <div className="vnext-table-structure-group" role="group" aria-label="Linhas">
        <span aria-hidden="true">Linhas</span>
        <button type="button" data-editor-action="table-row-above" disabled={Boolean(rowReason)} title={rowReason}
          aria-describedby={describedBy(rowReason, `${baseId}-rows-note`)}
          onClick={() => runTableAxisInsert('row', 'before')}>Linha acima</button>
        <button type="button" data-editor-action="table-row-below" disabled={Boolean(rowReason)} title={rowReason}
          aria-describedby={describedBy(rowReason, `${baseId}-rows-note`)}
          onClick={() => runTableAxisInsert('row', 'after')}>Linha abaixo</button>
        <button type="button" data-editor-action="table-remove-rows" disabled={Boolean(removeRowReason)} title={removeRowReason}
          aria-describedby={describedBy(removeRowReason, `${baseId}-rows-note`)}
          onClick={() => runTableAxisRemove('row')}>{removeAxisLabel('row', rowIds.length)}</button>
        {rowsNote && <p id={`${baseId}-rows-note`} className="vnext-disclosure-help" data-table-structure-note="rows">{rowsNote}</p>}
      </div>
      <div className="vnext-table-structure-group" role="group" aria-label="Colunas">
        <span aria-hidden="true">Colunas</span>
        <button type="button" data-editor-action="table-column-left" disabled={Boolean(columnReason)} title={columnReason}
          aria-describedby={describedBy(columnReason, `${baseId}-columns-note`)}
          onClick={() => runTableAxisInsert('column', 'before')}>Coluna à esquerda</button>
        <button type="button" data-editor-action="table-column-right" disabled={Boolean(columnReason)} title={columnReason}
          aria-describedby={describedBy(columnReason, `${baseId}-columns-note`)}
          onClick={() => runTableAxisInsert('column', 'after')}>Coluna à direita</button>
        <button type="button" data-editor-action="table-remove-columns" disabled={Boolean(removeColumnReason)} title={removeColumnReason}
          aria-describedby={describedBy(removeColumnReason, `${baseId}-columns-note`)}
          onClick={() => runTableAxisRemove('column')}>{removeAxisLabel('column', columnIds.length)}</button>
        {columnsNote && <p id={`${baseId}-columns-note`} className="vnext-disclosure-help" data-table-structure-note="columns">{columnsNote}</p>}
      </div>
      {hint && <p id={hintId} className="vnext-disclosure-help">{hint}</p>}
    </section>
  );
}
