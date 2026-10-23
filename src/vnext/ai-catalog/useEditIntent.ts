import React from 'react';
import type { DocumentSession } from '../application';
import {
  applyEditPlan, requestEditIntents, type EditIntentGateway, type EditIntentOutcome, type EditIntentTurn, type EditPlan,
} from './edit-intents';

/**
 * FR-72: the conversation that edits, as a hook for the single assistant
 * (FR-73). The assistant keeps its own conversation; this hook only asks,
 * keeps the plan on screen and applies it. Every answer comes back as one
 * short sentence for the conversation.
 */
export interface UseEditIntentOptions {
  readonly session: DocumentSession;
  readonly gateway?: EditIntentGateway;
  readonly activePageId?: string;
  readonly selectedObjectIds?: readonly string[];
  /** Closes an edit in progress in the editor; false = not now. */
  readonly onBeforeMutation?: () => boolean;
}
export type EditIntentAnswer =
  | { readonly kind: 'plan'; readonly text: string; readonly plan: EditPlan }
  | { readonly kind: 'clarification' | 'refusal' | 'error'; readonly text: string };

export const EDIT_INTENT_STALE = 'O catálogo mudou enquanto a IA respondia. Peça de novo para a versão atual.';
export const EDIT_PLAN_STALE = 'A proposta ficou desatualizada porque o catálogo mudou. Peça de novo à IA.';

/** The sentence the assistant says when the preview card appears. */
export function editOutcomeMessage(outcome: EditIntentOutcome): string {
  if (outcome.status === 'clarification') return outcome.question;
  if (outcome.status === 'refusal') return outcome.reason;
  const { items, blocked, summary } = outcome.plan;
  if (items.length === 0) {
    return 'Não vou mudar nada. ' + (blocked[0] ? blocked[0].reason : 'Não encontrei o que mudar na página aberta.');
  }
  return summary + ' Confira o cartão antes de aplicar' + (blocked.length ? '; uma parte eu não vou fazer.' : '.');
}

export function useEditIntent({ session, gateway, activePageId, selectedObjectIds, onBeforeMutation }: UseEditIntentOptions) {
  const [plan, setPlan] = React.useState<EditPlan>();
  const [busy, setBusy] = React.useState(false);
  const serial = React.useRef(0);
  React.useEffect(() => () => { serial.current += 1; }, []);
  // A plan made for another version of the catalog is never shown as current.
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const current = plan && plan.revision === snapshot.localSequence && plan.documentId === snapshot.document.id ? plan : undefined;

  const ask = React.useCallback(async (message: string, history: readonly EditIntentTurn[] = []): Promise<EditIntentAnswer> => {
    if (!gateway) return { kind: 'error', text: 'A IA não está disponível nesta tela.' };
    const sequence = ++serial.current;
    const before = session.getSnapshot();
    setBusy(true);
    try {
      const outcome = await requestEditIntents(session, message, gateway, history, { activePageId, selectedObjectIds });
      if (sequence !== serial.current) return { kind: 'error', text: '' };
      const now = session.getSnapshot();
      if (now.localSequence !== before.localSequence || now.document.id !== before.document.id) {
        return { kind: 'error', text: EDIT_INTENT_STALE };
      }
      if (outcome.status !== 'plan') { setPlan(undefined); return { kind: outcome.status, text: editOutcomeMessage(outcome) }; }
      setPlan(outcome.plan.items.length ? outcome.plan : undefined);
      return { kind: 'plan', text: editOutcomeMessage(outcome), plan: outcome.plan };
    } finally {
      if (sequence === serial.current) setBusy(false);
    }
  }, [session, gateway, activePageId, selectedObjectIds]);

  const apply = React.useCallback((): { ok: boolean; text: string } => {
    if (!current) return { ok: false, text: EDIT_PLAN_STALE };
    if (onBeforeMutation && !onBeforeMutation()) return { ok: false, text: 'Conclua ou cancele a edição aberta antes de aplicar.' };
    try {
      applyEditPlan(session, current);
      setPlan(undefined);
      return { ok: true, text: `Apliquei ${current.items.length === 1 ? 'a mudança' : `as ${current.items.length} mudanças`}. ` +
        'Um Desfazer volta tudo; depois de revisar, salve.' };
    } catch (failure) {
      setPlan(undefined);
      return { ok: false, text: failure instanceof Error && failure.message === 'EDIT_PLAN_STALE' ? EDIT_PLAN_STALE
        : 'Nada foi mudado: a aplicação foi bloqueada para não estragar o catálogo. Confira o editor e peça de novo.' };
    }
  }, [current, session, onBeforeMutation]);

  const discard = React.useCallback(() => { serial.current += 1; setPlan(undefined); setBusy(false); }, []);
  /** Stops waiting for the answer in flight (its late answer is ignored); a plan already on screen stays. */
  const cancel = React.useCallback(() => { serial.current += 1; setBusy(false); }, []);
  return { plan: current, busy, ask, apply, discard, cancel };
}
