import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '@/domain/catalog.schema';
import {
  addDataset,
  addDatasetColumn,
  addDatasetRow,
  addDatum,
  addModule,
  cloneDataset,
  createWorkbook,
  deleteDatasetColumn,
  deleteDatum,
  ensureWorkbookV2,
  getProductKnowledgeSnapshot,
  removeModule,
  renameModuleLabel,
  resolveEffectiveProductKnowledge,
  setDatasetCell,
  updateDatumValue,
  validateProductWorkbook,
  type ProductWorkbook,
  type ProductWorkbookV2
} from '@/domain/product-workbook';
import { createProductWorkbookDatumResolver } from '@/domain/table-binding';
import { auditCatalogPublishSafety } from '@/domain/table-core';
import {
  createPinnedPublicationDatumResolver,
  createPublicationExportSnapshot
} from '@/domain/publication-export-snapshot';
import { CleanA4Document } from '@/components/export/CleanA4Document';
import { SupabaseProductWorkbookRepository } from '@/services/product-workbook';
import { useUIStore } from '@/stores/useUIStore';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const CLONE_TARGET_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

interface RpcArgs {
  p_workbook?: ProductWorkbook;
  p_expected_revision?: number;
  p_owner_kind?: 'product' | 'family';
  p_owner_id?: string;
}

function createInMemoryWorkbookRepository() {
  let persisted: ProductWorkbook | null = null;

  const rpc = vi.fn(async (name: string, args: RpcArgs) => {
    if (name === 'get_product_workbook_v2' || name === 'get_product_workbook_v1') {
      const ownerMatches =
        persisted &&
        persisted.owner.kind === args.p_owner_kind &&
        persisted.owner.id === args.p_owner_id;
      return {
        data: ownerMatches ? structuredClone(persisted) : null,
        error: null
      };
    }

    if (name === 'save_product_workbook_v2' || name === 'save_product_workbook_v1') {
      const workbook = args.p_workbook;
      const expectedRevision = args.p_expected_revision;
      if (!workbook || expectedRevision === undefined) {
        return {
          data: null,
          error: { code: '22023', message: 'missing workbook or expected revision' }
        };
      }

      const actualRevision = persisted?.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        return {
          data: null,
          error: {
            code: '40001',
            message: `WORKBOOK_CONFLICT Esperada: ${expectedRevision}. Atual: ${actualRevision}.`
          }
        };
      }

      persisted = {
        ...structuredClone(workbook),
        revision: expectedRevision + 1
      };
      return { data: structuredClone(persisted), error: null };
    }

    return {
      data: null,
      error: { code: '42883', message: `unexpected RPC ${name}` }
    };
  });

  return {
    repository: new SupabaseProductWorkbookRepository({ rpc } as any),
    rpc
  };
}

function createTechnicalWorkbook(productId = PRODUCT_ID): ProductWorkbookV2 {
  let workbook = ensureWorkbookV2(
    createWorkbook({ owner: { kind: 'product', id: productId }, revision: 0 })
  );

  workbook = addModule(workbook, {
    id: 'mod-metrology',
    semanticKey: 'metrology.core',
    label: 'Metrologia',
    kind: 'key_value',
    order: 0
  }) as ProductWorkbookV2;

  workbook = addDatum(
    workbook,
    {
      semanticKey: 'metrology.accuracy',
      moduleId: 'mod-metrology',
      label: 'Exatidão',
      value: { type: 'text', value: '±0,025% FS' },
      evidence: [],
      status: 'approved'
    },
    'datum-accuracy'
  ) as ProductWorkbookV2;

  workbook = addDatum(
    workbook,
    {
      semanticKey: 'metrology.range',
      moduleId: 'mod-metrology',
      label: 'Faixa',
      value: { type: 'range', lower: 0, upper: 100, unit: 'bar' },
      evidence: [],
      status: 'approved'
    },
    'datum-range'
  ) as ProductWorkbookV2;

  return workbook;
}

function addTechnicalDataset(workbook: ProductWorkbookV2): ProductWorkbookV2 {
  let updated = addDataset(workbook, {
    id: 'dataset-performance',
    semanticKey: 'metrology.performance',
    moduleId: 'mod-metrology',
    label: 'Performance',
    kind: 'matrix',
    columns: [],
    rows: [],
    cells: {},
    order: 0
  });

  updated = addDatasetColumn(updated, 'dataset-performance', {
    id: 'col-accuracy',
    semanticKey: 'performance.accuracy',
    label: 'Exatidão',
    valueType: 'text',
    order: 0
  });
  updated = addDatasetColumn(updated, 'dataset-performance', {
    id: 'col-range',
    semanticKey: 'performance.range',
    label: 'Faixa',
    valueType: 'range',
    unit: 'bar',
    order: 1
  });
  updated = addDatasetRow(updated, 'dataset-performance', {
    id: 'row-main',
    semanticKey: 'performance.main',
    label: 'Principal',
    order: 0
  });
  updated = setDatasetCell(updated, 'dataset-performance', {
    rowId: 'row-main',
    columnId: 'col-accuracy',
    datumId: 'datum-accuracy'
  });
  updated = setDatasetCell(updated, 'dataset-performance', {
    rowId: 'row-main',
    columnId: 'col-range',
    datumId: 'datum-range'
  });
  return updated;
}

function createPublishCatalog(sourceRevision: number): Catalog {
  return {
    id: 'catalog-company-acceptance',
    title: 'Company Acceptance Catalog',
    subtitle: 'Critical journey factual snapshot',
    themeId: 'default-technical',
    version: 7,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    pages: [
      {
        id: 'page-company-acceptance',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Technical Truth',
        blocks: [
          {
            id: 'specs-company-acceptance',
            type: 'specs_table',
            title: 'Especificações Publicáveis',
            tableColumns: [{ key: 'accuracy', label: 'Exatidão', visible: true }],
            tableRows: [
              {
                id: 'row-company-acceptance',
                productRefId: PRODUCT_ID,
                order: 0,
                cellBindings: {
                  accuracy: {
                    sourceKind: 'pim_datum',
                    productId: PRODUCT_ID,
                    semanticKey: 'metrology.accuracy',
                    bindingMode: 'live',
                    sourceRevision,
                    sourceOwnerKind: 'product',
                    sourceOwnerId: PRODUCT_ID
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  };
}

beforeEach(() => {
  useUIStore.getState().closeProductKnowledgeWorkspace();
});

afterEach(() => {
  cleanup();
  useUIStore.getState().closeProductKnowledgeWorkspace();
  vi.restoreAllMocks();
});

describe('W3-I Company Acceptance — critical journeys', () => {
  it('[PARTIALLY PROVEN][NEW] selects workspace, saves technical knowledge, closes/reopens and reloads the same datum', async () => {
    const { repository, rpc } = createInMemoryWorkbookRepository();

    useUIStore.getState().openProductKnowledgeWorkspace(PRODUCT_ID);
    expect(useUIStore.getState().selectedProductForWorkspaceId).toBe(PRODUCT_ID);

    const workbook = createTechnicalWorkbook();
    const save = await repository.saveWorkbook({ workbook, expectedRevision: 0 });
    expect(save.success).toBe(true);
    expect(save.revision).toBe(1);

    useUIStore.getState().closeProductKnowledgeWorkspace();
    expect(useUIStore.getState().selectedProductForWorkspaceId).toBeNull();

    useUIStore.getState().openProductKnowledgeWorkspace(PRODUCT_ID);
    const reopened = await repository.getWorkbook({ kind: 'product', id: PRODUCT_ID });

    expect(reopened?.revision).toBe(1);
    expect(reopened?.data['datum-accuracy']?.value).toEqual({
      type: 'text',
      value: '±0,025% FS'
    });
    expect(rpc).toHaveBeenCalledWith('get_product_workbook_v2', {
      p_owner_kind: 'product',
      p_owner_id: PRODUCT_ID
    });
  });

  it('[PROVEN][EDIT] reloads persisted state, changes multiple facts, saves, reloads and keeps exact cardinality without duplication', async () => {
    const { repository } = createInMemoryWorkbookRepository();
    const initial = createTechnicalWorkbook();
    await repository.saveWorkbook({ workbook: initial, expectedRevision: 0 });

    const loaded = await repository.getWorkbook({ kind: 'product', id: PRODUCT_ID });
    expect(loaded).not.toBeNull();

    let edited = ensureWorkbookV2(loaded!);
    edited = updateDatumValue(edited, 'datum-accuracy', {
      type: 'text',
      value: '±0,010% FS'
    }) as ProductWorkbookV2;
    edited = updateDatumValue(edited, 'datum-range', {
      type: 'range',
      lower: -1,
      upper: 120,
      unit: 'bar'
    }) as ProductWorkbookV2;
    edited = renameModuleLabel(edited, 'mod-metrology', 'Metrologia Principal') as ProductWorkbookV2;

    const save = await repository.saveWorkbook({
      workbook: edited,
      expectedRevision: edited.revision
    });
    expect(save.revision).toBe(2);

    const reloaded = ensureWorkbookV2(
      (await repository.getWorkbook({ kind: 'product', id: PRODUCT_ID }))!
    );
    const module = reloaded.modules.find((item) => item.id === 'mod-metrology');

    expect(reloaded.data['datum-accuracy'].value).toEqual({
      type: 'text',
      value: '±0,010% FS'
    });
    expect(reloaded.data['datum-range'].value).toEqual({
      type: 'range',
      lower: -1,
      upper: 120,
      unit: 'bar'
    });
    expect(module?.label).toBe('Metrologia Principal');
    expect(Object.keys(reloaded.data)).toHaveLength(2);
    expect(new Set(module?.datumIds ?? []).size).toBe(2);
  });

  it('[PROVEN][DELETE] permanently removes datum, module and dataset column with zero ghost references after reload', async () => {
    const { repository } = createInMemoryWorkbookRepository();
    let workbook = addTechnicalDataset(createTechnicalWorkbook());

    workbook = addModule(workbook, {
      id: 'mod-secondary',
      semanticKey: 'secondary.notes',
      label: 'Secundário',
      kind: 'rich_notes',
      order: 1
    }) as ProductWorkbookV2;
    workbook = addDatum(
      workbook,
      {
        semanticKey: 'secondary.note',
        moduleId: 'mod-secondary',
        label: 'Nota secundária',
        value: { type: 'text', value: 'remover' },
        evidence: [],
        status: 'draft'
      },
      'datum-secondary'
    ) as ProductWorkbookV2;

    await repository.saveWorkbook({ workbook, expectedRevision: 0 });
    const loaded = ensureWorkbookV2(
      (await repository.getWorkbook({ kind: 'product', id: PRODUCT_ID }))!
    );

    let deleted = deleteDatum(loaded, 'datum-accuracy') as ProductWorkbookV2;
    deleted = deleteDatasetColumn(deleted, 'dataset-performance', 'col-range');
    deleted = removeModule(deleted, 'mod-secondary') as ProductWorkbookV2;

    await repository.saveWorkbook({
      workbook: deleted,
      expectedRevision: deleted.revision
    });

    const reloaded = ensureWorkbookV2(
      (await repository.getWorkbook({ kind: 'product', id: PRODUCT_ID }))!
    );
    const dataset = reloaded.datasets.find((item) => item.id === 'dataset-performance')!;

    expect(reloaded.data['datum-accuracy']).toBeUndefined();
    expect(reloaded.modules.some((item) => item.id === 'mod-secondary')).toBe(false);
    expect(reloaded.data['datum-secondary']).toBeUndefined();
    expect(dataset.columns.some((column) => column.id === 'col-range')).toBe(false);
    expect(Object.values(dataset.cells).some((cell) => cell.datumId === 'datum-accuracy')).toBe(false);
    expect(Object.values(dataset.cells).some((cell) => cell.columnId === 'col-range')).toBe(false);
    expect(reloaded.modules.some((module) => module.datumIds.includes('datum-accuracy'))).toBe(false);
    expect(validateProductWorkbook(reloaded).valid).toBe(true);
  });

  it('[PARTIALLY PROVEN][PUBLISH] keeps synced factual truth across preflight, snapshot/version, CleanA4Document and export target', async () => {
    const { repository } = createInMemoryWorkbookRepository();
    const initial = createTechnicalWorkbook();
    await repository.saveWorkbook({ workbook: initial, expectedRevision: 0 });

    const loaded = (await repository.getWorkbook({ kind: 'product', id: PRODUCT_ID }))!;
    const effectiveKnowledge = resolveEffectiveProductKnowledge({
      productWorkbook: loaded,
      policy: 'effective_for_publishing'
    });
    const factualSnapshot = getProductKnowledgeSnapshot({
      effectiveKnowledge,
      policy: 'approved_only'
    });

    expect(factualSnapshot.productRevision).toBe(1);
    expect(factualSnapshot.facts.get('metrology.accuracy')?.effectiveValue).toEqual({
      type: 'text',
      value: '±0,025% FS'
    });

    const catalog = createPublishCatalog(loaded.revision);
    const publication = createPublicationExportSnapshot({
      sourceKind: 'catalog',
      sourceId: catalog.id,
      document: catalog,
      expectedVersion: catalog.version
    });
    expect(publication.success).toBe(true);
    if (!publication.success) throw new Error(publication.error);

    const liveResolver = createProductWorkbookDatumResolver(
      new Map([[PRODUCT_ID, effectiveKnowledge]]),
      { enableV2Literals: true }
    );
    const pinnedResolver = createPinnedPublicationDatumResolver({
      document: publication.snapshot.document,
      sourceResolver: liveResolver
    });
    const preflight = auditCatalogPublishSafety({
      catalog: publication.snapshot.document,
      syncStatus: 'synced',
      runtimeStatus: 'ready',
      resolveDatum: pinnedResolver
    });

    expect(preflight.canPublish).toBe(true);
    expect(preflight.blockCount).toBe(0);
    expect(publication.snapshot.identity).toBe('catalog:catalog-company-acceptance:v7');
    expect(publication.snapshot.version).toBe(7);

    const { container } = render(
      <CleanA4Document
        document={publication.snapshot.document}
        resolveDatum={pinnedResolver}
      />
    );

    expect(container.querySelectorAll('.a4-page-container')).toHaveLength(1);
    expect(container.querySelector('.clean-export-page')).not.toBeNull();
    expect(container.textContent).toContain('±0,025% FS');
  });

  it('[PROVEN][CLONE] official cross-product clone creates independent identities and survives persistence reload', async () => {
    const source = addTechnicalDataset(createTechnicalWorkbook());
    let target = ensureWorkbookV2(
      createWorkbook({
        owner: { kind: 'product', id: CLONE_TARGET_PRODUCT_ID },
        revision: 0
      })
    );
    target = addModule(target, {
      id: 'mod-target',
      semanticKey: 'target.metrology',
      label: 'Metrologia destino',
      kind: 'matrix',
      order: 0
    }) as ProductWorkbookV2;

    const sourceDataset = source.datasets.find((item) => item.id === 'dataset-performance')!;
    const clone = cloneDataset({
      sourceDataset,
      sourceWorkbook: source,
      targetWorkbook: target,
      targetModuleId: 'mod-target',
      options: {
        newDatasetId: 'dataset_clone',
        newSemanticKey: 'target.performance',
        newLabel: 'Performance clonada',
        datumStatusFallback: 'draft'
      }
    });

    expect(clone.createdDataset.id).toBe('dataset_clone');
    expect(clone.createdDataset.id).not.toBe(sourceDataset.id);
    expect(clone.createdDataset.columns.map((column) => column.id)).not.toEqual(
      sourceDataset.columns.map((column) => column.id)
    );
    expect(clone.createdDataset.rows.map((row) => row.id)).not.toEqual(
      sourceDataset.rows.map((row) => row.id)
    );

    const sourceDatumIds = new Set(Object.keys(source.data));
    const clonedDatumIds = Object.values(clone.createdDataset.cells).map((cell) => cell.datumId);
    expect(clonedDatumIds.length).toBeGreaterThan(0);
    expect(clonedDatumIds.every((id) => !sourceDatumIds.has(id))).toBe(true);

    const { repository } = createInMemoryWorkbookRepository();
    await repository.saveWorkbook({ workbook: clone.updatedWorkbook, expectedRevision: 0 });
    const reloaded = ensureWorkbookV2(
      (await repository.getWorkbook({ kind: 'product', id: CLONE_TARGET_PRODUCT_ID }))!
    );

    expect(reloaded.datasets.some((dataset) => dataset.id === 'dataset_clone')).toBe(true);
    expect(validateProductWorkbook(reloaded).valid).toBe(true);
  });

  it.skip('[BLOCKED BY TEST INFRA][BROWSER E2E] drives NEW/EDIT/DELETE/PUBLISH through Chromium and validates the downloaded export', () => {
    // Playwright is declared by the repository, but this checkout has no installed node_modules/browser runtime.
    // The mission explicitly forbids installing dependencies, so the browser layer stays visible as a blocked gate.
  });
});
