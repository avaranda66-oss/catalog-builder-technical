import type { DocumentSession } from '../../application';
import type { TableModel, TableObject } from '../../domain';
import { planTableAxisRemoval, tableAxisRefusalMessage } from '../../editor/table-axis-authoring';
import { planTableAxisInsert, type TableGridCommand } from '../../editor/table-grid-commands';
import {
  canonicalTablePoint,
  selectionAfterTableAxisInsert,
  selectionAfterTableAxisRemove,
  tableCellSelection,
  tableSelectionAxisIds,
  tableSelectionFocusPoint,
  type TableSelection,
} from '../../editor/table-selection';
import { insertTableAxes, removeTableAxes } from './table-structure-actions';

/**
 * FR-34 (slice 2A) — runs the "+" buttons, the right-click menu and Tab on the last cell of the table grid with the
 * same session work as the table panel and the bar above the page (`table-structure-actions.ts`): one
 * `table.axis.insert`, or one `table.axis.remove` per row/column, under a single transactionId, with the bands and
 * the highlighted first column following the rows. One Desfazer brings everything back.
 */

export type TableGridAxisCommand = Extract<TableGridCommand, { type: 'insert' | 'remove' }>;

export type TableGridOutcome =
  | {
      readonly ok: true;
      readonly table: TableModel;
      readonly selection: TableSelection;
      /** A finished change: show it with a success tone. */
      readonly message: string;
      /** New rows may need a taller frame: fit the height in the same undo step. */
      readonly fitHeight: boolean;
    }
  | { readonly ok: false; readonly message: string };

const UNDO_HINT = 'Para voltar, use Desfazer.';

function insertMessage(command: Extract<TableGridCommand, { type: 'insert' }>): string {
  if (command.selectFirstCell) return 'Linha adicionada no fim da tabela.';
  if (command.axis === 'row') return command.position === 'before' ? 'Linha inserida acima.' : 'Linha inserida abaixo.';
  return command.position === 'before' ? 'Coluna inserida à esquerda.' : 'Coluna inserida à direita.';
}

function removeMessage(axis: 'row' | 'column', count: number): string {
  if (count === 1) return `${axis === 'row' ? 'Linha excluída' : 'Coluna excluída'}. ${UNDO_HINT}`;
  return `${count} ${axis === 'row' ? 'linhas excluídas' : 'colunas excluídas'}. ${UNDO_HINT}`;
}

/** Tab on the last cell: the person goes on typing in the first cell of the new row. */
function firstCellOf(table: TableModel, selection: TableSelection, rowId: string): TableSelection | undefined {
  const point = canonicalTablePoint(table, { rowId, columnId: table.columns[0].id });
  return point ? tableCellSelection(selection.identity, point) : undefined;
}

export function runTableGridAxisCommand(
  session: DocumentSession,
  target: { readonly pageId: string; readonly object: TableObject; readonly selection: TableSelection },
  command: TableGridAxisCommand,
  transactionId: string
): TableGridOutcome {
  const { pageId, object, selection } = target;
  const table = object.table;

  if (command.type === 'insert') {
    const planned = planTableAxisInsert(table, selection, command);
    if (!planned.ok) return planned;
    const outcome = insertTableAxes(session, { pageId, object }, {
      axis: planned.plan.axis,
      referenceAxisId: planned.plan.referenceAxisId,
      position: planned.plan.position,
      properties: planned.plan.properties,
    }, transactionId);
    if (!outcome.ok) return { ok: false, message: tableAxisRefusalMessage(outcome.code, command.axis) };
    const insertedId = outcome.insertedAxisIds[0];
    const next = insertedId && (command.selectFirstCell
      ? firstCellOf(outcome.table, selection, insertedId)
      : selectionAfterTableAxisInsert(outcome.table, selection, command.axis, insertedId));
    if (!next) return { ok: false, message: tableAxisRefusalMessage('ACTION_INVALID', command.axis) };
    return { ok: true, table: outcome.table, selection: next, message: insertMessage(command), fitHeight: command.axis === 'row' };
  }

  const plan = planTableAxisRemoval(table, command.axis, tableSelectionAxisIds(table, selection, command.axis));
  if (!plan.ok) return { ok: false, message: tableAxisRefusalMessage(plan.code, command.axis) };
  const firstRemovedIndex = (command.axis === 'row' ? table.rows : table.columns).findIndex((entry) => entry.id === plan.axisIds[0]);
  const focusBefore = tableSelectionFocusPoint(table, selection);
  const outcome = removeTableAxes(session, { pageId, object }, command.axis, plan.axisIds, transactionId);
  if (!outcome.ok) return { ok: false, message: tableAxisRefusalMessage(outcome.code, command.axis) };
  return {
    ok: true,
    table: outcome.table,
    selection: selectionAfterTableAxisRemove(outcome.table, selection, command.axis, firstRemovedIndex, focusBefore),
    message: removeMessage(command.axis, plan.axisIds.length),
    fitHeight: false,
  };
}
