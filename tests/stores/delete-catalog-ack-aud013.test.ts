import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { StorageService } from '../../src/services/storage.service';
import { SupabaseService } from '../../src/services/supabase.service';
import type { Catalog } from '../../src/domain/catalog.schema';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const deletedId = 'a1111111-1111-4111-8111-111111111111';
const survivorId = 'b2222222-2222-4222-8222-222222222222';

function catalog(id: string, version: number, title: string): Catalog {
  return {
    id,
    title,
    subtitle: 'AUD013 fixture',
    themeId: 'default-technical',
    pages: [{
      id: `page-${id}`,
      pageNumber: 1,
      pageType: 'technical',
      blocks: [{ id: `block-${id}`, type: 'text', title }]
    }],
    version,
    createdAt: '2026-09-06T12:00:00.000Z',
    updatedAt: '2026-09-06T12:00:00.000Z'
  };
}

function workspaceResponse(catalogs: Catalog[]) {
  return {
    success: true,
    data: {
      catalogs: catalogs.map((item) => ({
        id: item.id,
        name: item.title,
        status: 'draft',
        version: item.version,
        brand: structuredClone(item),
        created_at: item.createdAt,
        updated_at: item.updatedAt
      })),
      products: [],
      templates: [],
      userRole: 'admin' as const
    }
  };
}

function establishSession(currentCatalog: Catalog, savedCatalogs: Catalog[] = [currentCatalog]) {
  useCatalogStore.setState({
    currentCatalog: structuredClone(currentCatalog),
    editorContext: { kind: 'catalog', catalogId: currentCatalog.id },
    savedCatalogs: structuredClone(savedCatalogs),
    isLoading: false,
    isSaving: false,
    isDirty: false,
    localRevision: 0,
    lastAcknowledgedLocalRevision: 0,
    syncStatus: 'synced',
    syncError: null,
    remoteVersionBarrier: null
  });
}

describe('W3-F / AUD013 — delete catalog remote ACK safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCatalogStore.getState().resetWorkspaceForIdentityChange();
    establishSession(catalog(deletedId, 7, 'Catalog C'), [
      catalog(deletedId, 7, 'Catalog C'),
      catalog(survivorId, 4, 'Catalog D')
    ]);
    StorageService.setActiveCatalogId(deletedId);
    vi.spyOn(StorageService, 'deleteCatalog').mockImplementation(async (id) => {
      if (StorageService.getActiveCatalogId() === id) {
        StorageService.setActiveCatalogId(null);
      }
    });
    vi.spyOn(StorageService, 'cacheCatalog').mockResolvedValue(undefined);
  });

  it('D1: remote failure never deletes the local cache or claims deletion', async () => {
    vi.spyOn(SupabaseService, 'deleteCatalog').mockResolvedValue({
      success: false,
      error: 'Network timeout'
    });
    const deleteLocal = vi.spyOn(StorageService, 'deleteCatalog');

    await useCatalogStore.getState().deleteCatalog(deletedId);

    const state = useCatalogStore.getState();
    expect(deleteLocal).not.toHaveBeenCalled();
    expect(state.currentCatalog?.id).toBe(deletedId);
    expect(state.savedCatalogs.map((item) => item.id)).toContain(deletedId);
    expect(state.syncStatus).toBe('error');
    expect(state.syncError).toContain('Network timeout');
  });

  it('D2: a remote ACK deletes locally and replaces the active catalog by canonical remote order', async () => {
    vi.spyOn(SupabaseService, 'deleteCatalog').mockResolvedValue({ success: true });
    const deleteLocal = vi.spyOn(StorageService, 'deleteCatalog');
    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue(workspaceResponse([
      catalog(survivorId, 4, 'Catalog D')
    ]));

    await useCatalogStore.getState().deleteCatalog(deletedId);

    const state = useCatalogStore.getState();
    expect(deleteLocal).toHaveBeenCalledWith(deletedId);
    expect(state.currentCatalog?.id).toBe(survivorId);
    expect(state.savedCatalogs.map((item) => item.id)).toEqual([survivorId]);
    expect(StorageService.getActiveCatalogId()).toBe(survivorId);
  });

  it('D3: a pre-ACK workspace load cannot resurrect a successfully deleted inactive catalog', async () => {
    const deleted = catalog(deletedId, 7, 'Catalog C');
    const survivor = catalog(survivorId, 4, 'Catalog D');
    establishSession(survivor, [deleted, survivor]);
    StorageService.setActiveCatalogId(survivorId);

    const staleWorkspace = deferred<ReturnType<typeof workspaceResponse>>();
    vi.spyOn(SupabaseService, 'listWorkspace')
      .mockImplementationOnce(async () => staleWorkspace.promise)
      .mockResolvedValueOnce(workspaceResponse([survivor]));
    vi.spyOn(SupabaseService, 'deleteCatalog').mockResolvedValue({ success: true });

    const pendingReload = useCatalogStore.getState().loadWorkspace();
    await useCatalogStore.getState().deleteCatalog(deletedId);
    staleWorkspace.resolve(workspaceResponse([deleted, survivor]));
    await pendingReload;

    expect(useCatalogStore.getState().savedCatalogs.map((item) => item.id)).toEqual([survivorId]);
    expect(StorageService.cacheCatalog).not.toHaveBeenCalledWith(expect.objectContaining({ id: deletedId }));
  });

  it('D4: late ACK after an identity/session switch is inert', async () => {
    const completion = deferred<{ success: boolean; error?: string }>();
    vi.spyOn(SupabaseService, 'deleteCatalog').mockImplementationOnce(async () => completion.promise);
    const deleteLocal = vi.spyOn(StorageService, 'deleteCatalog');

    const deletion = useCatalogStore.getState().deleteCatalog(deletedId);
    useCatalogStore.getState().resetWorkspaceForIdentityChange();
    establishSession(catalog(survivorId, 4, 'New identity catalog'));
    completion.resolve({ success: true });
    await deletion;

    expect(deleteLocal).not.toHaveBeenCalled();
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(survivorId);
  });

  it('D5: an observed newer remote version blocks deletion instead of overwriting it', async () => {
    useCatalogStore.setState({
      remoteVersionBarrier: 8,
      syncStatus: 'conflict',
      syncError: 'Remote catalog is newer.'
    });
    const remoteDelete = vi.spyOn(SupabaseService, 'deleteCatalog');
    const deleteLocal = vi.spyOn(StorageService, 'deleteCatalog');

    await useCatalogStore.getState().deleteCatalog(deletedId);

    expect(remoteDelete).not.toHaveBeenCalled();
    expect(deleteLocal).not.toHaveBeenCalled();
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(deletedId);
    expect(useCatalogStore.getState().syncStatus).toBe('conflict');
  });

  it('D6: loadWorkspace during a pending delete reconciles deterministically after the ACK', async () => {
    const deleted = catalog(deletedId, 7, 'Catalog C');
    const survivor = catalog(survivorId, 4, 'Catalog D');
    const completion = deferred<{ success: boolean; error?: string }>();
    vi.spyOn(SupabaseService, 'deleteCatalog').mockImplementationOnce(async () => completion.promise);
    vi.spyOn(SupabaseService, 'listWorkspace')
      .mockResolvedValueOnce(workspaceResponse([deleted, survivor]))
      .mockResolvedValueOnce(workspaceResponse([survivor]));
    const deleteLocal = vi.spyOn(StorageService, 'deleteCatalog');

    const deletion = useCatalogStore.getState().deleteCatalog(deletedId);
    await useCatalogStore.getState().loadWorkspace();

    expect(deleteLocal).not.toHaveBeenCalled();
    expect(useCatalogStore.getState().savedCatalogs.map((item) => item.id)).toEqual([deletedId, survivorId]);

    completion.resolve({ success: true });
    await deletion;

    const state = useCatalogStore.getState();
    expect(deleteLocal).toHaveBeenCalledWith(deletedId);
    expect(state.savedCatalogs.map((item) => item.id)).toEqual([survivorId]);
    expect(state.currentCatalog?.id).toBe(survivorId);
  });

  it('D7: confirmed deletion with reconciliation failure clears a deleted active catalog without inventing a replacement', async () => {
    vi.spyOn(SupabaseService, 'deleteCatalog').mockResolvedValue({ success: true });
    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: false,
      error: 'Workspace unavailable'
    });
    const saveCatalog = vi.spyOn(SupabaseService, 'saveCatalog');

    await useCatalogStore.getState().deleteCatalog(deletedId);

    const state = useCatalogStore.getState();
    expect(state.currentCatalog).toBeNull();
    expect(state.savedCatalogs.map((item) => item.id)).toEqual([survivorId]);
    expect(StorageService.getActiveCatalogId()).toBeNull();
    expect(state.syncStatus).toBe('error');
    expect(state.syncError).toContain('Workspace unavailable');
    expect(saveCatalog).not.toHaveBeenCalled();
  });
});
