import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetCatalogSaveQueuesForTest,
  useCatalogStore
} from '../../src/stores/useCatalogStore';
import { handleCatalogRealtimeEvent } from '../../src/services/realtime.service';
import { StorageService } from '../../src/services/storage.service';
import { SupabaseService } from '../../src/services/supabase.service';
import type { Catalog } from '../../src/domain/catalog.schema';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const catalogId = 'a1111111-1111-4111-8111-111111111111';
const otherCatalogId = 'b2222222-2222-4222-8222-222222222222';

function catalog(version: number, title: string): Catalog {
  return {
    id: catalogId,
    title,
    subtitle: 'Session lineage fixture',
    themeId: 'default-technical',
    pages: [{
      id: 'page-1',
      pageNumber: 1,
      pageType: 'technical',
      blocks: [{ id: 'block-1', type: 'text', title }]
    }],
    version,
    createdAt: '2026-09-06T12:00:00.000Z',
    updatedAt: '2026-09-06T12:00:00.000Z'
  };
}

function workspaceResponse(remoteCatalog: Catalog) {
  return {
    success: true,
    data: {
      catalogs: [{
        id: remoteCatalog.id,
        name: remoteCatalog.title,
        status: 'draft',
        version: remoteCatalog.version,
        brand: structuredClone(remoteCatalog),
        created_at: remoteCatalog.createdAt,
        updated_at: remoteCatalog.updatedAt
      }],
      products: [],
      templates: [],
      userRole: 'admin' as const
    }
  };
}

function establishCatalogSession(activeCatalog: Catalog, localRevision = 1, syncStatus: 'dirty' | 'conflict' = 'dirty') {
  useCatalogStore.setState({
    currentCatalog: structuredClone(activeCatalog),
    editorContext: { kind: 'catalog', catalogId: activeCatalog.id },
    savedCatalogs: [structuredClone(activeCatalog)],
    isLoading: false,
    isSaving: false,
    isDirty: true,
    localRevision,
    lastAcknowledgedLocalRevision: 0,
    inFlightSave: null,
    syncStatus,
    syncError: syncStatus === 'conflict' ? 'Conflito remoto.' : null,
    remoteVersionBarrier: syncStatus === 'conflict' ? activeCatalog.version + 1 : null
  });
}

async function startDeferredSave() {
  const started = deferred<void>();
  const completion = deferred<{
    success: boolean;
    data: { id: string; version: number };
  }>();

  const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockImplementationOnce(async () => {
    started.resolve();
    return completion.promise;
  });

  const resultPromise = useCatalogStore.getState().saveCurrentCatalog();
  await started.promise;
  return { completion, resultPromise, saveSpy };
}

describe('W3-A / AUD012 — catalog session lineage and async completion safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetCatalogSaveQueuesForTest();
    vi.spyOn(StorageService, 'cacheCatalog').mockResolvedValue(undefined);
    useCatalogStore.getState().resetWorkspaceForIdentityChange();
    establishCatalogSession(catalog(5, 'S1 local A'));
  });

  it('T1: old ACK after logout/login with the same identity is inert', async () => {
    const oldSave = await startDeferredSave();

    useCatalogStore.getState().resetWorkspaceForIdentityChange();
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'S2 server copy'), false);
    useCatalogStore.getState().setEditorContext({ kind: 'catalog', catalogId });
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'S2 local B'), true);

    oldSave.completion.resolve({ success: true, data: { id: catalogId, version: 6 } });
    await oldSave.resultPromise;

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('S2 local B');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.localRevision).toBe(1);
    expect(state.lastAcknowledgedLocalRevision).toBe(0);
    expect(state.isDirty).toBe(true);
    expect(state.syncStatus).toBe('dirty');
  });

  it('T2: old ACK after an identity change is inert', async () => {
    const oldSave = await startDeferredSave();

    useCatalogStore.getState().resetWorkspaceForIdentityChange();
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'Different identity local B'), false);
    useCatalogStore.getState().setEditorContext({ kind: 'catalog', catalogId });
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'Different identity edited B'), true);

    oldSave.completion.resolve({ success: true, data: { id: catalogId, version: 6 } });
    await oldSave.resultPromise;

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('Different identity edited B');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.lastAcknowledgedLocalRevision).toBe(0);
    expect(state.syncStatus).toBe('dirty');
  });

  it('T3: ABA localRevision cannot defeat the generation/session guard', async () => {
    expect(useCatalogStore.getState().localRevision).toBe(1);
    const oldSave = await startDeferredSave();

    useCatalogStore.getState().resetWorkspaceForIdentityChange();
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'ABA server copy'), false);
    useCatalogStore.getState().setEditorContext({ kind: 'catalog', catalogId });
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'ABA local B'), true);
    expect(useCatalogStore.getState().localRevision).toBe(1);

    oldSave.completion.resolve({ success: true, data: { id: catalogId, version: 6 } });
    await oldSave.resultPromise;

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('ABA local B');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.lastAcknowledgedLocalRevision).toBe(0);
    expect(state.isDirty).toBe(true);
  });

  it('T4: stale save completion cannot mutate a newly loaded copy of the same catalog', async () => {
    const oldSave = await startDeferredSave();
    const loadedCopy = catalog(5, 'Newly loaded copy');

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValueOnce(workspaceResponse(loadedCopy));
    await useCatalogStore.getState().openCatalog(catalogId);

    oldSave.completion.resolve({ success: true, data: { id: catalogId, version: 6 } });
    await oldSave.resultPromise;

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('Newly loaded copy');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.lastAcknowledgedLocalRevision).toBe(0);
    expect(state.syncStatus).toBe('synced');
  });

  it('T5: reload-server conflict resolution cannot overwrite an edit made during await', async () => {
    establishCatalogSession(catalog(5, 'Local conflict A'), 1, 'conflict');
    const started = deferred<void>();
    const completion = deferred<ReturnType<typeof workspaceResponse>>();
    vi.spyOn(SupabaseService, 'listWorkspace').mockImplementationOnce(async () => {
      started.resolve();
      return completion.promise;
    });

    const resolution = useCatalogStore.getState().resolveConflictReloadServer();
    await started.promise;
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'Edit during reload await'), true);
    completion.resolve(workspaceResponse(catalog(6, 'Remote conflict copy')));
    await resolution;

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('Edit during reload await');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.localRevision).toBe(2);
    expect(state.isDirty).toBe(true);
  });

  it('T6: keep-local conflict resolution cannot overwrite an edit made during await', async () => {
    establishCatalogSession(catalog(5, 'Keep local A'), 1, 'conflict');
    const started = deferred<void>();
    const completion = deferred<ReturnType<typeof workspaceResponse>>();
    vi.spyOn(SupabaseService, 'listWorkspace').mockImplementationOnce(async () => {
      started.resolve();
      return completion.promise;
    });
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { id: catalogId, version: 7 }
    });

    const resolution = useCatalogStore.getState().resolveConflictKeepLocal();
    await started.promise;
    useCatalogStore.getState().setCurrentCatalog(catalog(5, 'Edit during keep-local await'), true);
    completion.resolve(workspaceResponse(catalog(6, 'Remote conflict copy')));
    const result = await resolution;

    const state = useCatalogStore.getState();
    expect(result.success).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(state.currentCatalog?.title).toBe('Edit during keep-local await');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.localRevision).toBe(2);
    expect(state.isDirty).toBe(true);
  });

  it('T7: catalog navigation during conflict resolution makes the completion inert', async () => {
    establishCatalogSession(catalog(5, 'Conflict before navigation'), 1, 'conflict');
    const started = deferred<void>();
    const completion = deferred<ReturnType<typeof workspaceResponse>>();
    vi.spyOn(SupabaseService, 'listWorkspace').mockImplementationOnce(async () => {
      started.resolve();
      return completion.promise;
    });

    const resolution = useCatalogStore.getState().resolveConflictReloadServer();
    await started.promise;
    const otherCatalog = { ...catalog(3, 'Other catalog'), id: otherCatalogId };
    useCatalogStore.getState().setCurrentCatalog(otherCatalog, false);
    useCatalogStore.getState().setEditorContext({ kind: 'catalog', catalogId: otherCatalogId });
    completion.resolve(workspaceResponse(catalog(6, 'Old catalog remote')));
    await resolution;

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.id).toBe(otherCatalogId);
    expect(state.currentCatalog?.title).toBe('Other catalog');
    expect(state.currentCatalog?.version).toBe(3);
  });

  it('T8: observed remote v7 cannot be erased by a later ACK v6', async () => {
    const oldSave = await startDeferredSave();

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: { id: catalogId, version: 7, name: 'Remote v7' }
    });
    expect(useCatalogStore.getState().syncStatus).toBe('conflict');

    oldSave.completion.resolve({ success: true, data: { id: catalogId, version: 6 } });
    const result = await oldSave.resultPromise;

    const state = useCatalogStore.getState();
    expect(result.success).toBe(false);
    expect(result.status).toBe('conflict');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.remoteVersionBarrier).toBe(7);
    expect(state.syncStatus).toBe('conflict');
    expect(state.isDirty).toBe(true);
    expect(state.lastAcknowledgedLocalRevision).toBe(0);
  });

  it('T9: ordinary same-session save still succeeds', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { id: catalogId, version: 6 }
    });

    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result).toMatchObject({ success: true, status: 'synced', version: 6 });
    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.version).toBe(6);
    expect(state.lastAcknowledgedLocalRevision).toBe(1);
    expect(state.isDirty).toBe(false);
    expect(state.syncStatus).toBe('synced');
  });

  it('T10: ordinary CAS conflict behavior remains intact', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: false,
      conflict: true,
      errorCode: '40001',
      error: 'Catalog conflict'
    });

    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result).toMatchObject({ success: false, status: 'conflict', errorCode: '40001' });
    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('S1 local A');
    expect(state.currentCatalog?.version).toBe(5);
    expect(state.isDirty).toBe(true);
    expect(state.syncStatus).toBe('conflict');
  });
});
