import { beforeEach, describe, expect, it, vi } from 'vitest';

const flushLibraryEdits = vi.fn(async () => 'library');
const saveActiveDocument = vi.fn(async () => 'catalog');
let activeTab = 'library';

vi.mock('@/stores/useLibraryStore', () => ({
  useLibraryStore: {
    getState: () => ({ flushLibraryEdits })
  }
}));

vi.mock('@/stores/useCatalogStore', () => ({
  useCatalogStore: {
    getState: () => ({ saveActiveDocument })
  }
}));

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: {
    getState: () => ({ activeTab })
  }
}));

import { activeEditingContext } from '../../src/stores/activeEditingContext';

describe('C2 Active Editing Context save routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeTab = 'library';
    activeEditingContext.release();
  });

  it('C2-T1 workbook has priority over library and catalog', async () => {
    const saveWorkbook = vi.fn(async () => 'workbook');
    activeEditingContext.activateWorkbook('P', saveWorkbook);

    await activeEditingContext.save();

    expect(saveWorkbook).toHaveBeenCalledTimes(1);
    expect(flushLibraryEdits).not.toHaveBeenCalled();
    expect(saveActiveDocument).not.toHaveBeenCalled();
  });

  it('C2-T2 library fallback remains canonical', async () => {
    await activeEditingContext.save();
    expect(flushLibraryEdits).toHaveBeenCalledTimes(1);
  });

  it('C2-T3 non-library fallback remains document save', async () => {
    activeTab = 'editor';
    await activeEditingContext.save();
    expect(saveActiveDocument).toHaveBeenCalledTimes(1);
  });

  it('C2-T5 stale generation cleanup cannot remove newer workbook', async () => {
    const p = vi.fn(async () => 'P');
    const q = vi.fn(async () => 'Q');
    const pGeneration = activeEditingContext.activateWorkbook('P', p);
    activeEditingContext.activateWorkbook('Q', q);

    activeEditingContext.release(pGeneration);
    await activeEditingContext.save();

    expect(q).toHaveBeenCalledTimes(1);
    expect(p).not.toHaveBeenCalled();
  });

  it('C2 lifecycle release removes current registration only', async () => {
    const save = vi.fn(async () => 'workbook');
    const generation = activeEditingContext.activateWorkbook('P', save);
    activeEditingContext.release(generation);

    await activeEditingContext.save();
    expect(save).not.toHaveBeenCalled();
    expect(flushLibraryEdits).toHaveBeenCalledTimes(1);
  });
});
