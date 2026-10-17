import { createDocumentSession, type ApplicationAction, type DocumentSession } from '../../application';
import type { CatalogDocument, Diagnostic, TableObject } from '../../domain';
import { prepareTableFitHeight, type FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import { applyTextFitHeight, prepareTextFitHeight } from '../../editor/text-fit-height-authoring';
import { emptyTableRowIds } from '../../publication/preflight';

/**
 * One-click fixes for editor problems (FR-13), keyed by diagnostic code. Each fix composes existing application
 * actions in one transaction, so a single Desfazer undoes it. Later slices add entries here (text height,
 * table continuation) without touching the issues panel.
 */
export interface IssueFixContext {
  readonly document: CatalogDocument;
  readonly session: DocumentSession;
  readonly diagnostic: Diagnostic;
  /** Current measured layout of the editor, when the fix depends on it. */
  readonly measurement?: FitHeightMeasurement | null;
}

export interface IssueFixOutcome {
  readonly ok: boolean;
  readonly message: string;
}

export interface IssueFix {
  /** Button text, in plain Portuguese. */
  readonly label: string;
  /** Cheap check used while rendering: is the fix offered for this problem right now? */
  available(context: IssueFixContext): boolean;
  run(context: IssueFixContext): IssueFixOutcome;
}

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

/** Only top-level, unlocked tables are edited by fixes; grouped tables are reached with "Ir até lá". */
function topLevelTable(document: CatalogDocument, diagnostic: Diagnostic): { pageId: string; object: TableObject } | undefined {
  const page = document.pages.find((candidate) => candidate.id === diagnostic.pageId);
  const object = page?.objects.find((candidate) => candidate.id === diagnostic.objectId);
  if (!page || !object || object.type !== 'table' || object.locked) return undefined;
  return { pageId: page.id, object };
}

function removeRowAction(pageId: string, object: TableObject, rowId: string): ApplicationAction {
  return { type: 'table.axis.remove', pageId, objectId: object.id, tableId: object.table.id, axis: 'row', axisId: rowId, expectedTable: object.table };
}

function currentTable(session: DocumentSession, pageId: string, objectId: string): TableObject | undefined {
  const object = session.getSnapshot().document.pages.find((page) => page.id === pageId)?.objects.find((entry) => entry.id === objectId);
  return object?.type === 'table' ? object : undefined;
}

const removeEmptyRows: IssueFix = {
  label: 'Remover linhas vazias',
  available({ document, diagnostic }) {
    const target = topLevelTable(document, diagnostic);
    if (!target) return false;
    const empty = emptyTableRowIds(target.object.table).length;
    return empty > 0 && empty < target.object.table.rows.length;
  },
  run({ document, session, diagnostic }) {
    const target = topLevelTable(document, diagnostic);
    const failure = { ok: false, message: 'Não foi possível remover as linhas vazias. Remova-as pela tabela.' };
    if (!target || session.getSnapshot().document !== document) return failure;
    const { pageId, object } = target;
    // Rehearse on a private copy first, so the real catalog only changes when every removal is valid.
    const rehearsal = createDocumentSession(document, { createId: createTransactionId });
    const removable: string[] = [];
    for (const rowId of emptyTableRowIds(object.table)) {
      const table = currentTable(rehearsal, pageId, object.id);
      if (table && table.table.rows.length > 1 && rehearsal.execute(removeRowAction(pageId, table, rowId)).ok) removable.push(rowId);
    }
    if (removable.length === 0) return failure;
    const transactionId = createTransactionId();
    for (const rowId of removable) {
      const table = currentTable(session, pageId, object.id);
      if (!table || !session.execute(removeRowAction(pageId, table, rowId), { transactionId }).ok) {
        if (session.getSnapshot().document !== document) session.undo();
        return failure;
      }
    }
    return {
      ok: true,
      message: removable.length === 1
        ? '1 linha vazia removida. Use Desfazer se precisar.'
        : `${removable.length} linhas vazias removidas. Use Desfazer se precisar.`,
    };
  },
};

const fitTableHeight: IssueFix = {
  label: 'Ajustar altura da tabela',
  available({ document, diagnostic, measurement }) {
    const target = topLevelTable(document, diagnostic);
    if (!target || !measurement) return false;
    const prepared = prepareTableFitHeight(document, target.pageId, target.object.id, measurement);
    return prepared.ok && !prepared.prepared.tallerThanPage && !prepared.prepared.wouldExceedPage;
  },
  run({ document, session, diagnostic, measurement }) {
    const target = topLevelTable(document, diagnostic);
    const prepared = target && prepareTableFitHeight(document, target.pageId, target.object.id, measurement);
    if (!prepared?.ok) return { ok: false, message: prepared?.message ?? 'Não foi possível ajustar a altura da tabela.' };
    const fit = prepared.prepared;
    const result = session.execute({
      type: 'table.fitHeight', pageId: fit.pageId, objectId: fit.objectId, tableId: fit.tableId,
      expectedFrame: fit.expectedFrame, expectedTable: fit.expectedTable, expectedTypography: fit.expectedTypography,
      measuredIntrinsicHeightQ: fit.measuredIntrinsicHeightQ, preparedHeightU: fit.preparedHeightU,
    }, { transactionId: createTransactionId() });
    if (!result.ok) return { ok: false, message: 'A tabela mudou depois da medição. Aguarde alguns segundos e tente novamente.' };
    return {
      ok: true,
      message: fit.wouldViolateSafeArea
        ? 'Altura da tabela ajustada. Ela encosta na margem da página; revise a posição.'
        : 'Altura da tabela ajustada ao conteúdo.',
    };
  },
};

/** FR-15: the text box grows to its measured text, never past the page's bottom margin. */
const fitTextHeight: IssueFix = {
  label: 'Ajustar altura ao texto',
  available({ document, diagnostic, measurement }) {
    if (!diagnostic.pageId || !diagnostic.objectId) return false;
    const prepared = prepareTextFitHeight(document, diagnostic.pageId, diagnostic.objectId, measurement);
    return prepared.ok && prepared.prepared.grows;
  },
  run({ document, session, diagnostic, measurement }) {
    const prepared = diagnostic.pageId && diagnostic.objectId
      ? prepareTextFitHeight(document, diagnostic.pageId, diagnostic.objectId, measurement)
      : undefined;
    if (!prepared?.ok) return { ok: false, message: prepared?.message ?? 'Não foi possível ajustar a altura do texto.' };
    return applyTextFitHeight(session, document, prepared.prepared, createTransactionId());
  },
};

export const ISSUE_FIXES: Readonly<Record<string, IssueFix>> = {
  EMPTY_TABLE_ROW: removeEmptyRows,
  TABLE_CONTENT_OVERFLOW: fitTableHeight,
  TEXT_OBJECT_OVERFLOW: fitTextHeight,
};

/** The fix offered for this problem now, if any. */
export function issueFixFor(context: IssueFixContext): IssueFix | undefined {
  const fix = ISSUE_FIXES[context.diagnostic.code];
  return fix && fix.available(context) ? fix : undefined;
}
