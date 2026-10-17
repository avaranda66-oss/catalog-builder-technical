import React from 'react';
import type { SourceReadOptions } from '../source-intake';
import type { IntakeEntry } from './intake-model';
import { createSourceFileStore, type SourceFileStore, type SourceIntakeDependencies } from './intake-store';

/**
 * FR-64: the files dropped in the assistant, each with its own state (see intake-store.ts for how they are read).
 * With a `store` (the catalog's intake) the list outlives the panel; without one, the list belongs to this component.
 * Spreadsheets and CSV are read only in this browser; nothing here sends a file anywhere.
 */

export { sha256OfFile, type SourceIntakeDependencies } from './intake-store';

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

export interface SourceIntakeOptions extends SourceIntakeDependencies {
  /** The catalog's intake, kept outside the panel; a private one when left out. */
  readonly store?: SourceFileStore;
}

export function useSourceIntake({ store: shared, ...dependencies }: SourceIntakeOptions = {}): SourceIntakeController {
  const [own] = React.useState(createSourceFileStore);
  const store = shared ?? own;
  // The reader runs outside React (it keeps going while the panel is closed): give it the latest settings.
  store.configure(dependencies);
  const entries = React.useSyncExternalStore(store.subscribe, store.getEntries, store.getEntries);
  return {
    entries,
    addFiles: store.addFiles,
    reread: store.reread,
    remove: store.remove,
    clear: store.clear,
    busy: entries.some((entry) => entry.state === 'reading'),
  };
}
