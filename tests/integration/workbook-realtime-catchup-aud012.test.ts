import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '@/domain/catalog.schema';
import {
  createWorkbook,
  ensureWorkbookV2,
  type ProductWorkbook,
  type ProductWorkbookV2,
  type WorkbookOwner
} from '@/domain/product-workbook';
import { ProductKnowledgeRuntime, type ProductRegistryReader } from '@/domain/table-binding';
import {
  ProductWorkbookRealtimeCoordinator,
  type ProductWorkbookRealtimeMetadata,
  type ProductWorkbookRealtimePayload
} from '@/services/product-workbook/product-workbook.realtime';
import type { ProductWorkbookRepository } from '@/services/product-workbook';
import { useAuthStore } from '@/stores/useAuthStore';
import { useWorkbookDraftStore } from '@/stores/useWorkbookDraftStore';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const FAMILY_ID = '22222222-2222-4222-8222-222222222222';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function workbook(revision: number, marker: string): ProductWorkbookV2 {
  const created = ensureWorkbookV2(createWorkbook({
    owner: { kind: 'product', id: PRODUCT_ID },
    revision
  }));
  return { ...created, metadata: { marker } };
}

function familyWorkbook(revision: number, marker: string): ProductWorkbookV2 {
  const created = ensureWorkbookV2(createWorkbook({
    owner: { kind: 'family', id: FAMILY_ID },
    revision
  }));
  return { ...created, metadata: { marker } };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function catalog(): Catalog {
  return {
    id: 'catalog-aud012-w3e',
    pages: [{
      id: 'page-aud012-w3e',
      blocks: [{
        id: 'block-aud012-w3e',
        tableRows: [{ id: 'row-aud012-w3e', productRefId: PRODUCT_ID }]
      }]
    }]
  } as unknown as Catalog;
}

function noFamilyRegistry(): ProductRegistryReader {
  return {
    getProductIdentity: vi.fn(async () => null),
    getProductsByIds: vi.fn(async () => []),
    getProductsByFamilyIds: vi.fn(async () => [])
  };
}

class FakeRealtimeChannel {
  private changeHandler?: (payload: ProductWorkbookRealtimePayload) => void;
  private statusHandler?: (status: string, error?: Error) => void;

  on(
    _type: 'postgres_changes',
    filter: { event: '*'; schema: 'public'; table: 'product_workbooks' },
    handler: (payload: ProductWorkbookRealtimePayload) => void
  ): this {
    expect(filter).toMatchObject({ schema: 'public', table: 'product_workbooks' });
    this.changeHandler = handler;
    return this;
  }

  subscribe(handler: (status: string, error?: Error) => void): this {
    this.statusHandler = handler;
    return this;
  }

  emitStatus(status: string): void {
    this.statusHandler?.(status);
  }

  emitWorkbookChange(revision: number): void {
    this.changeHandler?.({
      eventType: 'UPDATE',
      new: {
        owner_kind: 'product',
        owner_id: PRODUCT_ID,
        revision
      },
      old: {
        owner_kind: 'product',
        owner_id: PRODUCT_ID,
        revision: Math.max(1, revision - 1)
      }
    });
  }

  emitFamilyWorkbookChange(revision: number): void {
    this.changeHandler?.({
      eventType: 'UPDATE',
      new: {
        owner_kind: 'family',
        owner_id: FAMILY_ID,
        revision
      },
      old: {
        owner_kind: 'family',
        owner_id: FAMILY_ID,
        revision: Math.max(1, revision - 1)
      }
    });
  }
}

function fakeRealtimeClient(channel: FakeRealtimeChannel) {
  return {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok')
  };
}

describe('AUD012 W3-E — workbook realtime and reconnect catch-up', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useWorkbookDraftStore.getState().resetForTests();
    useAuthStore.setState({
      status: 'authenticated',
      userId: 'aud012-device-b',
      role: 'admin',
      email: 'aud012@example.test',
      errorMessage: null
    });
  });

  it('infra preflight: product_workbooks is already in supabase_realtime with FULL replica identity', () => {
    const sql = readFileSync('supabase/migrations/00022_product_workbook_persistence.sql', 'utf8');

    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.product_workbooks;');
    expect(sql).toContain('ALTER TABLE public.product_workbooks REPLICA IDENTITY FULL;');
  });

  it('T1/T6: a remote workbook notification is only a signal; clean B rereads authority and advances N -> N+1', async () => {
    const owner: WorkbookOwner = { kind: 'product', id: PRODUCT_ID };
    let remote = workbook(1, 'N');
    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn(async () => clone(remote)),
      saveWorkbook: vi.fn()
    };
    await useWorkbookDraftStore.getState().load(owner, repository);

    const channel = new FakeRealtimeChannel();
    const client = fakeRealtimeClient(channel);
    const coordinator = new ProductWorkbookRealtimeCoordinator(client, {
      requireCatchUp: (_reason, metadata) => useWorkbookDraftStore.getState().requireCatchUp(metadata?.owner),
      catchUp: async (metadata) => {
        if (metadata) await useWorkbookDraftStore.getState().catchUp(metadata.owner, repository);
        else await useWorkbookDraftStore.getState().catchUpAll(repository);
      }
    });
    const stop = coordinator.start();
    channel.emitStatus('SUBSCRIBED');
    await vi.waitFor(() => expect(useWorkbookDraftStore.getState().getSession(owner)?.freshness).toBe('fresh'));

    remote = workbook(2, 'N+1');
    channel.emitWorkbookChange(2);

    await vi.waitFor(() => {
      const session = useWorkbookDraftStore.getState().getSession(owner);
      expect(session?.baseRevision).toBe(2);
      expect(session?.draft.metadata?.marker).toBe('N+1');
      expect(session?.conflict).toBeNull();
    });
    stop();
  });

  it('T2: disconnect marks authority stale and SUBSCRIBED performs explicit catch-up even when the WAL event was missed', async () => {
    const owner: WorkbookOwner = { kind: 'product', id: PRODUCT_ID };
    let remote = workbook(1, 'N');
    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn(async () => clone(remote)),
      saveWorkbook: vi.fn()
    };
    await useWorkbookDraftStore.getState().load(owner, repository);

    const channel = new FakeRealtimeChannel();
    const coordinator = new ProductWorkbookRealtimeCoordinator(fakeRealtimeClient(channel), {
      requireCatchUp: (_reason, metadata) => useWorkbookDraftStore.getState().requireCatchUp(metadata?.owner),
      catchUp: async (metadata) => {
        if (metadata) await useWorkbookDraftStore.getState().catchUp(metadata.owner, repository);
        else await useWorkbookDraftStore.getState().catchUpAll(repository);
      }
    });
    const stop = coordinator.start();
    channel.emitStatus('SUBSCRIBED');
    await vi.waitFor(() => expect(useWorkbookDraftStore.getState().getSession(owner)?.freshness).toBe('fresh'));

    channel.emitStatus('CHANNEL_ERROR');
    expect(useWorkbookDraftStore.getState().getSession(owner)?.freshness).toBe('catchup_required');
    remote = workbook(2, 'missed-while-offline');

    channel.emitStatus('SUBSCRIBED');
    await vi.waitFor(() => {
      const session = useWorkbookDraftStore.getState().getSession(owner);
      expect(session?.freshness).toBe('fresh');
      expect(session?.baseRevision).toBe(2);
      expect(session?.draft.metadata?.marker).toBe('missed-while-offline');
    });
    stop();
  });

  it('family workbook notifications use the same authoritative reread path as product workbooks', async () => {
    const owner: WorkbookOwner = { kind: 'family', id: FAMILY_ID };
    let remote = familyWorkbook(4, 'family-N');
    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn(async () => clone(remote)),
      saveWorkbook: vi.fn()
    };
    await useWorkbookDraftStore.getState().load(owner, repository);

    const channel = new FakeRealtimeChannel();
    const coordinator = new ProductWorkbookRealtimeCoordinator(fakeRealtimeClient(channel), {
      requireCatchUp: (_reason, metadata) => useWorkbookDraftStore.getState().requireCatchUp(metadata?.owner),
      catchUp: async (metadata) => {
        if (metadata) await useWorkbookDraftStore.getState().catchUp(metadata.owner, repository);
        else await useWorkbookDraftStore.getState().catchUpAll(repository);
      }
    });
    const stop = coordinator.start();
    channel.emitStatus('SUBSCRIBED');
    await vi.waitFor(() => expect(useWorkbookDraftStore.getState().getSession(owner)?.freshness).toBe('fresh'));

    remote = familyWorkbook(5, 'family-N+1');
    channel.emitFamilyWorkbookChange(5);
    await vi.waitFor(() => {
      const session = useWorkbookDraftStore.getState().getSession(owner);
      expect(session?.baseRevision).toBe(5);
      expect(session?.draft.metadata?.marker).toBe('family-N+1');
    });
    stop();
  });

  it('T4: a read started before reconnect cannot overwrite the newer catch-up snapshot', async () => {
    const owner: WorkbookOwner = { kind: 'product', id: PRODUCT_ID };
    const staleRead = deferred<ProductWorkbook | null>();
    const getWorkbook = vi.fn<ProductWorkbookRepository['getWorkbook']>()
      .mockResolvedValueOnce(workbook(1, 'N'))
      .mockImplementationOnce(() => staleRead.promise)
      .mockResolvedValueOnce(workbook(3, 'catch-up'));
    const repository: ProductWorkbookRepository = { getWorkbook, saveWorkbook: vi.fn() };

    await useWorkbookDraftStore.getState().load(owner, repository);
    const preReconnect = useWorkbookDraftStore.getState().refresh(owner, repository);
    useWorkbookDraftStore.getState().requireCatchUp(owner);
    const catchUp = useWorkbookDraftStore.getState().catchUp(owner, repository);
    await expect(catchUp).resolves.toBe(true);
    expect(getWorkbook).toHaveBeenCalledTimes(3);
    expect(useWorkbookDraftStore.getState().getSession(owner)?.baseRevision).toBe(3);

    staleRead.resolve(workbook(2, 'late-stale'));
    await preReconnect;
    const session = useWorkbookDraftStore.getState().getSession(owner);
    expect(session?.baseRevision).toBe(3);
    expect(session?.draft.metadata?.marker).toBe('catch-up');
  });

  it('T7: a valid newer remote revision never silently overwrites a concurrent local edit', async () => {
    const owner: WorkbookOwner = { kind: 'product', id: PRODUCT_ID };
    let remote = workbook(1, 'N');
    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn(async () => clone(remote)),
      saveWorkbook: vi.fn()
    };
    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...workbook(1, 'local'), metadata: { marker: 'local-edit' } });

    remote = workbook(2, 'remote-N+1');
    useWorkbookDraftStore.getState().requireCatchUp(owner);
    await useWorkbookDraftStore.getState().catchUp(owner, repository);

    const session = useWorkbookDraftStore.getState().getSession(owner);
    expect(session?.draft.metadata?.marker).toBe('local-edit');
    expect(session?.baseRevision).toBe(1);
    expect(session?.remoteRevision).toBe(2);
    expect(session?.conflict?.actualRevision).toBe(2);
  });

  it('T3/T5: identity reset rejects stale completions and realtime catch-up revokes publishing authority until reread settles', async () => {
    let current = workbook(1, 'N');
    const late = deferred<ProductWorkbook | null>();
    let useLateRead = false;
    const getWorkbook = vi.fn(async (_owner: WorkbookOwner): Promise<ProductWorkbook | null> => {
      if (useLateRead) return late.promise;
      return clone(current);
    });
    const runtime = new ProductKnowledgeRuntime({
      registryReader: noFamilyRegistry(),
      workbookFetcher: { getWorkbook }
    });

    await runtime.preloadCatalogProductKnowledge(catalog());
    expect(runtime.getResolvedKnowledge(PRODUCT_ID, 'effective_for_publishing')?.productRevision).toBe(1);

    runtime.requireRealtimeCatchUp();
    expect(runtime.getFreshnessState()).toBe('catchup_required');
    expect(runtime.getResolvedKnowledge(PRODUCT_ID, 'effective_for_publishing')).toBeUndefined();
    current = workbook(2, 'N+1');
    await runtime.catchUpActiveKnowledge();
    expect(runtime.getFreshnessState()).toBe('fresh');
    expect(runtime.getResolvedKnowledge(PRODUCT_ID, 'effective_for_publishing')?.productRevision).toBe(2);

    useLateRead = true;
    const oldIdentityRead = runtime.refreshProductKnowledge(PRODUCT_ID);
    runtime.resetForIdentityChange();
    late.resolve(workbook(9, 'old-identity'));
    await oldIdentityRead;

    expect(runtime.getActiveCatalogId()).toBeUndefined();
    expect(runtime.getResolvedKnowledge(PRODUCT_ID)).toBeUndefined();
    expect(runtime.getCachedWorkbook('product', PRODUCT_ID)).toBeUndefined();
  });

  it('T3 realtime: callbacks from a disposed identity/session are inert', async () => {
    const channel = new FakeRealtimeChannel();
    const requireCatchUp = vi.fn();
    const catchUp = vi.fn(async () => undefined);
    const coordinator = new ProductWorkbookRealtimeCoordinator(fakeRealtimeClient(channel), {
      requireCatchUp,
      catchUp
    });

    const stop = coordinator.start();
    expect(requireCatchUp).toHaveBeenCalledTimes(1);
    stop();
    requireCatchUp.mockClear();
    catchUp.mockClear();

    channel.emitStatus('SUBSCRIBED');
    channel.emitWorkbookChange(2);
    await Promise.resolve();

    expect(requireCatchUp).not.toHaveBeenCalled();
    expect(catchUp).not.toHaveBeenCalled();
  });

  it('T4 runtime: catch-up requests a fresh physical workbook read instead of joining a pre-reconnect repository flight', async () => {
    const late = deferred<ProductWorkbook | null>();
    let call = 0;
    const getWorkbook = vi.fn(async (
      _owner: WorkbookOwner,
      options?: { bypassInFlight?: boolean }
    ): Promise<ProductWorkbook | null> => {
      call += 1;
      if (call === 1) return workbook(1, 'N');
      if (call === 2) return late.promise;
      expect(options?.bypassInFlight).toBe(true);
      return workbook(3, 'catch-up');
    });
    const runtime = new ProductKnowledgeRuntime({
      registryReader: noFamilyRegistry(),
      workbookFetcher: { getWorkbook }
    });

    await runtime.preloadCatalogProductKnowledge(catalog());
    const preReconnect = runtime.refreshProductKnowledge(PRODUCT_ID);
    await vi.waitFor(() => expect(getWorkbook).toHaveBeenCalledTimes(2));

    runtime.requireRealtimeCatchUp();
    const catchUp = runtime.catchUpActiveKnowledge();
    await vi.waitFor(() => expect(getWorkbook).toHaveBeenCalledTimes(3));
    await catchUp;
    expect(runtime.getResolvedKnowledge(PRODUCT_ID)?.productRevision).toBe(3);

    late.resolve(workbook(2, 'late-stale'));
    await preReconnect;
    expect(runtime.getResolvedKnowledge(PRODUCT_ID)?.productRevision).toBe(3);
  });

  it('deduplicates an exact repeated notification while its authoritative reread is in flight', async () => {
    const channel = new FakeRealtimeChannel();
    const catchUpDeferred = deferred<void>();
    const catchUp = vi.fn(async (_metadata?: ProductWorkbookRealtimeMetadata) => catchUpDeferred.promise);
    const coordinator = new ProductWorkbookRealtimeCoordinator(fakeRealtimeClient(channel), {
      requireCatchUp: vi.fn(),
      catchUp
    });
    const stop = coordinator.start();
    channel.emitStatus('SUBSCRIBED');
    catchUpDeferred.resolve();
    await vi.waitFor(() => expect(catchUp).toHaveBeenCalledTimes(1));
    catchUp.mockClear();

    const eventFlight = deferred<void>();
    catchUp.mockImplementation(async () => eventFlight.promise);
    channel.emitWorkbookChange(2);
    channel.emitWorkbookChange(2);
    expect(catchUp).toHaveBeenCalledTimes(1);
    eventFlight.resolve();
    await eventFlight.promise;
    stop();
  });
});
