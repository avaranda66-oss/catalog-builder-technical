import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { createWorkbook, ensureWorkbookV2, type ProductWorkbookV2, type WorkbookOwner } from '@/domain/product-workbook';
import {
  SupabaseProductWorkbookRepository,
  type ProductWorkbookRepository,
  type SaveWorkbookParams,
  type SaveWorkbookResult
} from '@/services/product-workbook';
import * as SupabaseService from '@/services/supabase.service';
import { activeEditingContext } from '@/stores/activeEditingContext';
import { useAssetStore } from '@/stores/useAssetStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMediaStore } from '@/stores/useMediaStore';
import { useTemplateStore } from '@/stores/useTemplateStore';
import { useUIStore } from '@/stores/useUIStore';
import { useWorkbookDraftStore } from '@/stores/useWorkbookDraftStore';

const CTRL = { ctrlKey: true } as const;
const META = { metaKey: true } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function workbookFixture(productId: string, revision = 1): ProductWorkbookV2 {
  return ensureWorkbookV2(createWorkbook({
    owner: { kind: 'product', id: productId },
    revision
  }));
}

function installFallbackSpies() {
  const libraryFlush = vi.spyOn(useLibraryStore.getState(), 'flushLibraryEdits').mockResolvedValue(true);
  const catalogSave = vi.spyOn(useCatalogStore.getState(), 'saveActiveDocument').mockResolvedValue({
    success: true,
    status: 'synced'
  });
  return { libraryFlush, catalogSave };
}

function installWorkbookRepository(
  workbooks: ReadonlyMap<string, ProductWorkbookV2>,
  saveImplementation?: (params: SaveWorkbookParams) => Promise<SaveWorkbookResult>
) {
  const getWorkbook = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'getWorkbook')
    .mockImplementation(async (owner: WorkbookOwner) => workbooks.get(owner.id) ?? null);
  const saveWorkbook = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'saveWorkbook')
    .mockImplementation(saveImplementation ?? (async ({ workbook, expectedRevision }) => ({
      success: true,
      workbook: ensureWorkbookV2({ ...workbook, revision: expectedRevision + 1 }),
      revision: expectedRevision + 1
    })));
  return { getWorkbook, saveWorkbook };
}

async function renderAppWithWorkbook(productId: string) {
  useUIStore.setState({
    activeTab: 'library',
    selectedProductForWorkspaceId: productId,
    navigationEpoch: 0
  });
  const view = render(<App />);
  await waitFor(() => expect(activeEditingContext.get()?.resourceId).toBe(productId));
  await waitFor(() => expect(useWorkbookDraftStore.getState().getSession({ kind: 'product', id: productId })?.baseRevision).not.toBeNull());
  return view;
}

async function editWorkbook(productId: string, base: ProductWorkbookV2, marker: string) {
  await act(async () => {
    useWorkbookDraftStore.getState().edit({ kind: 'product', id: productId }, {
      ...base,
      metadata: { local: marker }
    });
  });
}

async function dispatchPhysicalSave(
  modifier: typeof CTRL | typeof META,
  target: Window | HTMLElement = window
) {
  const event = new KeyboardEvent('keydown', {
    key: 's',
    bubbles: true,
    cancelable: true,
    ...modifier
  });
  await act(async () => {
    target.dispatchEvent(event);
    await Promise.resolve();
    await Promise.resolve();
  });
  return event;
}

describe('C2.3 physical keyboard save composition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    activeEditingContext.release();
    useWorkbookDraftStore.getState().resetForTests();
    useLibraryStore.getState().resetToInitial();

    vi.spyOn(SupabaseService, 'getSupabase').mockReturnValue(null);
    vi.spyOn(useAuthStore.getState(), 'initialize').mockResolvedValue(undefined);
    vi.spyOn(useLibraryStore.getState(), 'loadWorkspace').mockResolvedValue(undefined);
    vi.spyOn(useLibraryStore.getState(), 'initRealtimeSubscription').mockReturnValue(() => undefined);
    vi.spyOn(useCatalogStore.getState(), 'loadLatestCatalog').mockResolvedValue(undefined);
    vi.spyOn(useMediaStore.getState(), 'loadAssets').mockResolvedValue(undefined);
    vi.spyOn(useTemplateStore.getState(), 'loadTemplates').mockResolvedValue(undefined);
    vi.spyOn(useAssetStore.getState(), 'loadWorkspaceAssets').mockResolvedValue(undefined);
    vi.spyOn(useAssetStore.getState(), 'initRealtimeSubscription').mockReturnValue(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    useAuthStore.setState({
      status: 'authenticated',
      userId: 'c23-keyboard-user',
      role: 'admin',
      email: 'c23-keyboard@example.test',
      errorMessage: null
    });
    useUIStore.setState({
      activeTab: 'library',
      selectedProductForWorkspaceId: null,
      navigationEpoch: 0
    });
  });

  afterEach(() => {
    cleanup();
    activeEditingContext.release();
    useWorkbookDraftStore.getState().resetForTests();
  });

  it.each([
    ['C2.3-K1', CTRL],
    ['C2.3-K2', META]
  ])('%s workbook open inside Library routes one physical shortcut only to workbook', async (_caseId, modifier) => {
    const product = useLibraryStore.getState().products[0];
    const base = workbookFixture(product.id);
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(new Map([[product.id, base]]));

    await renderAppWithWorkbook(product.id);
    await editWorkbook(product.id, base, 'keyboard-save');
    const event = await dispatchPhysicalSave(modifier);

    await waitFor(() => expect(saveWorkbook).toHaveBeenCalledTimes(1));
    expect(event.defaultPrevented).toBe(true);
    expect(libraryFlush).not.toHaveBeenCalled();
    expect(catalogSave).not.toHaveBeenCalled();
  });

  it.each([
    ['C2.3-K3', CTRL],
    ['C2.3-K4', META]
  ])('%s Library without workbook routes one physical shortcut only to Library', async (_caseId, modifier) => {
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(new Map());
    render(<App />);

    const event = await dispatchPhysicalSave(modifier);

    expect(event.defaultPrevented).toBe(true);
    expect(libraryFlush).toHaveBeenCalledTimes(1);
    expect(saveWorkbook).not.toHaveBeenCalled();
    expect(catalogSave).not.toHaveBeenCalled();
  });

  it('C2.3-K5 editor/catalog routes physical Ctrl+S only to saveActiveDocument', async () => {
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(new Map());
    useCatalogStore.setState({ editorContext: { kind: 'catalog', catalogId: 'catalog-c23' } });
    useUIStore.setState({ activeTab: 'editor' });
    render(<App />);

    const event = await dispatchPhysicalSave(CTRL);

    expect(event.defaultPrevented).toBe(true);
    expect(catalogSave).toHaveBeenCalledTimes(1);
    expect(libraryFlush).not.toHaveBeenCalled();
    expect(saveWorkbook).not.toHaveBeenCalled();
  });

  it('C2.3-K6 template editor delegates physical Ctrl+S once to existing document authority', async () => {
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(new Map());
    useCatalogStore.setState({ editorContext: { kind: 'template', templateId: 'template-c23' } });
    useUIStore.setState({ activeTab: 'editor' });
    render(<App />);

    const event = await dispatchPhysicalSave(CTRL);

    expect(event.defaultPrevented).toBe(true);
    expect(catalogSave).toHaveBeenCalledTimes(1);
    expect(libraryFlush).not.toHaveBeenCalled();
    expect(saveWorkbook).not.toHaveBeenCalled();
  });

  it('C2.3-K7 P to Q replacement plus late P cleanup routes physical Ctrl+S only to Q', async () => {
    const [productP, productQ] = useLibraryStore.getState().products;
    const baseP = workbookFixture(productP.id, 1);
    const baseQ = workbookFixture(productQ.id, 7);
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(new Map([
      [productP.id, baseP],
      [productQ.id, baseQ]
    ]));

    await renderAppWithWorkbook(productP.id);
    const pGeneration = activeEditingContext.get()!.generation;
    await act(async () => {
      useUIStore.getState().openProductKnowledgeWorkspace(productQ.id);
    });
    await waitFor(() => expect(activeEditingContext.get()?.resourceId).toBe(productQ.id));
    await waitFor(() => expect(useWorkbookDraftStore.getState().getSession({ kind: 'product', id: productQ.id })?.baseRevision).toBe(7));
    const qGeneration = activeEditingContext.get()!.generation;
    expect(qGeneration).toBeGreaterThan(pGeneration);

    activeEditingContext.release(pGeneration);
    await editWorkbook(productQ.id, baseQ, 'Q-current');
    await dispatchPhysicalSave(CTRL);

    await waitFor(() => expect(saveWorkbook).toHaveBeenCalledTimes(1));
    expect((saveWorkbook.mock.calls[0][0] as SaveWorkbookParams).workbook.owner.id).toBe(productQ.id);
    expect(libraryFlush).not.toHaveBeenCalled();
    expect(catalogSave).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl+S', CTRL],
    ['Cmd+S', META]
  ])('C2.3-K8 workbook conflict blocks physical %s without any fallback', async (_label, modifier) => {
    const product = useLibraryStore.getState().products[0];
    const owner = { kind: 'product' as const, id: product.id };
    const base = workbookFixture(product.id, 1);
    const remote = ensureWorkbookV2({ ...base, revision: 2, metadata: { server: 'newer' } });
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(new Map([[product.id, base]]));

    await renderAppWithWorkbook(product.id);
    await editWorkbook(product.id, base, 'conflicted');
    const conflictRepository: ProductWorkbookRepository = {
      getWorkbook: vi.fn(async () => remote),
      saveWorkbook: vi.fn(async () => {
        throw new Error('Conflict setup must not write.');
      })
    };
    await act(async () => {
      await useWorkbookDraftStore.getState().refresh(owner, conflictRepository);
    });
    expect(useWorkbookDraftStore.getState().getSession(owner)?.conflict).not.toBeNull();

    await dispatchPhysicalSave(modifier);

    expect(saveWorkbook).not.toHaveBeenCalled();
    expect(libraryFlush).not.toHaveBeenCalled();
    expect(catalogSave).not.toHaveBeenCalled();
    expect(useWorkbookDraftStore.getState().getSession(owner)?.conflict).not.toBeNull();
  });

  it('C2.3-K8 invalid ACK reconciliation blocks subsequent physical Ctrl/Cmd+S without fallback', async () => {
    const product = useLibraryStore.getState().products[0];
    const owner = { kind: 'product' as const, id: product.id };
    const base = workbookFixture(product.id, 1);
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(
      new Map([[product.id, base]]),
      async ({ workbook, expectedRevision }) => ({
        success: true,
        workbook: ensureWorkbookV2({ ...workbook, revision: expectedRevision + 2 }),
        revision: expectedRevision + 2
      })
    );

    await renderAppWithWorkbook(product.id);
    await editWorkbook(product.id, base, 'invalid-ack');
    await act(async () => {
      await activeEditingContext.save();
    });
    expect(useWorkbookDraftStore.getState().getSession(owner)?.reconciliationRequired?.reason).toBe('invalid-ack');
    saveWorkbook.mockClear();

    await dispatchPhysicalSave(CTRL);
    await dispatchPhysicalSave(META);

    expect(saveWorkbook).not.toHaveBeenCalled();
    expect(libraryFlush).not.toHaveBeenCalled();
    expect(catalogSave).not.toHaveBeenCalled();
    expect(useWorkbookDraftStore.getState().getSession(owner)?.reconciliationRequired?.reason).toBe('invalid-ack');
  });

  it('rapid physical Ctrl+S joins workbook single-flight and performs one repository write', async () => {
    const product = useLibraryStore.getState().products[0];
    const owner = { kind: 'product' as const, id: product.id };
    const base = workbookFixture(product.id, 1);
    const pending = deferred<SaveWorkbookResult>();
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(
      new Map([[product.id, base]]),
      () => pending.promise
    );

    await renderAppWithWorkbook(product.id);
    await editWorkbook(product.id, base, 'single-flight');
    await dispatchPhysicalSave(CTRL);
    await dispatchPhysicalSave(CTRL);
    expect(saveWorkbook).toHaveBeenCalledTimes(1);

    const params = saveWorkbook.mock.calls[0][0] as SaveWorkbookParams;
    await act(async () => {
      pending.resolve({
        success: true,
        workbook: ensureWorkbookV2({ ...params.workbook, revision: 2 }),
        revision: 2
      });
      await pending.promise;
    });
    await waitFor(() => expect(useWorkbookDraftStore.getState().getSession(owner)?.baseRevision).toBe(2));
    expect(libraryFlush).not.toHaveBeenCalled();
    expect(catalogSave).not.toHaveBeenCalled();
  });

  it('unmounting ProductKnowledgeWorkspace restores physical Library fallback', async () => {
    const product = useLibraryStore.getState().products[0];
    const base = workbookFixture(product.id, 1);
    const { libraryFlush, catalogSave } = installFallbackSpies();
    const { saveWorkbook } = installWorkbookRepository(new Map([[product.id, base]]));

    await renderAppWithWorkbook(product.id);
    fireEvent.click(screen.getByTitle('Voltar à Biblioteca'));
    await waitFor(() => expect(activeEditingContext.get()).toBeNull());
    await dispatchPhysicalSave(CTRL);

    expect(libraryFlush).toHaveBeenCalledTimes(1);
    expect(catalogSave).not.toHaveBeenCalled();
    expect(saveWorkbook).not.toHaveBeenCalled();
  });
});
