import type { ApplicationAction, DocumentSession, TablePresetId } from '../../application';
import type { CatalogDocument, TableModel, TableObject } from '../../domain';
import {
  planTableComposition,
  projectTableLook,
  tableLookColumnMaintenanceSteps,
  tableLookMaintenanceSteps,
  tableLookSteps,
  type TableStep,
} from '../../editor/table-look-authoring';

/**
 * Session side of the table panel (FR-33/FR-34): runs a planned list of existing actions under one transactionId,
 * so a single Desfazer undoes the whole change. The list was checked on a copy of the document first; an
 * unexpected late failure is rolled back with one Desfazer (the same safety net as "Adicionar N linhas e colar").
 */

export type TableStepsOutcome =
  | { readonly ok: true; readonly changed: boolean; readonly document: CatalogDocument }
  | { readonly ok: false; readonly code: string };

function tableObjectIn(document: CatalogDocument, pageId: string, objectId: string): TableObject | undefined {
  return document.pages.find((page) => page.id === pageId)?.objects
    .find((object): object is TableObject => object.id === objectId && object.type === 'table');
}

function executeAll(
  session: DocumentSession,
  actions: readonly ApplicationAction[],
  transactionId: string,
  rollback: boolean
): TableStepsOutcome {
  let executed = false;
  for (const action of actions) {
    const result = session.execute(action, { transactionId });
    if (!result.ok) {
      if (executed && rollback) session.undo();
      return { ok: false, code: result.error.code };
    }
    if (result.metadata.changed) executed = true;
  }
  return { ok: true, changed: executed, document: session.getSnapshot().document };
}

/** Plans the steps on the current document and runs them as one undo step. Nothing changes when the plan fails. */
export function runTableSteps(
  session: DocumentSession,
  target: { readonly pageId: string; readonly objectId: string },
  steps: readonly TableStep[],
  transactionId: string
): TableStepsOutcome {
  const plan = planTableComposition(session.getSnapshot().document, target.pageId, target.objectId, steps);
  if (!plan.ok) return plan;
  return executeAll(session, plan.actions, transactionId, true);
}

/**
 * FR-33: a new table gets the whole look of the house style ("Especificações": names in bold on a tint, 68 mm wide),
 * inside the undo step that created it. A table that does not have that style's base (the catalog lacks its fonts)
 * is left as it is. The look is checked on a copy first; when it cannot be applied the table keeps the base only.
 */
export function completeNewTableLook(
  session: DocumentSession,
  target: { readonly pageId: string; readonly objectId: string },
  presetId: TablePresetId,
  transactionId: string
): TableStepsOutcome {
  const document = session.getSnapshot().document;
  const object = tableObjectIn(document, target.pageId, target.objectId);
  if (!object) return { ok: false, code: 'OBJECT_NOT_FOUND' };
  const look = projectTableLook(object.table, document.style);
  if (look.basePresetId !== presetId) return { ok: true, changed: false, document };
  const plan = planTableComposition(document, target.pageId, target.objectId, tableLookSteps({ kind: 'preset', presetId }, look, document.style));
  if (!plan.ok) return plan;
  // No rollback here: one Desfazer of this transaction would also take the new table away.
  return executeAll(session, plan.actions, transactionId, false);
}

/**
 * Bands and the highlighted first column follow new or removed rows (and a column added before the first one),
 * inside the structure change's undo step. The structure change already happened, so this is best effort: each step
 * runs on the live table without a rehearsal on a copy, and a step that cannot run leaves the look as it is.
 */
function keepTableLook(session: DocumentSession, pageId: string, objectId: string, lookSteps: readonly TableStep[], transactionId: string) {
  for (const step of lookSteps) {
    const document = session.getSnapshot().document;
    const object = tableObjectIn(document, pageId, objectId);
    if (!object) return;
    let action: ApplicationAction | null;
    try {
      action = step.build({
        identity: { pageId, objectId, tableId: object.table.id },
        table: object.table,
        frameWidthMm: object.frame.widthMm,
        documentStyle: document.style,
      });
    } catch {
      if (step.optional) continue;
      return;
    }
    if (!action) continue;
    const result = session.execute(action, { transactionId });
    if (!result.ok && !step.optional) return;
  }
}

export interface TableAxisInsertRequest {
  readonly axis: 'row' | 'column';
  readonly referenceAxisId: string;
  readonly position: 'before' | 'after';
  readonly count?: number;
  readonly properties: Extract<ApplicationAction, { type: 'table.axis.insert' }>['properties'];
}

export type TableAxisOutcome =
  | { readonly ok: true; readonly table: TableModel; readonly insertedAxisIds: readonly string[] }
  | { readonly ok: false; readonly code: string };

/** "Linha acima/abaixo", "Coluna à esquerda/direita" and "Adicionar N linhas" (one undo step). */
export function insertTableAxes(
  session: DocumentSession,
  target: { readonly pageId: string; readonly object: TableObject },
  request: TableAxisInsertRequest,
  transactionId: string
): TableAxisOutcome {
  const { pageId, object } = target;
  const lookBefore = projectTableLook(object.table, session.getSnapshot().document.style);
  const result = session.execute({
    type: 'table.axis.insert',
    pageId,
    objectId: object.id,
    tableId: object.table.id,
    axis: request.axis,
    referenceAxisId: request.referenceAxisId,
    position: request.position,
    ...(request.count !== undefined ? { count: request.count } : {}),
    properties: request.properties,
    expectedTable: object.table,
  }, { transactionId });
  if (!result.ok) return { ok: false, code: result.error.code };
  const inserted = tableObjectIn(result.document, pageId, object.id);
  if (!inserted) return { ok: false, code: 'OBJECT_NOT_FOUND' };
  const axes = request.axis === 'row' ? inserted.table.rows : inserted.table.columns;
  const insertedAxisIds = axes.filter((axis) => result.metadata.createdIds.includes(axis.id)).map((axis) => axis.id);
  keepTableLook(session, pageId, object.id, request.axis === 'row'
    ? tableLookMaintenanceSteps(lookBefore)
    : tableLookColumnMaintenanceSteps(lookBefore, object.table.columns[0]?.id), transactionId);
  const final = tableObjectIn(session.getSnapshot().document, pageId, object.id);
  return { ok: true, table: final?.table ?? inserted.table, insertedAxisIds };
}

/**
 * "Excluir linhas/colunas": removes every axis of the plan, one `table.axis.remove` each, as one undo step. The plan
 * was checked beforehand (`planTableAxisRemoval`); a late failure puts the table back as it was.
 */
export function removeTableAxes(
  session: DocumentSession,
  target: { readonly pageId: string; readonly object: TableObject },
  axis: 'row' | 'column',
  axisIds: readonly string[],
  transactionId: string
): TableAxisOutcome {
  const { pageId, object } = target;
  const lookBefore = projectTableLook(object.table, session.getSnapshot().document.style);
  let current = object.table;
  let executed = false;
  for (const axisId of axisIds) {
    const result = session.execute({
      type: 'table.axis.remove',
      pageId,
      objectId: object.id,
      tableId: current.id,
      axis,
      axisId,
      expectedTable: current,
    }, { transactionId });
    if (!result.ok) {
      if (executed) session.undo();
      return { ok: false, code: result.error.code };
    }
    executed = true;
    const next = tableObjectIn(result.document, pageId, object.id);
    if (!next) {
      session.undo();
      return { ok: false, code: 'OBJECT_NOT_FOUND' };
    }
    current = next.table;
  }
  if (axis === 'row') keepTableLook(session, pageId, object.id, tableLookMaintenanceSteps(lookBefore), transactionId);
  const final = tableObjectIn(session.getSnapshot().document, pageId, object.id);
  return { ok: true, table: final?.table ?? current, insertedAxisIds: [] };
}
