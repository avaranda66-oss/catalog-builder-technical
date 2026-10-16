import type { DocumentSession } from '../../application';
import type { CatalogDocument, TableModel, TableObject } from '../../domain';
import {
  describeAxisCount,
  planTableAxisInsert,
  planTableAxisRemoval,
  selectionAfterGridInsert,
  selectionAfterGridRemoval,
  type TableGridCommand,
} from '../../editor/table-grid-commands';
import { tableSelectionFocusPoint, type TableSelection } from '../../editor/table-selection';

/**
 * FR-34 (slice 2A) — runs the "+" buttons and the right-click menu of the table grid with the actions that already
 * exist: one `table.axis.insert`, or one `table.axis.remove` per row/column under a single transactionId, so one
 * Desfazer brings everything back. A failure half-way is rolled back with that same Desfazer.
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

function tableObjectIn(document: CatalogDocument, pageId: string, objectId: string): TableObject | undefined {
  return document.pages.find((page) => page.id === pageId)?.objects
    .find((object): object is TableObject => object.id === objectId && object.type === 'table');
}

function failureMessage(code: string | undefined): string {
  if (code === 'TARGET_STALE') return 'A tabela mudou. Nada foi alterado.';
  if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
  if (code === 'MERGE_INTERSECTION') return 'Há células mescladas no caminho. Desfaça a mescla antes de continuar.';
  if (code === 'TABLE_LAST_AXIS') return 'A tabela precisa ter pelo menos 1 linha e 1 coluna.';
  return 'Não foi possível alterar a tabela. Nada foi alterado.';
}

function insertMessage(command: Extract<TableGridCommand, { type: 'insert' }>): string {
  if (command.selectFirstCell) return 'Linha adicionada no fim da tabela.';
  if (command.axis === 'row') return command.position === 'before' ? 'Linha inserida acima.' : 'Linha inserida abaixo.';
  return command.position === 'before' ? 'Coluna inserida à esquerda.' : 'Coluna inserida à direita.';
}

export function runTableGridAxisCommand(
  session: DocumentSession,
  target: { readonly pageId: string; readonly object: TableObject; readonly selection: TableSelection },
  command: TableGridAxisCommand,
  transactionId: string
): TableGridOutcome {
  const table = target.object.table;
  const base = { pageId: target.pageId, objectId: target.object.id, tableId: table.id };
  const identity = target.selection.identity;

  if (command.type === 'insert') {
    const planned = planTableAxisInsert(table, target.selection, command);
    if (!planned.ok) return planned;
    const result = session.execute({
      type: 'table.axis.insert',
      ...base,
      axis: planned.plan.axis,
      referenceAxisId: planned.plan.referenceAxisId,
      position: planned.plan.position,
      count: 1,
      properties: planned.plan.properties,
      expectedTable: table,
    }, { transactionId });
    if (!result.ok) return { ok: false, message: failureMessage(result.error.code) };
    const next = tableObjectIn(result.document, target.pageId, target.object.id);
    const axes = command.axis === 'row' ? next?.table.rows : next?.table.columns;
    const insertedId = axes?.find((axis) => result.metadata.createdIds.includes(axis.id))?.id;
    const selection = next && insertedId && selectionAfterGridInsert(
      identity, next.table, command.axis, insertedId, tableSelectionFocusPoint(table, target.selection), command.selectFirstCell
    );
    if (!next || !selection) return { ok: false, message: failureMessage(undefined) };
    return { ok: true, table: next.table, selection, message: insertMessage(command), fitHeight: command.axis === 'row' };
  }

  const planned = planTableAxisRemoval(table, target.selection, command.axis);
  if (!planned.ok) return planned;
  let current = table;
  let executed = false;
  for (const axisId of planned.plan.axisIds) {
    const result = session.execute({
      type: 'table.axis.remove', ...base, axis: command.axis, axisId, expectedTable: current,
    }, { transactionId });
    const next = result.ok ? tableObjectIn(result.document, target.pageId, target.object.id) : undefined;
    if (!result.ok || !next) {
      if (executed) session.undo();
      return { ok: false, message: failureMessage(result.ok ? undefined : result.error.code) };
    }
    executed = true;
    current = next.table;
  }
  const selection = selectionAfterGridRemoval(identity, table, current, planned.plan, target.selection);
  if (!selection) return { ok: false, message: failureMessage(undefined) };
  const count = planned.plan.axisIds.length;
  const removed = count === 1
    ? `${command.axis === 'row' ? 'Linha excluída' : 'Coluna excluída'}.`
    : `${describeAxisCount(command.axis, count)} excluídas.`;
  return { ok: true, table: current, selection, message: `${removed} ${UNDO_HINT}`, fitHeight: false };
}
