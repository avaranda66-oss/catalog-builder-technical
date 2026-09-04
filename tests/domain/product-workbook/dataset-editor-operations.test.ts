// tests/domain/product-workbook/dataset-editor-operations.test.ts
// Tests for Technical Dataset Editor operations: empty creation, column/row add/reorder/delete,
// typed cell datum mapping and cross-product copy/clone. (PIM.PRODUCTION.CORE1.1 - Items 7 & 8).

import { describe, it, expect } from 'vitest';
import {
  ProductWorkbookV2,
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDataset,
  addDatasetColumn,
  addDatasetRow,
  reorderDatasetColumns,
  reorderDatasetRows,
  setDatasetCell,
  clearDatasetCell,
  addDatum,
  updateDatumValue,
  getDatasetCellKey,
  copyDatasetStructure,
  cloneDataset,
  validateProductWorkbook
} from '../../../src/domain/product-workbook';

function createBaseWb(id: string, prodId: string): ProductWorkbookV2 {
  const base = createWorkbook({
    id,
    owner: { kind: 'product', id: prodId }
  });
  const v2 = ensureWorkbookV2(base);
  return addModule(v2, {
    id: 'mod_metrology',
    semanticKey: 'metrology.specs',
    label: 'Metrologia',
    kind: 'matrix',
    order: 0
  }) as ProductWorkbookV2;
}

describe('Items 7 & 8 — Technical Dataset Editor & Reordering & Cross-Product Operations', () => {
  it('ITEM 7.1: Criação de tabela vazia, adição e reordenação de colunas e linhas', () => {
    let wb = createBaseWb('wb_1', 'prod_1');

    // 1. Cria dataset vazio
    wb = addDataset(wb, {
      id: 'ds_calib',
      semanticKey: 'metrology.calibration',
      moduleId: 'mod_metrology',
      label: 'Calibração Térmica',
      kind: 'matrix',
      columns: [],
      rows: [],
      cells: {},
      order: 0
    });

    expect(wb.datasets).toHaveLength(1);
    expect(wb.datasets[0].columns).toHaveLength(0);
    expect(wb.datasets[0].rows).toHaveLength(0);

    // 2. Adiciona colunas
    wb = addDatasetColumn(wb, 'ds_calib', {
      id: 'col_ponto',
      semanticKey: 'col.ponto',
      label: 'Ponto',
      valueType: 'number',
      unit: '°C',
      order: 0
    });

    wb = addDatasetColumn(wb, 'ds_calib', {
      id: 'col_incerteza',
      semanticKey: 'col.incerteza',
      label: 'Incerteza',
      valueType: 'number',
      unit: '°C',
      order: 1
    });

    wb = addDatasetColumn(wb, 'ds_calib', {
      id: 'col_status',
      semanticKey: 'col.status',
      label: 'Status',
      valueType: 'text',
      order: 2
    });

    expect(wb.datasets[0].columns).toHaveLength(3);
    expect(wb.datasets[0].columns[0].id).toBe('col_ponto');
    expect(wb.datasets[0].columns[1].id).toBe('col_incerteza');

    // 3. Reordena colunas: inverte primeira e segunda
    wb = reorderDatasetColumns(wb, 'ds_calib', ['col_incerteza', 'col_ponto', 'col_status']);
    expect(wb.datasets[0].columns[0].id).toBe('col_incerteza');
    expect(wb.datasets[0].columns[1].id).toBe('col_ponto');

    // 4. Adiciona linhas
    wb = addDatasetRow(wb, 'ds_calib', {
      id: 'row_1',
      semanticKey: 'row.pt1',
      label: 'Ponto 50 °C',
      order: 0
    });

    wb = addDatasetRow(wb, 'ds_calib', {
      id: 'row_2',
      semanticKey: 'row.pt2',
      label: 'Ponto 100 °C',
      order: 1
    });

    expect(wb.datasets[0].rows).toHaveLength(2);

    // 5. Reordena linhas
    wb = reorderDatasetRows(wb, 'ds_calib', ['row_2', 'row_1']);
    expect(wb.datasets[0].rows[0].id).toBe('row_2');
    expect(wb.datasets[0].rows[1].id).toBe('row_1');
  });

  it('ITEM 7.2: Edição tipada de célula gerando TechnicalDatum no mapa data e referenciado por DatasetCell', () => {
    let wb = createBaseWb('wb_cell', 'prod_cell');
    wb = addDataset(wb, {
      id: 'ds_test',
      semanticKey: 'metrology.test',
      moduleId: 'mod_metrology',
      label: 'Tabela Teste',
      kind: 'matrix',
      columns: [
        { id: 'col_val', semanticKey: 'col.val', label: 'Valor', valueType: 'number', unit: '°C', order: 0 }
      ],
      rows: [
        { id: 'row_r1', semanticKey: 'row.r1', label: 'Linha 1', order: 0 }
      ],
      cells: {},
      order: 0
    });

    // Célula inicialmente vazia
    const cellKey = getDatasetCellKey('row_r1', 'col_val');
    expect(wb.datasets[0].cells[cellKey]).toBeUndefined();

    // Preenche célula criando TechnicalDatum
    const datumId = 'dtm_r1_c1';
    wb = addDatum(
      wb,
      {
        semanticKey: 'metrology.test.r1.val',
        moduleId: 'mod_metrology',
        label: 'Linha 1 — Valor',
        value: { type: 'number', value: 50.5 },
        evidence: [],
        status: 'draft',
        audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
      },
      datumId
    ) as ProductWorkbookV2;

    wb = setDatasetCell(wb, 'ds_test', {
      rowId: 'row_r1',
      columnId: 'col_val',
      datumId
    });

    // Invariante 1: Célula referencia datumId
    expect(wb.datasets[0].cells[cellKey]).toBeDefined();
    expect(wb.datasets[0].cells[cellKey].datumId).toBe(datumId);
    expect(wb.data[datumId].value).toEqual({ type: 'number', value: 50.5 });

    // Invariante 2: Atualiza valor da célula via updateDatumValue
    wb = updateDatumValue(wb, datumId, { type: 'number', value: 51.2 }) as ProductWorkbookV2;
    expect(wb.data[datumId].value).toEqual({ type: 'number', value: 51.2 });

    // Invariante 3: Limpa célula
    wb = clearDatasetCell(wb, 'ds_test', 'row_r1', 'col_val');
    expect(wb.datasets[0].cells[cellKey]).toBeUndefined();

    // Invariante 4: Validação do workbook continua válida
    const val = validateProductWorkbook(wb);
    expect(val.valid).toBe(true);
  });

  it('ITEM 8: Cross-Product Copy Structure e Clone Independent entre dois workbooks isolados', () => {
    let sourceWb = createBaseWb('wb_src', 'prod_source_ta25');
    let targetWb = createBaseWb('wb_tgt', 'prod_target_ta35');

    // Adiciona tabela no source com 1 célula preenchida
    sourceWb = addDataset(sourceWb, {
      id: 'ds_src',
      semanticKey: 'metrology.stability',
      moduleId: 'mod_metrology',
      label: 'Estabilidade Térmica',
      kind: 'matrix',
      columns: [
        { id: 'c1', semanticKey: 'col.stab', label: 'Estabilidade', valueType: 'number', unit: '°C', order: 0 }
      ],
      rows: [
        { id: 'r1', semanticKey: 'row.pt', label: 'Ponto 100 °C', order: 0 }
      ],
      cells: {},
      order: 0
    });

    const datumSrcId = 'dtm_src_1';
    sourceWb = addDatum(
      sourceWb,
      {
        semanticKey: 'metrology.stability.r1.c1',
        moduleId: 'mod_metrology',
        label: 'Estabilidade a 100 °C',
        value: { type: 'number', value: 0.02 },
        evidence: [],
        status: 'verified',
        audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
      },
      datumSrcId
    ) as ProductWorkbookV2;

    sourceWb = setDatasetCell(sourceWb, 'ds_src', {
      rowId: 'r1',
      columnId: 'c1',
      datumId: datumSrcId
    });

    // 1. COPY STRUCTURE para target
    const { updatedWorkbook: copiedTarget, createdDataset: copiedDs } = copyDatasetStructure({
      sourceDataset: sourceWb.datasets[0],
      targetWorkbook: targetWb,
      targetModuleId: targetWb.modules[0].id,
      options: {
        newSemanticKey: 'metrology.stability.target',
        newLabel: 'Estabilidade Térmica TA-35'
      }
    });

    // Invariante: Células do destino são estritamente vazias (zero valores copiados)
    expect(Object.keys(copiedDs.cells)).toHaveLength(0);
    expect(Object.keys(copiedTarget.data)).toHaveLength(0);
    expect(copiedDs.columns).toHaveLength(1);
    expect(copiedDs.rows).toHaveLength(1);

    // 2. CLONE INDEPENDENT para target
    const { updatedWorkbook: clonedTarget, createdDataset: clonedDs } = cloneDataset({
      sourceDataset: sourceWb.datasets[0],
      sourceWorkbook: sourceWb,
      targetWorkbook: targetWb,
      targetModuleId: targetWb.modules[0].id,
      options: {
        newSemanticKey: 'metrology.stability.cloned',
        newLabel: 'Estabilidade Térmica Clonada',
        preserveEvidence: false
      }
    });

    // Invariante: Tabela clonada possui células preenchidas com NOVOS datum IDs independentes
    expect(Object.keys(clonedDs.cells)).toHaveLength(1);
    const clonedCell = Object.values(clonedDs.cells)[0];
    expect(clonedCell.datumId).not.toBe(datumSrcId); // ID totalmente independente!
    expect(clonedTarget.data[clonedCell.datumId]).toBeDefined();
    expect(clonedTarget.data[clonedCell.datumId].status).toBe('draft'); // draft por default
    expect(clonedTarget.data[clonedCell.datumId].value).toEqual({ type: 'number', value: 0.02 });
  });
});
