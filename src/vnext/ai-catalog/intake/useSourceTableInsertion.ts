import React from 'react';
import type { DocumentSession } from '../../application';
import { newTableTransactionId } from '../../app/editor/table-paste-actions';
import type { FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import {
  createValueStore, IDLE_INSERTION, type SourceTableInsertionNotice, type SourceTableInsertionPhase,
  type SourceTableInsertionState, type ValueStore,
} from './intake-store';
import {
  finishSourceTableInsert, insertSourceTable, planSourceTableFollowUp, sourceTableNotMeasured,
  type SettledSourceTableFollowUp, type SourceTableChoice,
} from './source-table-insert';

/**
 * FR-64: "Inserir como tabela" from the assistant. Inserts at once, then waits for the editor to measure the new
 * table and, when it is taller than the page, continues it on the next pages under the same transactionId (FR-35).
 *
 * With a `store` (the catalog's intake) the wait outlives the panel: closed while measuring, it goes on when the
 * assistant opens again, and only if nothing changed in the catalog meanwhile (otherwise the message says how to
 * finish by hand).
 */

export type { SourceTableInsertionNotice, SourceTableInsertionPhase } from './intake-store';

/** Longest wait for the editor's measurement before asking the person to finish by hand. */
export const SOURCE_TABLE_MEASURE_TIMEOUT_MS = 12_000;

export interface SourceTableInsertionOptions {
  readonly session: DocumentSession;
  /** The editor's current measurement of the catalog (null while it measures). */
  readonly measurement?: FitHeightMeasurement | null;
  /** Page open in the editor; a page with content gets the table on a new page after it. */
  readonly activePageId?: string;
  /** Finishes any open text or cell edit first; false leaves everything as it is. */
  readonly onBeforeMutation?: () => boolean;
  /** Shows the new table in the editor once it is done. */
  readonly onShowTable?: (pageId: string, objectId: string) => void;
  /** The catalog's insertion state, kept outside the panel; a private one when left out. */
  readonly store?: ValueStore<SourceTableInsertionState>;
}

export interface SourceTableInsertion {
  readonly phase: SourceTableInsertionPhase;
  readonly notice: SourceTableInsertionNotice | null;
  readonly insert: (choice: SourceTableChoice) => boolean;
  readonly dismissNotice: () => void;
}

/** Runs the callback after the browser painted (so the "working" text is on screen first); a timer covers background tabs. */
function afterNextPaint(callback: () => void): () => void {
  let done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const once = () => {
    if (done) return;
    done = true;
    callback();
  };
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => { timers.push(setTimeout(once, 0)); });
    timers.push(setTimeout(once, 250));
  } else {
    timers.push(setTimeout(once, 0));
  }
  return () => { done = true; timers.forEach(clearTimeout); };
}

export function useSourceTableInsertion(options: SourceTableInsertionOptions): SourceTableInsertion {
  const latest = React.useRef(options);
  latest.current = options;
  const [own] = React.useState(() => createValueStore(IDLE_INSERTION));
  const store = options.store ?? own;
  const state = React.useSyncExternalStore(store.subscribe, store.get, store.get);
  const alive = React.useRef(true);
  /** Cancels a split waiting for the next paint (when the panel closes); a new measurement does not cancel it. */
  const cancelSplit = React.useRef<(() => void) | null>(null);

  // A table inserted in another editing session (the catalog opened again) is never resumed here.
  const pending = state.pending && state.pending.session === options.session ? state.pending.inserted : null;
  const phase: SourceTableInsertionPhase = pending ? state.phase : 'idle';
  React.useEffect(() => {
    if (state.pending && state.pending.session !== options.session) store.set({ ...store.get(), pending: null, phase: 'idle' });
  }, [state.pending, options.session, store]);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Closed while the split waited for the paint: nothing ran, so it waits for the measurement again when the
      // assistant opens (the catalog must not change after the editor is gone).
      if (cancelSplit.current) {
        cancelSplit.current();
        cancelSplit.current = null;
        const current = store.get();
        if (current.phase === 'splitting') store.set({ ...current, phase: 'measuring' });
      }
    };
  }, [store]);

  const settle = React.useCallback((outcome: SettledSourceTableFollowUp) => {
    store.set({ phase: 'idle', pending: null, notice: { tone: outcome.kind === 'done' ? 'success' : 'info', text: outcome.message } });
    if (alive.current && outcome.pageIds[0]) latest.current.onShowTable?.(outcome.pageIds[0], outcome.objectId);
  }, [store]);

  const insert = React.useCallback((choice: SourceTableChoice): boolean => {
    if (pending) return false;
    const { session, activePageId, onBeforeMutation } = latest.current;
    if (onBeforeMutation && !onBeforeMutation()) {
      store.set({ ...store.get(), notice: { tone: 'error', text: 'Conclua ou cancele a edição aberta na página antes de inserir a tabela.' } });
      return false;
    }
    const outcome = insertSourceTable(session, activePageId, choice, newTableTransactionId());
    if (!outcome.ok) {
      store.set({ ...store.get(), notice: { tone: 'error', text: outcome.message } });
      return false;
    }
    store.set({ phase: 'measuring', pending: { inserted: outcome.inserted, session }, notice: { tone: 'info', text: 'Tabela inserida. Medindo a página…' } });
    return true;
  }, [pending, store]);

  const measurement = options.measurement;
  React.useEffect(() => {
    if (!pending || phase !== 'measuring') return;
    const { session } = latest.current;
    const plan = planSourceTableFollowUp(session, pending, measurement);
    if (plan.kind === 'wait') return;
    if (plan.kind !== 'split') {
      const outcome = finishSourceTableInsert(session, pending, measurement);
      if (outcome.kind !== 'wait') settle(outcome);
      return;
    }
    store.set({ ...store.get(), phase: 'splitting',
      notice: { tone: 'info', text: 'A tabela não cabe numa página. Levando as linhas para as próximas páginas…' } });
    // The split is long work on big tables: show the text first, then run it on the measurement it was planned with.
    cancelSplit.current = afterNextPaint(() => {
      cancelSplit.current = null;
      const outcome = finishSourceTableInsert(latest.current.session, pending, measurement);
      settle(outcome.kind === 'wait' ? sourceTableNotMeasured(latest.current.session, pending) : outcome);
    });
  }, [pending, phase, measurement, settle, store]);

  React.useEffect(() => {
    if (!pending || phase !== 'measuring') return undefined;
    const timer = setTimeout(() => settle(sourceTableNotMeasured(latest.current.session, pending)),
      SOURCE_TABLE_MEASURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending, phase, settle]);

  const dismissNotice = React.useCallback(() => {
    const current = store.get();
    if (current.notice) store.set({ ...current, notice: null });
  }, [store]);
  return { phase, notice: state.notice, insert, dismissNotice };
}
