import React from 'react';
import type { DocumentSession } from '../../application';
import { newTableTransactionId } from '../../app/editor/table-paste-actions';
import type { FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import {
  finishSourceTableInsert, insertSourceTable, planSourceTableFollowUp, sourceTableNotMeasured,
  type InsertedSourceTable, type SourceTableChoice, type SourceTableFollowUp,
} from './source-table-insert';

/**
 * FR-64: "Inserir como tabela" from the assistant. Inserts at once, then waits for the editor to measure the new
 * table and, when it is taller than the page, continues it on the next pages under the same transactionId (FR-35).
 */

/** Longest wait for the editor's measurement before asking the person to finish by hand. */
export const SOURCE_TABLE_MEASURE_TIMEOUT_MS = 12_000;

export type SourceTableInsertionPhase = 'idle' | 'measuring' | 'splitting';
export interface SourceTableInsertionNotice {
  readonly tone: 'success' | 'info' | 'error';
  readonly text: string;
}

export interface SourceTableInsertionOptions {
  readonly session: DocumentSession;
  /** The editor's current measurement of the catalog (null while it measures). */
  readonly measurement?: FitHeightMeasurement | null;
  /** Page open in the editor; a page with content gets the table on a new page right after it. */
  readonly activePageId?: string;
  /** Finishes any open text or cell edit first; false leaves everything as it is. */
  readonly onBeforeMutation?: () => boolean;
  /** Shows the new table in the editor once it is done. */
  readonly onShowTable?: (pageId: string, objectId: string) => void;
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
  const [pending, setPending] = React.useState<InsertedSourceTable | null>(null);
  const [phase, setPhase] = React.useState<SourceTableInsertionPhase>('idle');
  const [notice, setNotice] = React.useState<SourceTableInsertionNotice | null>(null);
  const alive = React.useRef(true);
  /** Cancels a split waiting for the next paint; only unmounting cancels it, a new measurement does not. */
  const cancelSplit = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelSplit.current?.();
      cancelSplit.current = null;
    };
  }, []);

  const settle = React.useCallback((inserted: InsertedSourceTable, outcome: Exclude<SourceTableFollowUp, { kind: 'wait' }>) => {
    if (!alive.current) return;
    setPending(null);
    setPhase('idle');
    setNotice({ tone: outcome.kind === 'done' ? 'success' : 'info', text: outcome.message });
    if (outcome.pageIds[0]) latest.current.onShowTable?.(outcome.pageIds[0], inserted.objectId);
  }, []);

  const insert = React.useCallback((choice: SourceTableChoice): boolean => {
    if (pending) return false;
    const { session, activePageId, onBeforeMutation } = latest.current;
    if (onBeforeMutation && !onBeforeMutation()) {
      setNotice({ tone: 'error', text: 'Conclua ou cancele a edição aberta na página antes de inserir a tabela.' });
      return false;
    }
    const outcome = insertSourceTable(session, activePageId, choice, newTableTransactionId());
    if (!outcome.ok) {
      setNotice({ tone: 'error', text: outcome.message });
      return false;
    }
    setPending(outcome.inserted);
    setPhase('measuring');
    setNotice({ tone: 'info', text: 'Tabela inserida. Medindo a página…' });
    return true;
  }, [pending]);

  const measurement = options.measurement;
  React.useEffect(() => {
    if (!pending || phase !== 'measuring') return;
    const { session } = latest.current;
    const plan = planSourceTableFollowUp(session, pending, measurement);
    if (plan.kind === 'wait') return;
    if (plan.kind !== 'split') {
      const outcome = finishSourceTableInsert(session, pending, measurement);
      if (outcome.kind !== 'wait') settle(pending, outcome);
      return;
    }
    setPhase('splitting');
    setNotice({ tone: 'info', text: 'A tabela não cabe numa página. Levando as linhas para as próximas páginas…' });
    // The split is long work on big tables: show the text first, then run it on the measurement it was planned with.
    cancelSplit.current = afterNextPaint(() => {
      cancelSplit.current = null;
      const outcome = finishSourceTableInsert(latest.current.session, pending, measurement);
      settle(pending, outcome.kind === 'wait' ? sourceTableNotMeasured(latest.current.session, pending) : outcome);
    });
  }, [pending, phase, measurement, settle]);

  React.useEffect(() => {
    if (!pending || phase !== 'measuring') return undefined;
    const timer = setTimeout(() => settle(pending, sourceTableNotMeasured(latest.current.session, pending)),
      SOURCE_TABLE_MEASURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending, phase, settle]);

  const dismissNotice = React.useCallback(() => setNotice(null), []);
  return { phase, notice, insert, dismissNotice };
}
