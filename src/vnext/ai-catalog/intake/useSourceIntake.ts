import React from 'react';
import { readSources, type SourceReadOptions } from '../source-intake';
import {
  duplicateEntry, entryFromResult, intakeFileKind, INTAKE_MAX_FILES, skippedEntry, type IntakeEntry,
} from './intake-model';

/**
 * FR-64: the files dropped in the assistant, each with its own state. Files are read one at a time (a 50 MB PDF
 * never competes with a photo for memory), a file that fails becomes an error entry and never stops the others,
 * and a file with the same content as one already in the list (same SHA-256) is not read again.
 * Spreadsheets and CSV are read only in this browser; nothing here sends a file anywhere.
 */

export interface SourceIntakeDependencies {
  /** Defaults to the robust reader of FR-65 (`readSources`); tests may slow it down or count calls. */
  readonly read?: typeof readSources;
  /** Defaults to SHA-256 with WebCrypto. */
  readonly digest?: (file: File) => Promise<string>;
  /** Catalog language for numbers, dates and Sim/Não (default pt-BR). */
  readonly locale?: string;
}

export interface SourceIntakeController {
  readonly entries: readonly IntakeEntry[];
  /** Adds files to the list and reads them in order. */
  readonly addFiles: (files: readonly File[]) => void;
  /** Reads one file again with other options (hidden data, a range, other PDF pages). */
  readonly reread: (id: string, options: SourceReadOptions) => void;
  readonly remove: (id: string) => void;
  readonly clear: () => void;
  /** True while any file is still being read. */
  readonly busy: boolean;
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

let entrySerial = 0;
const nextEntryId = () => `intake-${Date.now().toString(36)}-${++entrySerial}`;

/** Files counted against the limit: everything still in the list except repeated and skipped ones. */
const countsAgainstLimit = (entry: IntakeEntry) => entry.state !== 'duplicate' && entry.state !== 'skipped';

export function useSourceIntake(dependencies: SourceIntakeDependencies = {}): SourceIntakeController {
  const [entries, setEntries] = React.useState<readonly IntakeEntry[]>([]);
  const entriesRef = React.useRef<readonly IntakeEntry[]>([]);
  const deps = React.useRef(dependencies);
  deps.current = dependencies;
  const alive = React.useRef(true);
  /** Every read gets a ticket; an answer for an old ticket (file removed or read again) is dropped. */
  const tickets = React.useRef(new Map<string, number>());
  const queue = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const commit = React.useCallback((update: (current: readonly IntakeEntry[]) => readonly IntakeEntry[]) => {
    const next = update(entriesRef.current);
    entriesRef.current = next;
    if (alive.current) setEntries(next);
  }, []);
  const patch = React.useCallback((id: string, update: (entry: IntakeEntry) => IntakeEntry) => {
    commit((current) => current.map((entry) => entry.id === id ? update(entry) : entry));
  }, [commit]);

  const schedule = React.useCallback((id: string, checkDuplicate: boolean) => {
    const ticket = (tickets.current.get(id) ?? 0) + 1;
    tickets.current.set(id, ticket);
    const current = () => alive.current && tickets.current.get(id) === ticket
      ? entriesRef.current.find((entry) => entry.id === id) : undefined;
    queue.current = queue.current.then(async () => {
      const entry = current();
      if (!entry) return;
      try {
        if (checkDuplicate) {
          const sha256 = await (deps.current.digest ?? sha256OfFile)(entry.file);
          if (!current()) return;
          const earlier = entriesRef.current.find((other) => other.id !== id && other.sha256 === sha256 &&
            other.state !== 'duplicate' && other.state !== 'skipped' &&
            entriesRef.current.indexOf(other) < entriesRef.current.indexOf(entry));
          if (earlier) { patch(id, (live) => duplicateEntry(live, sha256, earlier)); return; }
          patch(id, (live) => ({ ...live, sha256 }));
        }
        const options = { locale: deps.current.locale, ...entry.options };
        const [result] = await (deps.current.read ?? readSources)([entry.file], options);
        if (!current()) return;
        patch(id, (live) => entryFromResult(live, result));
      } catch {
        if (current()) patch(id, (live) => entryFromResult(live, undefined));
      }
    });
  }, [patch]);

  const addFiles = React.useCallback((files: readonly File[]) => {
    if (!files.length) return;
    const added: IntakeEntry[] = [];
    let counted = entriesRef.current.filter(countsAgainstLimit).length;
    for (const file of files) {
      const base: IntakeEntry = { id: nextEntryId(), file, fileName: file.name || 'arquivo sem nome',
        kind: intakeFileKind(file.name), state: 'reading', options: {} };
      if (counted >= INTAKE_MAX_FILES) { added.push(skippedEntry(base)); continue; }
      counted++;
      added.push(base);
    }
    commit((current) => [...current, ...added]);
    for (const entry of added) if (entry.state === 'reading') schedule(entry.id, true);
  }, [commit, schedule]);

  const reread = React.useCallback((id: string, options: SourceReadOptions) => {
    const entry = entriesRef.current.find((item) => item.id === id);
    if (!entry || entry.state === 'duplicate' || entry.state === 'skipped') return;
    patch(id, (live) => ({ ...live, state: 'reading', options: { ...live.options, ...options } }));
    schedule(id, false);
  }, [patch, schedule]);

  const remove = React.useCallback((id: string) => {
    tickets.current.set(id, (tickets.current.get(id) ?? 0) + 1);
    commit((current) => current.filter((entry) => entry.id !== id));
  }, [commit]);

  const clear = React.useCallback(() => {
    for (const entry of entriesRef.current) tickets.current.set(entry.id, (tickets.current.get(entry.id) ?? 0) + 1);
    commit(() => []);
  }, [commit]);

  return { entries, addFiles, reread, remove, clear, busy: entries.some((entry) => entry.state === 'reading') };
}
