import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PRODUCTS } from '@/data/initialProducts';
import type { Product } from '@/domain/product.schema';
import { SupabaseService } from '@/services/supabase.service';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLibraryStore } from '@/stores/useLibraryStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function productFixture(overrides: Partial<Product> = {}): Product {
  const base = INITIAL_PRODUCTS[0];
  return {
    ...base,
    id: '11111111-1111-4111-8111-111111111111',
    family_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    code: 'P-100',
    model: 'Pump',
    family: 'Bombas',
    version: 1,
    specs: {
      ...base.specs,
      range: 'Normal',
      customSpecs: { legacy: 'keep' }
    },
    ...overrides
  };
}

function rowFromProduct(product: Product, version = product.version, overrides: Record<string, unknown> = {}) {
  return {
    id: product.id,
    family_id: product.family_id,
    sku: product.code,
    name: product.model,
    family: product.family,
    data: product.specs,
    version,
    created_at: product.createdAt || '2026-09-05T00:00:00.000Z',
    updated_at: product.updatedAt || '2026-09-05T00:00:00.000Z',
    ...overrides
  };
}

function workspaceResponse(products: Product[]) {
  return {
    success: true as const,
    data: {
      families: [],
      fields: [],
      products: products.map((product) => rowFromProduct(product)),
      events: []
    }
  };
}

async function loadVerified(products: Product[]) {
  vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockResolvedValueOnce(workspaceResponse(products));
  await useLibraryStore.getState().loadWorkspace();
}

describe('G1 Library save/draft/ACK lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      status: 'authenticated',
      userId: 'g1-library-user',
      role: 'admin',
      email: 'g1@example.test',
      errorMessage: null
    });
    useLibraryStore.getState().resetToInitial();
  });

  it('AUD-001/H: failed save retains latest draft; automatic work stays blocked; explicit retry sends latest at original base', async () => {
    vi.useFakeTimers();
    const product = productFixture();
    await loadVerified([product]);
    const refreshSpy = vi.spyOn(SupabaseService, 'listLibraryWorkspace')
      .mockResolvedValueOnce(workspaceResponse([product]));
    const firstWrite = deferred<{ success: boolean; error?: string }>();
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct')
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(async (sent, expectedVersion) => ({
        success: true,
        data: rowFromProduct(sent as Product, (expectedVersion ?? 0) + 1)
      }));

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'A');
    const firstDrain = useLibraryStore.getState().flushLibraryEdits();
    const joinedDrain = useLibraryStore.getState().flushLibraryEdits();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][1]).toBe(1);

    firstWrite.resolve({ success: false, error: 'offline' });
    await expect(firstDrain).resolves.toBe(false);
    await expect(joinedDrain).resolves.toBe(false);
    let session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.localGeneration).toBe(1);
    expect(session.acknowledgedGeneration).toBe(0);
    expect(session.failure?.message).toContain('offline');
    expect(session.draft.specs.range).toBe('A');
    expect(useLibraryStore.getState().isDirty).toBe(true);

    vi.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'B');
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    await useLibraryStore.getState().loadWorkspace();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.draft.specs.range).toBe('B');
    expect(session.baseRevision).toBe(1);
    expect(session.failure).not.toBeNull();

    await expect(useLibraryStore.getState().flushLibraryEdits('manual')).resolves.toBe(true);
    expect(saveSpy).toHaveBeenCalledTimes(2);
    const retrySnapshot = saveSpy.mock.calls[1][0] as Product;
    expect(retrySnapshot.specs.range).toBe('B');
    expect(saveSpy.mock.calls[1][1]).toBe(1);
    session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.acknowledgedGeneration).toBe(2);
    expect(session.baseRevision).toBe(2);
    expect(session.failure).toBeNull();
    expect(useLibraryStore.getState().isDirty).toBe(false);
  });

  it('AUD-002/A/J: old ACK replays post-send edit over normalized canonical ACK and preserves server deletion', async () => {
    vi.useFakeTimers();
    const product = productFixture({ code: ' P-100 ' });
    await loadVerified([product]);
    const write1 = deferred<any>();
    const write2 = deferred<any>();
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct')
      .mockImplementationOnce(() => write1.promise)
      .mockImplementationOnce(() => write2.promise);

    await useLibraryStore.getState().updateProduct(product.id, { model: 'Pump X' });
    const drain = useLibraryStore.getState().flushLibraryEdits();
    useLibraryStore.getState().updateProductCell(product.id, 'range', 'High pressure');

    const sent1 = saveSpy.mock.calls[0][0] as Product;
    const canonicalSpecs = { ...sent1.specs, customSpecs: {} };
    write1.resolve({
      success: true,
      data: rowFromProduct(sent1, 2, { sku: 'P-100', data: canonicalSpecs })
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(saveSpy).toHaveBeenCalledTimes(2);
    let session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.localGeneration).toBe(2);
    expect(session.acknowledgedGeneration).toBe(1);
    expect(session.baseRevision).toBe(2);
    expect(session.draft.code).toBe('P-100');
    expect(session.draft.specs.range).toBe('High pressure');
    expect(session.draft.specs.customSpecs?.legacy).toBeUndefined();
    expect(saveSpy.mock.calls[1][1]).toBe(2);
    const sent2 = saveSpy.mock.calls[1][0] as Product;
    expect(sent2.code).toBe('P-100');
    expect(sent2.specs.range).toBe('High pressure');

    write2.resolve({ success: true, data: rowFromProduct(sent2, 3) });
    await expect(drain).resolves.toBe(true);
    session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.baseRevision).toBe(3);
    expect(session.acknowledgedGeneration).toBe(2);
    expect(useLibraryStore.getState().syncStatus).toBe('synced');
  });

  it('K: post-send user deletion wins over canonical ACK that still contains the field', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const write = deferred<any>();
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct').mockImplementationOnce(() => write.promise);

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'A');
    const drain = useLibraryStore.getState().flushLibraryEdits();
    const current = useLibraryStore.getState().getProduct(product.id)!;
    await useLibraryStore.getState().updateProduct(product.id, {
      specs: { ...current.specs, customSpecs: {} }
    });

    const sent = saveSpy.mock.calls[0][0] as Product;
    write.resolve({ success: true, data: rowFromProduct(sent, 2) });
    await expect(drain).resolves.toBe(false);
    const session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.acknowledgedGeneration).toBe(1);
    expect(session.localGeneration).toBe(2);
    expect(session.draft.specs.customSpecs?.legacy).toBeUndefined();
  });

  it('L: incompatible structural normalization fails closed and emits zero successor writes', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const write = deferred<any>();
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct').mockImplementationOnce(() => write.promise);

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'A');
    const drain = useLibraryStore.getState().flushLibraryEdits();
    const current = useLibraryStore.getState().getProduct(product.id)!;
    await useLibraryStore.getState().updateProduct(product.id, {
      specs: { ...current.specs, customSpecs: { ...current.specs.customSpecs, later: 'local' } }
    });

    const sent = saveSpy.mock.calls[0][0] as Product;
    write.resolve({
      success: true,
      data: rowFromProduct(sent, 2, { data: { ...sent.specs, customSpecs: 'server-rekeyed' } })
    });
    await expect(drain).resolves.toBe(false);
    const session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.reconciliationRequired?.reason).toBe('structural-replay');
    expect(session.reconciliationRequired?.canonicalSnapshot).not.toBeNull();
    expect(session.reconciliationRequired?.localDraft.specs.customSpecs?.later).toBe('local');
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('revision-only ACK requires one explicit exact-revision canonical verification read', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const canonical2 = { ...product, model: 'Pump ACK', version: 2 };
    const readSpy = vi.spyOn(SupabaseService, 'listLibraryWorkspace')
      .mockResolvedValueOnce(workspaceResponse([canonical2]));
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct').mockResolvedValueOnce({
      success: true,
      data: { version: 2 }
    });

    await useLibraryStore.getState().updateProduct(product.id, { model: 'Pump ACK' });
    await expect(useLibraryStore.getState().flushLibraryEdits()).resolves.toBe(false);
    let session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.reconciliationRequired?.reason).toBe('canonical-verification');
    expect(session.acknowledgedGeneration).toBe(0);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    await expect(useLibraryStore.getState().verifyCanonicalProductAck(product.id)).resolves.toBe(true);
    expect(readSpy).toHaveBeenCalledTimes(1);
    session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.baseRevision).toBe(2);
    expect(session.acknowledgedGeneration).toBe(1);
    expect(session.reconciliationRequired).toBeNull();
    await expect(useLibraryStore.getState().verifyCanonicalProductAck(product.id)).resolves.toBe(false);
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('revision-only ACK verification budget is consumed by one stale/lower read and never loops', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const readSpy = vi.spyOn(SupabaseService, 'listLibraryWorkspace')
      .mockResolvedValueOnce(workspaceResponse([product]));
    vi.spyOn(SupabaseService, 'saveProduct').mockResolvedValueOnce({
      success: true,
      data: { version: 2 }
    });

    await useLibraryStore.getState().updateProduct(product.id, { model: 'Needs canonical verification' });
    await expect(useLibraryStore.getState().flushLibraryEdits()).resolves.toBe(false);
    await expect(useLibraryStore.getState().verifyCanonicalProductAck(product.id)).resolves.toBe(false);
    await expect(useLibraryStore.getState().verifyCanonicalProductAck(product.id)).resolves.toBe(false);

    const session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(session.baseRevision).toBe(1);
    expect(session.acknowledgedGeneration).toBe(0);
    expect(session.reconciliationRequired?.reason).toBe('canonical-verification');
    expect(session.reconciliationRequired?.canonicalVerificationReadAttempted).toBe(true);
  });

  it('F/G: clean refresh adopts content+base atomically; dirty refresh is evidence only and blocks stale-base save', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const remote2 = { ...product, model: 'Server v2', version: 2 };
    const remote3 = { ...product, model: 'Server v3', version: 3 };
    const readSpy = vi.spyOn(SupabaseService, 'listLibraryWorkspace')
      .mockResolvedValueOnce(workspaceResponse([remote2]))
      .mockResolvedValueOnce(workspaceResponse([remote3]))
      .mockResolvedValueOnce(workspaceResponse([remote2]));
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct');

    await useLibraryStore.getState().loadWorkspace();
    let session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.baseRevision).toBe(2);
    expect(session.draft.model).toBe('Server v2');

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'Local after v2');
    await useLibraryStore.getState().loadWorkspace();
    session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.baseRevision).toBe(2);
    expect(session.draft.specs.range).toBe('Local after v2');
    expect(session.remoteRevision).toBe(3);
    expect(session.remoteSnapshot?.model).toBe('Server v3');
    expect(session.conflict).not.toBeNull();
    await useLibraryStore.getState().loadWorkspace();
    session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.remoteRevision).toBe(3);
    expect(session.remoteSnapshot?.model).toBe('Server v3');
    await expect(useLibraryStore.getState().flushLibraryEdits()).resolves.toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(readSpy).toHaveBeenCalledTimes(3);
  });

  it('clean authoritative refresh adopts remote deletion as an explicit deleted owner state', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const readSpy = vi.spyOn(SupabaseService, 'listLibraryWorkspace')
      .mockResolvedValueOnce(workspaceResponse([]));

    await useLibraryStore.getState().loadWorkspace();

    const session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(session.remoteDeletion).toBe(true);
    expect(session.baseSnapshot).toBeNull();
    expect(session.baseRevision).toBeNull();
    expect(useLibraryStore.getState().products.some((candidate) => candidate.id === product.id)).toBe(false);
  });

  it('D: discard token is invalidated by a new edit before the delayed read can dispose the draft', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const read = deferred<any>();
    vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockImplementationOnce(() => read.promise);

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'Draft A');
    const discard = useLibraryStore.getState().discardProductWithRefresh(product.id, 7);
    expect(useLibraryStore.getState().getProductSession(product.id)?.discardToken).not.toBeNull();
    useLibraryStore.getState().updateProductCell(product.id, 'range', 'Draft B');
    expect(useLibraryStore.getState().getProductSession(product.id)?.discardToken).toBeNull();

    read.resolve(workspaceResponse([{ ...product, specs: { ...product.specs, range: 'Server B' }, version: 2 }]));
    await expect(discard).resolves.toBe(false);
    const session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.draft.specs.range).toBe('Draft B');
    expect(session.baseRevision).toBe(1);
  });

  it('E/M: Save invalidates a pending discard token and duplicate Save joins the same network mutation', async () => {
    const product = productFixture();
    await loadVerified([product]);
    const read = deferred<any>();
    vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockImplementationOnce(() => read.promise);
    const write = deferred<any>();
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct').mockImplementationOnce(() => write.promise);

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'Draft A');
    const discard = useLibraryStore.getState().discardProductWithRefresh(product.id, 8);
    const save1 = useLibraryStore.getState().flushLibraryEdits();
    const save2 = useLibraryStore.getState().flushLibraryEdits();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(useLibraryStore.getState().getProductSession(product.id)?.discardToken).toBeNull();

    read.resolve(workspaceResponse([{ ...product, version: 2 }]));
    await expect(discard).resolves.toBe(false);
    const sent = saveSpy.mock.calls[0][0] as Product;
    write.resolve({ success: true, data: rowFromProduct(sent, 2) });
    await expect(save1).resolves.toBe(true);
    await expect(save2).resolves.toBe(true);
  });

  it('I/storm guard: successor 40001 preserves candidate and conflict blocks all further automatic/manual writes', async () => {
    vi.useFakeTimers();
    const product = productFixture();
    await loadVerified([product]);
    const first = deferred<any>();
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct')
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ success: false, conflict: true, error: '40001 conflict' });

    useLibraryStore.getState().updateProductCell(product.id, 'range', 'A');
    const drain = useLibraryStore.getState().flushLibraryEdits();
    useLibraryStore.getState().updateProductCell(product.id, 'range', 'B');
    const sent1 = saveSpy.mock.calls[0][0] as Product;
    first.resolve({ success: true, data: rowFromProduct(sent1, 2) });
    await expect(drain).resolves.toBe(false);
    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy.mock.calls[1][1]).toBe(2);
    let session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.baseRevision).toBe(2);
    expect(session.draft.specs.range).toBe('B');
    expect(session.conflict).not.toBeNull();

    for (let index = 0; index < 50; index += 1) {
      await useLibraryStore.getState().flushLibraryEdits(index % 2 === 0 ? 'manual' : 'automatic');
    }
    vi.advanceTimersByTime(10_000);
    await Promise.resolve();
    expect(saveSpy).toHaveBeenCalledTimes(2);
    session = useLibraryStore.getState().getProductSession(product.id)!;
    expect(session.conflict).not.toBeNull();
  });

  it('C: late ACK for P never mutates the active Q owner', async () => {
    const productP = productFixture();
    const productQ = productFixture({
      id: '22222222-2222-4222-8222-222222222222',
      code: 'Q-200',
      model: 'Valve',
      version: 7
    });
    await loadVerified([productP, productQ]);
    const write = deferred<any>();
    const saveSpy = vi.spyOn(SupabaseService, 'saveProduct').mockImplementationOnce(() => write.promise);

    useLibraryStore.getState().updateProductCell(productP.id, 'range', 'P local');
    const save = useLibraryStore.getState().flushLibraryEdits();
    useLibraryStore.getState().setSelectedProduct(productQ.id);
    const beforeQ = useLibraryStore.getState().getProduct(productQ.id)!;
    const sent = saveSpy.mock.calls[0][0] as Product;
    write.resolve({ success: true, data: rowFromProduct(sent, 2) });
    await expect(save).resolves.toBe(true);

    const afterQ = useLibraryStore.getState().getProduct(productQ.id)!;
    expect(afterQ).toEqual(beforeQ);
    expect(useLibraryStore.getState().getProductSession(productQ.id)?.baseRevision).toBe(7);
    expect(useLibraryStore.getState().getProductSession(productP.id)?.baseRevision).toBe(2);
  });
});
