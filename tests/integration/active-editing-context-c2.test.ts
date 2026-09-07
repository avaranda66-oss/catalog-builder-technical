import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkbook, ensureWorkbookV2, type ProductWorkbookV2, type WorkbookOwner } from '@/domain/product-workbook';
import type { ProductWorkbookRepository, SaveWorkbookParams, SaveWorkbookResult } from '@/services/product-workbook';
import { useAuthStore } from '@/stores/useAuthStore';
import { useWorkbookDraftStore } from '@/stores/useWorkbookDraftStore';

const flushLibraryEdits = vi.fn(async () => 'library');
const saveActiveDocument = vi.fn(async () => 'catalog');
let activeTab = 'library';
let editorContext: { kind: 'catalog'; catalogId: string } | { kind: 'template'; templateId: string } = {
  kind: 'catalog',
  catalogId: 'catalog-c2'
};

vi.mock('@/stores/useLibraryStore', () => ({
  useLibraryStore: {
    getState: () => ({ flushLibraryEdits })
  }
}));

vi.mock('@/stores/useCatalogStore', () => ({
  useCatalogStore: {
    getState: () => ({ saveActiveDocument, editorContext })
  }
}));

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: {
    getState: () => ({ activeTab })
  }
}));

import { activeEditingContext, createWorkbookSaveTarget } from '../../src/stores/activeEditingContext';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function workbookFixture(ownerId = 'product-c2', revision = 1): ProductWorkbookV2 {
  return ensureWorkbookV2(createWorkbook({
    owner: { kind: 'product', id: ownerId },
    revision
  }));
}

function cloneWorkbook(workbook: ProductWorkbookV2, revision = workbook.revision): ProductWorkbookV2 {
  return JSON.parse(JSON.stringify({ ...workbook, revision })) as ProductWorkbookV2;
}

function mockRepository(initial: ProductWorkbookV2 | null) {
  const getWorkbook = vi.fn(async (_owner: WorkbookOwner) => initial ? cloneWorkbook(initial) : null);
  const saveWorkbook = vi.fn<ProductWorkbookRepository['saveWorkbook']>();
  const repository: ProductWorkbookRepository = { getWorkbook, saveWorkbook };
  return { repository, getWorkbook, saveWorkbook };
}

describe('C2 Active Editing Context save routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeTab = 'library';
    editorContext = { kind: 'catalog', catalogId: 'catalog-c2' };
    activeEditingContext.release();
    useWorkbookDraftStore.getState().resetForTests();
    useAuthStore.setState({ userId: 'c2-active-editing-user' });
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

  it('C2-T4 template editor delegates exactly once to the existing saveActiveDocument authority', async () => {
    activeTab = 'editor';
    editorContext = { kind: 'template', templateId: 'template-c2' };

    await activeEditingContext.save();

    expect(saveActiveDocument).toHaveBeenCalledTimes(1);
    expect(flushLibraryEdits).not.toHaveBeenCalled();
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

  it('C2-T6 product P to Q switch routes only to Q', async () => {
    const p = vi.fn(async () => 'P');
    const q = vi.fn(async () => 'Q');
    activeEditingContext.activateWorkbook('P', p);
    activeEditingContext.activateWorkbook('Q', q);

    await activeEditingContext.save();

    expect(activeEditingContext.get()?.resourceId).toBe('Q');
    expect(q).toHaveBeenCalledTimes(1);
    expect(p).not.toHaveBeenCalled();
    expect(flushLibraryEdits).not.toHaveBeenCalled();
    expect(saveActiveDocument).not.toHaveBeenCalled();
  });

  it('C2-T7 real workbook conflict blocks repository write without falling through', async () => {
    const owner = { kind: 'product' as const, id: 'product-conflict-c2' };
    const base = workbookFixture(owner.id, 1);
    const remote = cloneWorkbook({ ...base, metadata: { server: 'newer' } }, 2);
    const { repository, saveWorkbook } = mockRepository(base);

    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { local: 'dirty' } });
    await useWorkbookDraftStore.getState().refresh(owner, {
      getWorkbook: vi.fn(async () => remote),
      saveWorkbook
    });
    expect(useWorkbookDraftStore.getState().getSession(owner)?.conflict).not.toBeNull();

    activeEditingContext.activateWorkbook(owner.id, createWorkbookSaveTarget(owner, repository));
    await expect(activeEditingContext.save()).resolves.toBe(false);

    expect(saveWorkbook).not.toHaveBeenCalled();
    expect(useWorkbookDraftStore.getState().getSession(owner)?.conflict).not.toBeNull();
    expect(flushLibraryEdits).not.toHaveBeenCalled();
    expect(saveActiveDocument).not.toHaveBeenCalled();
  });

  it('C2-T8 real workbook save failure preserves dirty draft and does not fall through', async () => {
    const owner = { kind: 'product' as const, id: 'product-failure-c2' };
    const base = workbookFixture(owner.id, 1);
    const { repository, saveWorkbook } = mockRepository(base);
    saveWorkbook.mockRejectedValueOnce(new Error('network unavailable'));

    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { local: 'preserved' } });
    activeEditingContext.activateWorkbook(owner.id, createWorkbookSaveTarget(owner, repository));

    await expect(activeEditingContext.save()).resolves.toBe(false);

    const session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(saveWorkbook).toHaveBeenCalledTimes(1);
    expect(session.draft.metadata?.local).toBe('preserved');
    expect(session.localGeneration).toBeGreaterThan(session.acknowledgedGeneration);
    expect(session.failure?.message).toBe('network unavailable');
    expect(session.inFlight).toBeNull();
    expect(flushLibraryEdits).not.toHaveBeenCalled();
    expect(saveActiveDocument).not.toHaveBeenCalled();
  });

  it('C2-T9 authoritative ACK is the only boundary that advances saved state', async () => {
    const owner = { kind: 'product' as const, id: 'product-ack-c2' };
    const base = workbookFixture(owner.id, 1);
    const pending = deferred<SaveWorkbookResult>();
    const { repository, saveWorkbook } = mockRepository(base);
    saveWorkbook.mockImplementationOnce(() => pending.promise);

    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { local: 'pending-ack' } });
    activeEditingContext.activateWorkbook(owner.id, createWorkbookSaveTarget(owner, repository));

    const save = activeEditingContext.save();
    const beforeAck = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(beforeAck.inFlight).not.toBeNull();
    expect(beforeAck.baseRevision).toBe(1);
    expect(beforeAck.acknowledgedGeneration).toBe(0);
    expect(beforeAck.localGeneration).toBe(1);
    expect(saveWorkbook).toHaveBeenCalledTimes(1);

    const params = saveWorkbook.mock.calls[0][0] as SaveWorkbookParams;
    pending.resolve({
      success: true,
      workbook: cloneWorkbook(ensureWorkbookV2(params.workbook), 2),
      revision: 2
    });
    await expect(save).resolves.toBe(true);

    const afterAck = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(afterAck.inFlight).toBeNull();
    expect(afterAck.baseRevision).toBe(2);
    expect(afterAck.acknowledgedGeneration).toBe(1);
    expect(afterAck.localGeneration).toBe(1);
    expect(afterAck.failure).toBeNull();
    expect(flushLibraryEdits).not.toHaveBeenCalled();
    expect(saveActiveDocument).not.toHaveBeenCalled();
  });

  it('C2-T10 rapid saves preserve workbook single-flight and cause one repository write', async () => {
    const owner = { kind: 'product' as const, id: 'product-single-flight-c2' };
    const base = workbookFixture(owner.id, 1);
    const pending = deferred<SaveWorkbookResult>();
    const { repository, saveWorkbook } = mockRepository(base);
    saveWorkbook.mockImplementationOnce(() => pending.promise);

    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { local: 'single-flight' } });
    activeEditingContext.activateWorkbook(owner.id, createWorkbookSaveTarget(owner, repository));

    const first = activeEditingContext.save();
    const second = activeEditingContext.save();
    expect(saveWorkbook).toHaveBeenCalledTimes(1);

    const params = saveWorkbook.mock.calls[0][0] as SaveWorkbookParams;
    pending.resolve({
      success: true,
      workbook: cloneWorkbook(ensureWorkbookV2(params.workbook), 2),
      revision: 2
    });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);

    expect(saveWorkbook).toHaveBeenCalledTimes(1);
    expect(useWorkbookDraftStore.getState().getSession(owner)?.baseRevision).toBe(2);
    expect(flushLibraryEdits).not.toHaveBeenCalled();
    expect(saveActiveDocument).not.toHaveBeenCalled();
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
