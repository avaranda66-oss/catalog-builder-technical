import { useCatalogStore } from './useCatalogStore';
import { useLibraryStore } from './useLibraryStore';
import { useWorkbookDraftStore } from './useWorkbookDraftStore';
import { useUIStore } from './useUIStore';

export type ActiveEditingSurface = 'catalog' | 'template' | 'library' | 'workbook';

type ActiveEditingContext = {
  surface: ActiveEditingSurface;
  resourceId?: string;
  generation: number;
  save: () => Promise<unknown>;
};

let generation = 0;
let activeContext: ActiveEditingContext | null = null;

export const activeEditingContext = {
  activateWorkbook(resourceId: string, save: () => Promise<unknown>) {
    generation += 1;
    activeContext = { surface: 'workbook', resourceId, generation, save };
    return generation;
  },

  release(generationToRelease?: number) {
    if (!activeContext || (generationToRelease && activeContext.generation !== generationToRelease)) return;
    activeContext = null;
  },

  async save() {
    if (activeContext) return activeContext.save();

    if (useUIStore.getState().activeTab === 'library') {
      return useLibraryStore.getState().flushLibraryEdits();
    }

    return useCatalogStore.getState().saveActiveDocument();
  },

  get() {
    return activeContext;
  }
};

export function createWorkbookSaveTarget(
  owner: { kind: 'product'; id: string },
  repository: Parameters<ReturnType<typeof useWorkbookDraftStore.getState>['save']>[1]
) {
  return () => useWorkbookDraftStore.getState().save(owner, repository);
}
