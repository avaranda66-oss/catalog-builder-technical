import type { CatalogDocument } from '../domain';
import type {
  ApplicationAction,
  ApplicationActionResult,
  ApplicationExecutionContext,
  IdGenerator,
} from './contracts';
import { parseCanonicalDocument } from './document';
import { executeApplicationAction } from './execute';

export interface DocumentSessionSnapshot {
  document: CatalogDocument;
  canUndo: boolean;
  canRedo: boolean;
}

export type HistoryResult =
  | { ok: true; snapshot: DocumentSessionSnapshot }
  | { ok: false; error: { code: 'NOTHING_TO_UNDO' | 'NOTHING_TO_REDO'; details: string } };

export interface DocumentSession {
  getSnapshot(): DocumentSessionSnapshot;
  subscribe(listener: () => void): () => void;
  execute(action: ApplicationAction, context?: ApplicationExecutionContext): ApplicationActionResult;
  undo(): HistoryResult;
  redo(): HistoryResult;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function createDocumentSession(
  initialDocument: CatalogDocument,
  dependencies: { createId: IdGenerator }
): DocumentSession {
  let current = deepFreeze(parseCanonicalDocument(initialDocument));
  const undoStack: CatalogDocument[] = [];
  const redoStack: CatalogDocument[] = [];
  const listeners = new Set<() => void>();
  let lastTransactionId: string | undefined;
  let snapshot: DocumentSessionSnapshot = deepFreeze({ document: current, canUndo: false, canRedo: false });

  const publish = (): void => {
    snapshot = deepFreeze({
      document: current,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    });
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    execute: (action, context) => {
      const result = executeApplicationAction(current, action, dependencies);
      if (!result.ok) return result;
      if (!result.metadata.changed) return { ...result, document: current };

      const coalesces = Boolean(context?.transactionId && context.transactionId === lastTransactionId);
      if (!coalesces) undoStack.push(current);
      redoStack.length = 0;
      current = deepFreeze(result.document);
      lastTransactionId = context?.transactionId;
      publish();
      return { ...result, document: current };
    },
    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return { ok: false, error: { code: 'NOTHING_TO_UNDO', details: 'No prior document snapshot' } };
      redoStack.push(current);
      current = previous;
      lastTransactionId = undefined;
      publish();
      return { ok: true, snapshot };
    },
    redo: () => {
      const next = redoStack.pop();
      if (!next) return { ok: false, error: { code: 'NOTHING_TO_REDO', details: 'No later document snapshot' } };
      undoStack.push(current);
      current = next;
      lastTransactionId = undefined;
      publish();
      return { ok: true, snapshot };
    },
  };
}
