import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../../../src/domain/catalog.schema';
import {
  addDataset,
  addDatum,
  addModule,
  createWorkbook,
  ensureWorkbookV2,
  getDatasetCellKey,
  type ProductWorkbook,
  type ProductWorkbookV2,
  type WorkbookOwner
} from '../../../src/domain/product-workbook';
import {
  ProductKnowledgeRuntime,
  type ProductRegistryReader
} from '../../../src/domain/table-binding';

const P = '11111111-1111-4111-8111-111111111111';
const Q = '22222222-2222-4222-8222-222222222222';
const F = '33333333-3333-4333-8333-333333333333';
const DATUM_KEY = 'process.pressure';
const DATASET_ID = 'dataset-pressure';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function productWorkbook(ownerId: string, amount = 10): ProductWorkbookV2 {
  let workbook = ensureWorkbookV2(createWorkbook({ owner: { kind: 'product', id: ownerId }, revision: 1 }));
  workbook = ensureWorkbookV2(addModule(workbook, {
    id: 'mod-process',
    semanticKey: 'process.general',
    label: 'Processo',
    kind: 'key_value',
    order: 0
  }));
  workbook = ensureWorkbookV2(addDatum(workbook, {
    semanticKey: DATUM_KEY,
    moduleId: 'mod-process',
    label: 'Pressão',
    value: { type: 'quantity', amount, unit: 'bar' },
    evidence: [],
    status: 'approved'
  }, 'datum-pressure'));
  return addDataset(workbook, {
    id: DATASET_ID,
    semanticKey: 'process.pressure_table',
    moduleId: 'mod-process',
    label: 'Tabela de Pressão',
    kind: 'matrix',
    columns: [{
      id: 'col-pressure',
      semanticKey: DATUM_KEY,
      label: 'Pressão',
      valueType: 'quantity',
      unit: 'bar',
      order: 0
    }],
    rows: [{ id: 'row-1', semanticKey: 'process.row.1', label: 'Linha 1', order: 0 }],
    cells: {
      [getDatasetCellKey('row-1', 'col-pressure')]: {
        rowId: 'row-1',
        columnId: 'col-pressure',
        datumId: 'datum-pressure'
      }
    },
    order: 0
  });
}

function familyWorkbook(familyId: string): ProductWorkbook {
  let workbook = createWorkbook({ owner: { kind: 'family', id: familyId }, revision: 4 });
  workbook = addModule(workbook, {
    id: 'mod-family',
    semanticKey: 'family.general',
    label: 'Família',
    kind: 'key_value',
    order: 0
  });
  return addDatum(workbook, {
    semanticKey: 'family.max_pressure',
    moduleId: 'mod-family',
    label: 'Pressão Máxima da Família',
    value: { type: 'quantity', amount: 20, unit: 'bar' },
    evidence: [],
    status: 'approved'
  }, 'datum-family-pressure');
}

function catalog(catalogId: string, productId: string): Catalog {
  return {
    id: catalogId,
    pages: [{
      id: `page-${catalogId}`,
      blocks: [{
        id: `block-${catalogId}`,
        tableRows: [{ id: `row-${catalogId}`, productRefId: productId }]
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

describe('RR006 — authoritative read lifecycle', () => {
  it('AUD006 / NULL TOMBSTONE: verified null removes D from datum, dataset, search, resolver and effective knowledge', async () => {
    const workbook = productWorkbook(P);
    const getWorkbook = vi.fn<((owner: WorkbookOwner) => Promise<ProductWorkbook | null>)>()
      .mockResolvedValueOnce(workbook)
      .mockResolvedValueOnce(null);
    const runtime = new ProductKnowledgeRuntime({
      registryReader: noFamilyRegistry(),
      workbookFetcher: { getWorkbook }
    });

    await expect(runtime.loadProductKnowledge(P)).resolves.not.toBeNull();
    expect(runtime.getDependencyState('product', P)).toBe('verified_present');
    expect(await runtime.getDatum(P, DATUM_KEY)).toBeDefined();
    expect(await runtime.getDataset(P, DATASET_ID)).toBeDefined();
    expect(await runtime.search(P, 'pressão')).toHaveLength(2);
    expect(runtime.getCompositeDatumResolver()({
      kind: 'datum_reference',
      productId: P,
      datumKey: DATUM_KEY,
      bindingMode: 'live'
    })?.value).toEqual({ kind: 'value_unit', amount: 10, unit: 'bar' });

    await expect(runtime.refreshProductKnowledge(P)).resolves.toBeNull();

    expect(runtime.getDependencyState('product', P)).toBe('verified_absent');
    expect(runtime.getResolvedKnowledge(P)).toBeUndefined();
    expect(runtime.getCachedWorkbook('product', P)).toBeUndefined();
    expect(await runtime.getDatum(P, DATUM_KEY)).toBeUndefined();
    expect(await runtime.getDataset(P, DATASET_ID)).toBeUndefined();
    expect(await runtime.search(P, 'pressão')).toEqual([]);
    expect(runtime.getCompositeDatumResolver()({
      kind: 'datum_reference',
      productId: P,
      datumKey: DATUM_KEY,
      bindingMode: 'live'
    })?.value).toEqual({ kind: 'empty' });
    expect(getWorkbook).toHaveBeenCalledTimes(2);
  });

  it('AUD006 / FAILURE != ABSENCE: 500 makes old D non-authoritative and never triggers an automatic retry', async () => {
    const workbook = productWorkbook(P);
    const getWorkbook = vi.fn<((owner: WorkbookOwner) => Promise<ProductWorkbook | null>)>()
      .mockResolvedValueOnce(workbook)
      .mockRejectedValueOnce(new Error('HTTP 500'));
    const runtime = new ProductKnowledgeRuntime({
      registryReader: noFamilyRegistry(),
      workbookFetcher: { getWorkbook }
    });

    await runtime.loadProductKnowledge(P);
    expect(await runtime.getDatum(P, DATUM_KEY)).toBeDefined();

    await expect(runtime.refreshProductKnowledge(P)).resolves.toBeNull();
    expect(runtime.getDependencyState('product', P)).toBe('failed');
    expect(runtime.getResolvedKnowledge(P)).toBeUndefined();
    expect(await runtime.getDatum(P, DATUM_KEY)).toBeUndefined();
    await expect(runtime.search(P, 'pressão')).rejects.toThrow(/500/);
    expect(runtime.getCompositeDatumResolver()({
      kind: 'datum_reference',
      productId: P,
      datumKey: DATUM_KEY,
      bindingMode: 'live'
    })?.value).toEqual({ kind: 'empty' });

    expect(getWorkbook).toHaveBeenCalledTimes(2);
    expect(runtime.getDependencyState('product', P)).not.toBe('verified_absent');
  });

  it('AUD007: P→F verified + product absent + family failure is failed, not known-empty; one explicit retry reads only family once', async () => {
    const family = familyWorkbook(F);
    const getProductIdentity = vi.fn(async () => ({ id: P, code: 'P', familyId: F }));
    const registryReader: ProductRegistryReader = {
      getProductIdentity,
      getProductsByIds: vi.fn(async () => [{ id: P, code: 'P', familyId: F }]),
      getProductsByFamilyIds: vi.fn(async () => [])
    };
    let familyReads = 0;
    let productReads = 0;
    const getWorkbook = vi.fn(async (owner: WorkbookOwner): Promise<ProductWorkbook | null> => {
      if (owner.kind === 'product') {
        productReads += 1;
        return null;
      }
      familyReads += 1;
      if (familyReads === 1) throw new Error('family HTTP 500');
      return family;
    });
    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher: { getWorkbook } });

    await expect(runtime.loadProductKnowledge(P)).resolves.toBeNull();
    expect(runtime.getDependencyState('registry', P)).toBe('verified_present');
    expect(runtime.getDependencyState('product', P)).toBe('verified_absent');
    expect(runtime.getDependencyState('family', F)).toBe('failed');
    expect(runtime.getKnownEmptyProductIds()).not.toContain(P);
    expect(runtime.getResolvedKnowledge(P)).toBeUndefined();
    expect(productReads).toBe(1);
    expect(familyReads).toBe(1);

    await expect(runtime.retryProductKnowledge(P)).resolves.not.toBeNull();
    expect(runtime.getDependencyState('family', F)).toBe('verified_present');
    expect(await runtime.getDatum(P, 'family.max_pressure')).toMatchObject({
      productId: P,
      sourceOwnerKind: 'family',
      sourceOwnerId: F
    });
    expect(getProductIdentity).toHaveBeenCalledTimes(1);
    expect(productReads).toBe(1);
    expect(familyReads).toBe(2);
  });

  it('P→Q owner switch is atomic: Q scope immediately revokes P authority', async () => {
    const getWorkbook = vi.fn(async (owner: WorkbookOwner) => productWorkbook(owner.id, owner.id === P ? 10 : 30));
    const runtime = new ProductKnowledgeRuntime({
      registryReader: noFamilyRegistry(),
      workbookFetcher: { getWorkbook }
    });

    await runtime.loadProductKnowledge(P);
    expect(runtime.getResolvedKnowledge(P)).toBeDefined();

    const qLoad = runtime.preloadCatalogProductKnowledge(catalog('catalog-Q', Q));
    expect(runtime.getActiveCatalogId()).toBe('catalog-Q');
    expect(runtime.getResolvedKnowledge(P)).toBeUndefined();
    expect(await runtime.getDatum(P, DATUM_KEY)).toBeUndefined();
    await qLoad;
    expect(runtime.getResolvedKnowledge(P)).toBeUndefined();
    expect(runtime.getResolvedKnowledge(Q)).toBeDefined();
  });

  it('late P response cannot commit after catalog Q owns the newer epoch', async () => {
    const lateP = deferred<ProductWorkbook | null>();
    const getWorkbook = vi.fn(async (owner: WorkbookOwner): Promise<ProductWorkbook | null> => {
      if (owner.id === P) return lateP.promise;
      return productWorkbook(Q, 30);
    });
    const runtime = new ProductKnowledgeRuntime({
      registryReader: noFamilyRegistry(),
      workbookFetcher: { getWorkbook }
    });

    const pLoad = runtime.preloadCatalogProductKnowledge(catalog('catalog-P', P));
    await Promise.resolve();
    const qLoad = runtime.preloadCatalogProductKnowledge(catalog('catalog-Q', Q));
    await qLoad;

    expect(runtime.getActiveCatalogId()).toBe('catalog-Q');
    expect(runtime.getResolvedKnowledge(Q)).toBeDefined();
    expect(runtime.getResolvedKnowledge(P)).toBeUndefined();

    lateP.resolve(productWorkbook(P));
    await pLoad;
    expect(runtime.getActiveCatalogId()).toBe('catalog-Q');
    expect(runtime.getResolvedKnowledge(P)).toBeUndefined();
  });

  it('StrictMode/concurrent exact loads coalesce to one registry read and one physical workbook read', async () => {
    const pending = deferred<ProductWorkbook | null>();
    const registryReader = noFamilyRegistry();
    const getWorkbook = vi.fn(async () => pending.promise);
    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher: { getWorkbook } });

    const a = runtime.loadProductKnowledge(P);
    const b = runtime.loadProductKnowledge(P);
    expect(a).toBe(b);
    pending.resolve(productWorkbook(P));
    await Promise.all([a, b]);

    expect(registryReader.getProductIdentity).toHaveBeenCalledTimes(1);
    expect(getWorkbook).toHaveBeenCalledTimes(1);
    await runtime.loadProductKnowledge(P);
    expect(getWorkbook).toHaveBeenCalledTimes(1);
  });

  it('concurrent catalog preloads with the same owner set join one preload flight', async () => {
    const pending = deferred<ProductWorkbook | null>();
    const registryReader = noFamilyRegistry();
    const getWorkbook = vi.fn(async () => pending.promise);
    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher: { getWorkbook } });
    const target = catalog('catalog-P', P);

    const a = runtime.preloadCatalogProductKnowledge(target);
    const b = runtime.preloadCatalogProductKnowledge(target);
    expect(a).toBe(b);
    await Promise.resolve();
    pending.resolve(productWorkbook(P));
    await Promise.all([a, b]);

    expect(registryReader.getProductsByIds).toHaveBeenCalledTimes(1);
    expect(getWorkbook).toHaveBeenCalledTimes(1);
  });
});
