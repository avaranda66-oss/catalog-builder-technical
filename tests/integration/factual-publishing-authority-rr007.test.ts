import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../../src/domain/catalog.schema';
import {
  addDatum,
  addModule,
  createOverride,
  createWorkbook,
  type ProductWorkbook
} from '../../src/domain/product-workbook';
import {
  ProductKnowledgeRuntime,
  type ProductWorkbookFetcher
} from '../../src/domain/table-binding/product-knowledge.runtime';
import type { ProductRegistryReader } from '../../src/domain/table-binding/product-registry-reader.types';
import { auditCatalogPublishSafety } from '../../src/domain/table-core/publish-safety.audit';

const PRODUCT_ID = 'prod-rr007';
const FAMILY_ID = 'fam-rr007';
const SEMANTIC_KEY = 'metrology.accuracy.limit';

function createCatalog(options?: { snapshot?: boolean }): Catalog {
  return {
    id: 'cat-rr007',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        blocks: [
          {
            id: 'block-1',
            type: 'specs_table',
            tableRows: [
              {
                id: 'row-1',
                cellBindings: {
                  accuracy: {
                    sourceKind: 'pim_datum',
                    productId: PRODUCT_ID,
                    semanticKey: SEMANTIC_KEY,
                    bindingMode: 'live',
                    snapshot: options?.snapshot ? { kind: 'value_unit', amount: 0.1, unit: '°C' } : undefined
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  } as unknown as Catalog;
}

function createFamilyWorkbook(status: 'approved' | 'verified' = 'approved'): ProductWorkbook {
  let workbook = createWorkbook({
    id: 'wb-family-rr007',
    owner: { kind: 'family', id: FAMILY_ID },
    revision: 7
  });
  workbook = addModule(workbook, {
    id: 'mod-metrology',
    semanticKey: 'metrology.general',
    label: 'Metrologia',
    kind: 'key_value',
    order: 1
  });
  return addDatum(
    workbook,
    {
      semanticKey: SEMANTIC_KEY,
      moduleId: 'mod-metrology',
      label: 'Accuracy',
      value: { type: 'quantity', amount: 0.1, unit: '°C' },
      evidence: [],
      status
    },
    'family-accuracy'
  );
}

function createProductWorkbook(options: {
  localStatus?: 'draft' | 'approved';
  draftOverride?: boolean;
} = {}): ProductWorkbook {
  let workbook = createWorkbook({
    id: 'wb-product-rr007',
    owner: { kind: 'product', id: PRODUCT_ID },
    revision: 3
  });

  if (options.localStatus) {
    workbook = addModule(workbook, {
      id: 'mod-product',
      semanticKey: 'product.general',
      label: 'Produto',
      kind: 'key_value',
      order: 1
    });
    workbook = addDatum(
      workbook,
      {
        semanticKey: SEMANTIC_KEY,
        moduleId: 'mod-product',
        label: 'Accuracy',
        value: { type: 'quantity', amount: 0.05, unit: '°C' },
        evidence: [],
        status: options.localStatus
      },
      'product-accuracy'
    );
  }

  if (options.draftOverride) {
    workbook = createOverride(workbook, {
      targetSemanticKey: SEMANTIC_KEY,
      mode: 'override',
      overriddenValue: { type: 'quantity', amount: 0.05, unit: '°C' },
      overriddenStatus: 'draft'
    });
  }

  return workbook;
}

function createRuntime(options: {
  productWorkbook: ProductWorkbook | null;
  familyWorkbook?: ProductWorkbook | null;
  familyId?: string;
}) {
  const registryReader: ProductRegistryReader = {
    getProductIdentity: vi.fn(async (productId: string) =>
      productId === PRODUCT_ID
        ? { id: PRODUCT_ID, code: 'RR007', familyId: options.familyId }
        : null
    ),
    getProductsByIds: vi.fn(async (productIds: string[]) =>
      productIds.includes(PRODUCT_ID)
        ? [{ id: PRODUCT_ID, code: 'RR007', familyId: options.familyId }]
        : []
    ),
    getProductsByFamilyIds: vi.fn(async (familyIds: string[]) =>
      options.familyId && familyIds.includes(options.familyId)
        ? [{ id: PRODUCT_ID, code: 'RR007', familyId: options.familyId }]
        : []
    )
  };
  const getWorkbook = vi.fn(async (owner: { kind: 'product' | 'family'; id: string }) => {
    if (owner.kind === 'product' && owner.id === PRODUCT_ID) return options.productWorkbook;
    if (owner.kind === 'family' && owner.id === options.familyId) return options.familyWorkbook ?? null;
    return null;
  });
  const workbookFetcher: ProductWorkbookFetcher = { getWorkbook };

  return {
    runtime: new ProductKnowledgeRuntime({ registryReader, workbookFetcher }),
    getWorkbook
  };
}

describe('RR007 — factual publishing authority', () => {
  it('T1/T3: approved local fact publishes, while standalone draft local fact is fail-closed', async () => {
    const approvedRuntime = createRuntime({ productWorkbook: createProductWorkbook({ localStatus: 'approved' }) }).runtime;
    const catalog = createCatalog();
    await approvedRuntime.preloadCatalogProductKnowledge(catalog);
    const approvedReport = auditCatalogPublishSafety({
      catalog,
      runtimeStatus: approvedRuntime.getStatus(),
      resolveDatum: approvedRuntime.getCompositeDatumResolver()
    });
    expect(approvedReport.canPublish).toBe(true);

    const draftRuntime = createRuntime({ productWorkbook: createProductWorkbook({ localStatus: 'draft' }) }).runtime;
    await draftRuntime.preloadCatalogProductKnowledge(catalog);
    const draftReport = auditCatalogPublishSafety({
      catalog,
      runtimeStatus: draftRuntime.getStatus(),
      resolveDatum: draftRuntime.getCompositeDatumResolver()
    });
    expect(draftReport.canPublish).toBe(false);
    expect(draftReport.issues.some((issue) => issue.code === 'DRAFT_TECHNICAL_DATUM')).toBe(true);
  });

  it('T2/T4/T11/T13: publishing intent preserves approved family authority without changing editing truth or causing reads', async () => {
    const familyWorkbook = createFamilyWorkbook('approved');
    const productWorkbook = createProductWorkbook({ draftOverride: true });
    const { runtime, getWorkbook } = createRuntime({
      productWorkbook,
      familyWorkbook,
      familyId: FAMILY_ID
    });
    const catalog = createCatalog();
    await runtime.preloadCatalogProductKnowledge(catalog);
    const readsAfterPreload = getWorkbook.mock.calls.length;

    const editingResolver = runtime.getCompositeDatumResolver();
    const publishingResolver = runtime.getCompositeDatumResolver(
      undefined,
      'effective_for_publishing'
    );

    expect(editingResolver({
      kind: 'datum_reference',
      productId: PRODUCT_ID,
      datumKey: SEMANTIC_KEY,
      bindingMode: 'live'
    })?.value).toEqual({ kind: 'value_unit', amount: 0.05, unit: '°C', qualifier: undefined });

    expect(publishingResolver({
      kind: 'datum_reference',
      productId: PRODUCT_ID,
      datumKey: SEMANTIC_KEY,
      bindingMode: 'live'
    })?.value).toEqual({ kind: 'value_unit', amount: 0.1, unit: '°C', qualifier: undefined });

    const report = auditCatalogPublishSafety({
      catalog,
      runtimeStatus: runtime.getStatus(),
      resolveDatum: publishingResolver
    });
    expect(report.canPublish).toBe(true);
    expect(getWorkbook).toHaveBeenCalledTimes(readsAfterPreload);
  });

  it('T5: unavailable factual authority cannot silently authorize a live factual binding', () => {
    const report = auditCatalogPublishSafety({
      catalog: createCatalog(),
      runtimeStatus: 'unavailable'
    });

    expect(report.canPublish).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'RUNTIME_UNAVAILABLE')).toBe(true);
  });

  it('T7/T8: partial fallback remains explicit and unresolved conflict remains blocked', () => {
    const partialWithSnapshot = auditCatalogPublishSafety({
      catalog: createCatalog({ snapshot: true }),
      runtimeStatus: 'partial',
      failedProductIds: [PRODUCT_ID],
      resolveDatum: () => ({
        value: { kind: 'value_unit', amount: 0.1, unit: '°C' },
        status: 'unknown'
      })
    });
    expect(partialWithSnapshot.canPublish).toBe(true);
    expect(partialWithSnapshot.issues.some((issue) => issue.code === 'FAILED_PRODUCT_SNAPSHOT_FALLBACK')).toBe(true);

    const conflict = auditCatalogPublishSafety({
      catalog: createCatalog(),
      runtimeStatus: 'ready',
      resolveDatum: () => ({
        value: { kind: 'value_unit', amount: 0.1, unit: '°C' },
        status: 'conflict'
      })
    });
    expect(conflict.canPublish).toBe(false);
    expect(conflict.issues.some((issue) => issue.code === 'CONFLICT_TECHNICAL_DATUM')).toBe(true);
  });
});
