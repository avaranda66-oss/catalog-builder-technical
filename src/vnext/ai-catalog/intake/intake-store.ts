import type { DocumentSession } from '../../application';
import { readSources, type SourceReadOptions } from '../source-intake';
import {
  duplicateEntry, entryFromResult, intakeFileKind, INTAKE_MAX_FILES, skippedEntry, type IntakeEntry,
} from './intake-model';
import type { InsertedSourceTable } from './source-table-insert';

/**
 * FR-64: the files dropped in the assistant live here, outside the assistant panel, so closing the panel, switching
 * to "Ferramentas" or pressing Esc never throws them away. One intake per catalog (by document id), kept only in the
 * memory of this tab: the File objects are never written to IndexedDB, localStorage or the server.
 *
 * Files are read one at a time (a 50 MB PDF never competes with a photo for memory), a file that fails becomes an
 * error entry and never stops the others, and a file with the same content as one already in the list (same
 * SHA-256) is not read again.
 */

export interface SourceIntakeDependencies {
  /** Defaults to the robust reader of FR-65 (`readSources`); tests may slow it down or count calls. */
  readonly read?: typeof readSources;
  /** Defaults to SHA-256 with WebCrypto. */
  readonly digest?: (file: File) => Promise<string>;
  /** Catalog language for numbers, dates and Sim/Não (default pt-BR). */
  readonly locale?: string;
}

type Listener = () => void;

/** The smallest external store React's useSyncExternalStore needs. */
export interface ValueStore<T> {
  readonly get: () => T;
  readonly set: (next: T) => void;
  readonly subscribe: (listener: Listener) => () => void;
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

async function fileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('SOURCE_READ_FAILED'));
    reader.readAsArrayBuffer(file);
  });
}

export async function sha256OfFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await fileBytes(file));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export interface SourceFileStore {
  readonly getEntries: () => readonly IntakeEntry[];
  readonly subscribe: (listener: Listener) => () => void;
  /** The reader, digest and locale used from now on (the panel passes them on every render). */
  readonly configure: (dependencies: SourceIntakeDependencies) => void;
  /** Adds files to the list and reads them in order. */
  readonly addFiles: (files: readonly File[]) => void;
  /** Reads one file again with other options (hidden data, a range, other PDF pages). */
  readonly reread: (id: string, options: SourceReadOptions) => void;
  readonly remove: (id: string) => void;
  readonly clear: () => void;
}

let entrySerial = 0;
const nextEntryId = () => `intake-${Date.now().toString(36)}-${++entrySerial}`;

/** Files counted against the limit: everything still in the list except repeated and skipped ones. */
const countsAgainstLimit = (entry: IntakeEntry) => entry.state !== 'duplicate' && entry.state !== 'skipped';

export function createSourceFileStore(): SourceFileStore {
  const entries = createValueStore<readonly IntakeEntry[]>([]);
  let dependencies: SourceIntakeDependencies = {};
  /** Every read gets a ticket; an answer for an old ticket (file removed or read again) is dropped. */
  const tickets = new Map<string, number>();
  let queue: Promise<void> = Promise.resolve();

  const commit = (update: (current: readonly IntakeEntry[]) => readonly IntakeEntry[]) => entries.set(update(entries.get()));
  const patch = (id: string, update: (entry: IntakeEntry) => IntakeEntry) =>
    commit((current) => current.map((entry) => entry.id === id ? update(entry) : entry));

  const schedule = (id: string, checkDuplicate: boolean) => {
    const ticket = (tickets.get(id) ?? 0) + 1;
    tickets.set(id, ticket);
    const current = () => tickets.get(id) === ticket ? entries.get().find((entry) => entry.id === id) : undefined;
    queue = queue.then(async () => {
      const entry = current();
      if (!entry) return;
      try {
        if (checkDuplicate) {
          const sha256 = await (dependencies.digest ?? sha256OfFile)(entry.file);
          if (!current()) return;
          const list = entries.get();
          const earlier = list.find((other) => other.id !== id && other.sha256 === sha256 &&
            other.state !== 'duplicate' && other.state !== 'skipped' && list.indexOf(other) < list.indexOf(entry));
          if (earlier) { patch(id, (live) => duplicateEntry(live, sha256, earlier)); return; }
          patch(id, (live) => ({ ...live, sha256 }));
        }
        const options = { locale: dependencies.locale, ...entry.options };
        const [result] = await (dependencies.read ?? readSources)([entry.file], options);
        if (!current()) return;
        patch(id, (live) => entryFromResult(live, result));
      } catch {
        if (current()) patch(id, (live) => entryFromResult(live, undefined));
      }
    });
  };

  const forget = (id: string) => tickets.set(id, (tickets.get(id) ?? 0) + 1);

  return {
    getEntries: entries.get,
    subscribe: entries.subscribe,
    configure: (next) => { dependencies = next; },
    addFiles: (files) => {
      if (!files.length) return;
      const added: IntakeEntry[] = [];
      let counted = entries.get().filter(countsAgainstLimit).length;
      for (const file of files) {
        const base: IntakeEntry = { id: nextEntryId(), file, fileName: file.name || 'arquivo sem nome',
          kind: intakeFileKind(file.name), state: 'reading', options: {} };
        if (counted >= INTAKE_MAX_FILES) { added.push(skippedEntry(base)); continue; }
        counted++;
        added.push(base);
      }
      commit((current) => [...current, ...added]);
      for (const entry of added) if (entry.state === 'reading') schedule(entry.id, true);
    },
    reread: (id, options) => {
      const entry = entries.get().find((item) => item.id === id);
      if (!entry || entry.state === 'duplicate' || entry.state === 'skipped') return;
      patch(id, (live) => ({ ...live, state: 'reading', options: { ...live.options, ...options } }));
      schedule(id, false);
    },
    remove: (id) => {
      forget(id);
      commit((current) => current.filter((entry) => entry.id !== id));
    },
    clear: () => {
      for (const entry of entries.get()) forget(entry.id);
      commit(() => []);
    },
  };
}

export type SourceTableInsertionPhase = 'idle' | 'measuring' | 'splitting';
export interface SourceTableInsertionNotice {
  readonly tone: 'success' | 'info' | 'error';
  readonly text: string;
}
/** A table inserted from a file that still waits for the editor's measurement (it continues on the next pages). */
export interface PendingSourceTable {
  readonly inserted: InsertedSourceTable;
  /** The editing session it was inserted in; another session (catalog opened again) never resumes it. */
  readonly session: DocumentSession;
}
export interface SourceTableInsertionState {
  readonly phase: SourceTableInsertionPhase;
  readonly pending: PendingSourceTable | null;
  readonly notice: SourceTableInsertionNotice | null;
}

export const IDLE_INSERTION: SourceTableInsertionState = { phase: 'idle', pending: null, notice: null };

/** Everything the assistant knows about the files of one catalog: the list, and a table waiting for its measurement. */
export interface SourceIntakeSession {
  readonly files: SourceFileStore;
  readonly insertion: ValueStore<SourceTableInsertionState>;
}

export function createSourceIntakeSession(): SourceIntakeSession {
  return { files: createSourceFileStore(), insertion: createValueStore(IDLE_INSERTION) };
}

/** Catalogs whose files stay in memory; the oldest one is let go when a 4th catalog is opened in this tab. */
export const INTAKE_SESSIONS_KEPT = 3;
const sessions = new Map<string, SourceIntakeSession>();

/** The intake of the catalog with this document id, the same one every time the assistant opens in this tab. */
export function sourceIntakeSessionFor(documentId: string): SourceIntakeSession {
  const known = sessions.get(documentId);
  if (known) {
    // Most recently used last.
    sessions.delete(documentId);
    sessions.set(documentId, known);
    return known;
  }
  const created = createSourceIntakeSession();
  sessions.set(documentId, created);
  while (sessions.size > INTAKE_SESSIONS_KEPT) {
    const [oldestId, oldest] = sessions.entries().next().value as [string, SourceIntakeSession];
    oldest.files.clear();
    sessions.delete(oldestId);
  }
  return created;
}

/** Tests only: start from an empty memory. */
export function forgetSourceIntakeSessions(): void {
  for (const session of sessions.values()) session.files.clear();
  sessions.clear();
}

/**
 * Files dropped anywhere on the assistant (not only on the box): they join the list, unless a table is being inserted
 * right now. Returns whether they were taken.
 */
export function dropIntoIntake(session: SourceIntakeSession, files: readonly File[]): boolean {
  if (!files.length || session.insertion.get().phase !== 'idle') return false;
  const state = session.insertion.get();
  if (state.notice) session.insertion.set({ ...state, notice: null });
  session.files.addFiles(files);
  return true;
}
