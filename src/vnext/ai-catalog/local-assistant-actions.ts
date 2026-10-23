import type { DocumentSession } from '../application';
import type { CatalogDocument, EditorialObject } from '../domain';
import { createNewTableModel, createTableInsertSpec, NEW_TABLE_PRESET_ID } from '../app/editor-defaults';
import { completeNewTableLook } from '../app/editor/table-structure-actions';
import { newTableTransactionId } from '../app/editor/table-paste-actions';
import { buildDocumentOutline } from './document-outline';
import { planEditIntents, type EditPlan } from './edit-intents';
import type { EditIntent } from './edit-intent-contract';
import { describeLocalAction, type LocalAction } from '../arsenal/local-router';

/**
 * Onda 4.5 — what the router without AI found, done with the editor's EXISTING actions (zero tokens, one Desfazer):
 * - a new table: `object.insert` + the house look of a new table (the same as the toolbar button), one transaction;
 * - a PRESYS model page: `page.template.insert` (the same templates as "Usar modelo…"), after the open page;
 * - a blank page: `page.add`, after the open page;
 * - a style change: the same plan, card and "Aplicar" of the conversation that edits (edit-intents.ts), built here.
 */

export type LocalActionResult =
  | { readonly ok: true; readonly text: string; readonly pageId: string; readonly objectId?: string; readonly newPage: boolean }
  | { readonly ok: false; readonly text: string };

const UNDO_HINT = ' Um Desfazer volta tudo.';

function pageNumber(document: CatalogDocument, pageId: string): number {
  return document.pages.findIndex(page => page.id === pageId) + 1;
}

/** Runs a table or model-page action on the open catalog. Nothing changes when it fails. */
export function applyLocalAction(session: DocumentSession, action: Exclude<LocalAction, { type: 'style' }>,
  context: { readonly activePageId?: string }): LocalActionResult {
  const document = session.getSnapshot().document;
  const page = document.pages.find(entry => entry.id === context.activePageId) ?? document.pages.at(-1);
  if (!page) return { ok: false, text: 'Não encontrei a página aberta. Nada foi mudado.' };
  const transactionId = newTableTransactionId();
  if (action.type === 'table.new') {
    let spec;
    try {
      spec = createTableInsertSpec(page, createNewTableModel({ rows: action.rows, columns: action.columns }), document.style);
    } catch {
      return { ok: false, text: 'Esse tamanho de tabela não dá para criar aqui. Nada foi mudado.' };
    }
    const inserted = session.execute({ type: 'object.insert', pageId: page.id, object: spec }, { transactionId });
    const objectId = inserted.ok ? inserted.metadata.createdIds[0] : undefined;
    if (!inserted.ok || !objectId) return { ok: false, text: 'Não consegui pôr a tabela nesta página. Nada foi mudado.' };
    // The same house look as the toolbar's new table, inside the same Desfazer (best effort, as there).
    completeNewTableLook(session, { pageId: page.id, objectId }, NEW_TABLE_PRESET_ID, transactionId);
    return { ok: true, pageId: page.id, objectId, newPage: false,
      text: `${describeLocalAction(action)}, na página ${pageNumber(document, page.id)}. Fiz sem usar IA. `
        + 'As células ficam vazias: os valores vêm do PDF ou da planilha.' + UNDO_HINT };
  }
  // "no final": after the last page.
  const after = action.atEnd ? document.pages.at(-1)! : page;
  if (action.type === 'page.blank') {
    const added = session.execute({ type: 'page.add', afterPageId: after.id }, { transactionId });
    const pageId = added.ok ? added.metadata.createdIds[0] : undefined;
    if (!added.ok || !pageId) return { ok: false, text: 'Não consegui pôr a página em branco. Nada foi mudado.' };
    return { ok: true, pageId, newPage: true,
      text: `Pus uma página em branco depois da página ${pageNumber(document, after.id)}, sem usar IA.` + UNDO_HINT };
  }
  const inserted = session.execute({ type: 'page.template.insert', templateId: action.templateId, afterPageId: after.id }, { transactionId });
  const pageId = inserted.ok ? inserted.metadata.createdIds[0] : undefined;
  if (!inserted.ok || !pageId) {
    return { ok: false, text: !inserted.ok && inserted.error.code === 'TEMPLATE_NOT_FOUND'
      ? `Este editor não tem a página-modelo ${action.archetypeId}. Use “Usar modelo…” ou peça à IA. Nada foi mudado.`
      : 'Não consegui pôr a página-modelo. Nada foi mudado.' };
  }
  const name = `página-modelo ${action.archetypeId}: ${action.label}`;
  const filled = 'sem usar IA. Os campos “A COMPLETAR” você preenche a partir das fontes.' + UNDO_HINT;
  // An empty open page (a catalog just started) is replaced, as the composer does: no blank page is left behind.
  if (after.objects.length === 0 && session.execute({ type: 'page.delete', pageId: after.id }, { transactionId }).ok) {
    return { ok: true, pageId, newPage: true, text: `Pus a ${name} no lugar da página em branco, ${filled}` };
  }
  return { ok: true, pageId, newPage: true, text: `Pus a ${name} depois da página ${pageNumber(document, after.id)}, ${filled}` };
}

function pageOf(document: CatalogDocument, objectId: string): string | undefined {
  return document.pages.find(page => page.objects.some(object => object.id === objectId
    || (object.type === 'group' && object.objects.some((child: EditorialObject) => child.id === objectId))))?.id;
}

/**
 * A style change found without the AI, as the plan of the conversation that edits: same preview ("Vou fazer isto"),
 * same checks on a copy, same Aplicar (one Desfazer). undefined when the object is gone.
 */
export function planLocalStyle(session: DocumentSession, action: Extract<LocalAction, { type: 'style' }>, message: string,
  selectedObjectIds: readonly string[] = []): EditPlan | undefined {
  const snapshot = session.getSnapshot();
  const pageId = pageOf(snapshot.document, action.objectId);
  if (!pageId) return undefined;
  const outline = buildDocumentOutline(snapshot.document, { activePageId: pageId, selectedObjectIds });
  const ref = [...outline.objects].find(([, entry]) => entry.objectId === action.objectId)?.[0];
  if (!ref) return undefined;
  const change = action.change;
  const intent: EditIntent = change.kind === 'text_size' ? { kind: 'text_size', target: ref, size: change.size }
    : change.kind === 'resize' ? { kind: 'resize', target: ref, size: change.size }
      : change.kind === 'text_weight' ? { kind: 'text_weight', target: ref, weight: change.weight }
        : { kind: 'set_color', target: ref, color: change.color };
  const outcome = planEditIntents(snapshot.document, snapshot.localSequence, outline,
    { status: 'proposal', summary: `${describeLocalAction(action)}, sem usar IA.`, intents: [intent], blocked: [] }, [message]);
  return outcome.status === 'plan' ? outcome.plan : undefined;
}
