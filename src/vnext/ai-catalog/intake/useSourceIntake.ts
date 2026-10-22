import React from 'react';
import type { SourceReadOptions } from '../source-intake';
import { modelCodesFromFacts, modelCodesFromTable, resolvePhotoLinks, uniqueModelCodes, type PhotoLink } from '../photo-matching';
import { imageBlocks, tableBlocks, type IntakeEntry } from './intake-model';
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
  /** FR-71: the model codes found in the dropped tables and in the extracted facts, the products a photo can belong to. */
  readonly productCodes: readonly string[];
  /** FR-71: for each photo (by entry id) the product it is linked to, or the question to ask. */
  readonly photoLinks: ReadonlyMap<string, PhotoLink>;
  /** FR-71: the person's choice of product for a photo; `undefined` goes back to what the file name says. */
  readonly linkPhoto: (id: string, code: string | undefined) => void;
}

export interface SourceIntakeOptions extends SourceIntakeDependencies {
  /** The catalog's intake, kept outside the panel; a private one when left out. */
  readonly store?: SourceFileStore;
  /** FR-71: model names from the extracted facts, besides the tables dropped here (the J2-lite flow passes them). */
  readonly factModels?: readonly string[];
}

export function useSourceIntake({ store: shared, factModels, ...dependencies }: SourceIntakeOptions = {}): SourceIntakeController {
  const [own] = React.useState(createSourceFileStore);
  const store = shared ?? own;
  // The reader runs outside React (it keeps going while the panel is closed): give it the latest settings.
  store.configure(dependencies);
  const entries = React.useSyncExternalStore(store.subscribe, store.getEntries, store.getEntries);
  const productCodes = React.useMemo(() => uniqueModelCodes([
    ...entries.filter((entry) => entry.kind !== 'photo' && (entry.state === 'ready' || entry.state === 'needs-help'))
      .flatMap((entry) => tableBlocks(entry.intake).flatMap(modelCodesFromTable)),
    ...modelCodesFromFacts(factModels ?? []),
  ]), [entries, factModels]);
  const photoLinks = React.useMemo(() => resolvePhotoLinks(
    entries.filter((entry) => entry.kind === 'photo' && imageBlocks(entry.intake).length > 0)
      .map((entry) => ({ id: entry.id, fileName: entry.fileName, chosen: entry.photoProduct })),
    productCodes,
  ), [entries, productCodes]);
  return {
    entries,
    addFiles: store.addFiles,
    reread: store.reread,
    remove: store.remove,
    clear: store.clear,
    busy: entries.some((entry) => entry.state === 'reading'),
    productCodes,
    photoLinks,
    linkPhoto: store.choosePhotoProduct,
  };
}
