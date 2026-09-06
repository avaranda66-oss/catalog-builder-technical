import { describe, expect, it, vi } from 'vitest';
import {
  ProductWorkbookV2,
  addDataset,
  addDatum,
  addModule,
  createSavedView,
  createWorkbook,
  deleteDatum,
  ensureWorkbookV2,
  getDatasetCellKey,
  parseProductWorkbook,
  removeModule,
  setDatasetCell,
  validateProductWorkbook
} from '../../../src/domain/product-workbook';
import { SupabaseProductWorkbookRepository } from '../../../src/services/product-workbook';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

function createLifecycleWorkbook(): ProductWorkbookV2 {
  let workbook = ensureWorkbookV2(
    createWorkbook({ owner: { kind: 'product', id: PRODUCT_ID }, revision: 3 })
  );
  workbook = addModule(workbook, {
    id: 'm1', semanticKey: 'spec.pressure', label: 'Pressure', kind: 'matrix', order: 0
  }) as ProductWorkbookV2;
  workbook = addModule(workbook, {
    id: 'm2', semanticKey: 'spec.temperature', label: 'Temperature', kind: 'matrix', order: 1
  }) as ProductWorkbookV2;
  workbook = addDatum(workbook, {
    semanticKey: 'spec.pressure.value', moduleId: 'm1', label: 'Pressure value',
    value: { type: 'number', value: 12 }, evidence: [], status: 'draft'
  }, 'd1') as ProductWorkbookV2;
  workbook = addDatum(workbook, {
    semanticKey: 'spec.temperature.value', moduleId: 'm2', label: 'Temperature value',
    value: { type: 'number', value: 25 }, evidence: [], status: 'draft'
  }, 'd2') as ProductWorkbookV2;

  workbook = addDataset(workbook, {
    id: 'ds-m1', semanticKey: 'spec.pressure.table', moduleId: 'm1', label: 'Pressure table', kind: 'matrix',
    columns: [{ id: 'c1', semanticKey: 'spec.pressure.column', label: 'Value', valueType: 'number', order: 0 }],
    rows: [{ id: 'r1', semanticKey: 'spec.pressure.row', order: 0 }], cells: {}, order: 0
  });
  workbook = addDataset(workbook, {
    id: 'ds-m2', semanticKey: 'spec.temperature.table', moduleId: 'm2', label: 'Temperature table', kind: 'matrix',
    columns: [{ id: 'c2', semanticKey: 'spec.temperature.column', label: 'Value', valueType: 'number', order: 0 }],
    rows: [{ id: 'r2', semanticKey: 'spec.temperature.row', order: 0 }], cells: {}, order: 1
  });
  workbook = setDatasetCell(workbook, 'ds-m1', { rowId: 'r1', columnId: 'c1', datumId: 'd1' });
  workbook = setDatasetCell(workbook, 'ds-m2', { rowId: 'r2', columnId: 'c2', datumId: 'd2' });
  workbook = createSavedView(workbook, {
    id: 'v1', name: 'Pressure view', moduleIds: ['m1'], datumKeys: ['spec.pressure.value'], ordering: ['spec.pressure.value']
  }) as ProductWorkbookV2;
  workbook = createSavedView(workbook, {
    id: 'v2', name: 'Mixed view', datumKeys: ['d1', 'spec.temperature.value']
  }) as ProductWorkbookV2;
  return createSavedView(workbook, {
    id: 'v3', name: 'Temperature view', moduleIds: ['m2'], datumKeys: ['spec.temperature.value']
  }) as ProductWorkbookV2;
}

describe('AUD013 — Workbook delete lifecycle integrity', () => {
  it('cascades datum references from every saved view and dataset cell without touching unrelated views', () => {
    const workbook = createLifecycleWorkbook();
    const unrelatedView = workbook.savedViews?.[2];

    const updated = deleteDatum(workbook, 'd1') as ProductWorkbookV2;

    expect(updated.data.d1).toBeUndefined();
    expect(updated.datasets[0].cells[getDatasetCellKey('r1', 'c1')]).toBeUndefined();
    expect(updated.savedViews?.[0]).toMatchObject({ datumKeys: [], ordering: [] });
    expect(updated.savedViews?.[1].datumKeys).toEqual(['spec.temperature.value']);
    expect(updated.savedViews?.[2]).toBe(unrelatedView);
    expect(validateProductWorkbook(updated).valid).toBe(true);
  });

  it('cascades module data, datasets, and associated saved-view references while preserving siblings', () => {
    const workbook = createLifecycleWorkbook();
    const siblingDataset = workbook.datasets[1];
    const siblingView = workbook.savedViews?.[2];

    const updated = removeModule(workbook, 'm1') as ProductWorkbookV2;

    expect(updated.modules.map((module) => module.id)).toEqual(['m2']);
    expect(updated.data).not.toHaveProperty('d1');
    expect(updated.datasets.map((dataset) => dataset.id)).toEqual(['ds-m2']);
    expect(updated.datasets[0]).toBe(siblingDataset);
    expect(updated.savedViews?.[0]).toMatchObject({ moduleIds: [], datumKeys: [], ordering: [] });
    expect(updated.savedViews?.[1].datumKeys).toEqual(['spec.temperature.value']);
    expect(updated.savedViews?.[2]).toBe(siblingView);
    expect(validateProductWorkbook(updated).valid).toBe(true);
    expect(parseProductWorkbook(JSON.parse(JSON.stringify(updated)))).toEqual(updated);
  });

  it('saves the cascaded workbook and does not resurrect deleted semantic references', async () => {
    const deleted = deleteDatum(createLifecycleWorkbook(), 'd1');
    const rpc = vi.fn().mockResolvedValue({
      data: { ...deleted, revision: deleted.revision + 1 }, error: null
    });
    const repository = new SupabaseProductWorkbookRepository({ rpc } as any);

    const saved = await repository.saveWorkbook({ workbook: deleted, expectedRevision: deleted.revision });

    expect(rpc).toHaveBeenCalledWith('save_product_workbook_v2', expect.objectContaining({ p_workbook: deleted }));
    expect(saved.workbook.savedViews?.flatMap((view) => view.datumKeys)).not.toContain('spec.pressure.value');
    expect(parseProductWorkbook(JSON.parse(JSON.stringify(saved.workbook)))).toEqual(saved.workbook);
  });
});
