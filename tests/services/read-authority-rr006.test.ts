import { describe, expect, it, vi } from 'vitest';
import {
  addDatum,
  addModule,
  createWorkbook,
  type ProductWorkbook,
  type WorkbookOwner
} from '../../src/domain/product-workbook';
import {
  InMemoryProductRegistryReader,
  ProductKnowledgeRuntime
} from '../../src/domain/table-binding';
import { SupabaseProductKnowledgeProvider } from '../../src/services/product-knowledge/supabase-product-knowledge.provider';
import { SupabaseProductRegistryReader } from '../../src/services/product-knowledge/supabase-product-registry.reader';
import { SupabaseProductWorkbookRepository } from '../../src/services/product-workbook/product-workbook.repository';
import type { ProductWorkbookRepository } from '../../src/services/product-workbook/persistence.types';

const P = '11111111-1111-4111-8111-111111111111';
const DATUM_KEY = 'process.pressure';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function workbook(ownerId = P): ProductWorkbook {
  let result = createWorkbook({ owner: { kind: 'product', id: ownerId }, revision: 1 });
  result = addModule(result, {
    id: 'mod-process',
    semanticKey: 'process.general',
    label: 'Processo',
    kind: 'key_value',
    order: 0
  });
  return addDatum(result, {
    semanticKey: DATUM_KEY,
    moduleId: 'mod-process',
    label: 'Pressão',
    value: { type: 'quantity', amount: 10, unit: 'bar' },
    evidence: [],
    status: 'approved'
  }, 'datum-pressure');
}

describe('RR006 — service read authority and physical-read budget', () => {
  it('SINGLE FLIGHT / V2 success: concurrent exact reads perform one physical RPC and retain no promise after settlement', async () => {
    const pending = deferred<{ data: ProductWorkbook; error: null }>();
    const rpc = vi.fn(() => pending.promise);
    const repository = new SupabaseProductWorkbookRepository({ rpc } as any);
    const owner: WorkbookOwner = { kind: 'product', id: P };

    const first = repository.getWorkbook(owner);
    const second = repository.getWorkbook(owner);
    expect(first).toBe(second);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_product_workbook_v2', {
      p_owner_kind: 'product',
      p_owner_id: P
    });

    pending.resolve({ data: workbook(), error: null });
    await Promise.all([first, second]);

    await repository.getWorkbook(owner);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('V2 missing: performs exactly V2 then V1 once', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function public.get_product_workbook_v2 does not exist' } })
      .mockResolvedValueOnce({ data: workbook(), error: null });
    const repository = new SupabaseProductWorkbookRepository({ rpc } as any);

    await expect(repository.getWorkbook({ kind: 'product', id: P })).resolves.not.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'get_product_workbook_v2',
      'get_product_workbook_v1'
    ]);
  });

  it('other V2 failure: no fallback and zero automatic retry', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '500', message: 'upstream unavailable' }
    });
    const repository = new SupabaseProductWorkbookRepository({ rpc } as any);

    await expect(repository.getWorkbook({ kind: 'product', id: P })).rejects.toThrow(/GET_WORKBOOK_FAILED/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('get_product_workbook_v2');
  });

  it('registry failure is observable and never returns a previously cached identity as verified absence/presence', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        data: [{ id: P, code: 'P-1', model: 'Pump', name: 'Pump', family_id: null, family: null }],
        error: null
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'registry HTTP 500' }
      });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: query }))
      }))
    } as any;
    const reader = new SupabaseProductRegistryReader(client);

    await expect(reader.getProductIdentity(P)).resolves.toMatchObject({ id: P, code: 'P-1' });
    await expect(reader.getProductIdentity(P)).rejects.toThrow(/registry HTTP 500/);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('scoped provider reads cannot bypass a runtime tombstone and resurrect D from repository/RPC', async () => {
    const getWorkbook = vi.fn<((owner: WorkbookOwner) => Promise<ProductWorkbook | null>)>()
      .mockResolvedValueOnce(workbook())
      .mockResolvedValueOnce(null);
    const saveWorkbook = vi.fn<ProductWorkbookRepository['saveWorkbook']>();
    const repository: ProductWorkbookRepository = { getWorkbook, saveWorkbook };
    const registryReader = new InMemoryProductRegistryReader();
    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher: repository });
    const rpc = vi.fn();
    const provider = new SupabaseProductKnowledgeProvider({
      client: { rpc } as any,
      repository,
      registryReader,
      runtime
    });

    await runtime.loadProductKnowledge(P);
    expect(await provider.getDatum(P, DATUM_KEY)).toBeDefined();
    await runtime.refreshProductKnowledge(P);
    expect(runtime.getDependencyState('product', P)).toBe('verified_absent');

    expect(await provider.getDatum(P, DATUM_KEY)).toBeUndefined();
    expect(await provider.search(P, 'pressão')).toEqual([]);
    expect(getWorkbook).toHaveBeenCalledTimes(2);
    expect(rpc).not.toHaveBeenCalled();
  });
});
