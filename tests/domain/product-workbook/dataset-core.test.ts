// tests/domain/product-workbook/dataset-core.test.ts
// Tests for TechnicalDataset CRUD, Column constraints, C9 Validation, and Query Projections.

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  addDataset,
  deleteDatasetRow,
  setDatasetCell,
  clearDatasetCell,
  validateProductWorkbook,
  getDatasetCellKey,
  searchDatasets,
  ProductWorkbookV2,
  TechnicalDataset
} from '../../../src/domain/product-workbook';

describe('TechnicalDataset Core Operations, Invariants & Queries', () => {
  function createBaseWorkbook(): ProductWorkbookV2 {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod_ta25' } });
    wb = addModule(wb, {
      id: 'mod_metrology',
      semanticKey: 'metrology.specs',
      label: 'Especificações',
      kind: 'matrix',
      order: 0
    });
    return ensureWorkbookV2(wb);
  }

  it('adiciona dataset vinculado a módulo válido e valida integridade', () => {
    let wb = createBaseWorkbook();

    const newDataset: TechnicalDataset = {
      id: 'ds_table_1',
      semanticKey: 'metrology.specs.table',
      moduleId: 'mod_metrology',
      label: 'Tabela 1',
      kind: 'matrix',
      columns: [
        { id: 'col_range', semanticKey: 'spec.range', label: 'Faixa', valueType: 'range', order: 0 },
        { id: 'col_acc', semanticKey: 'spec.acc', label: 'Exatidão', valueType: 'text', order: 1 }
      ],
      rows: [
        { id: 'row_p1', semanticKey: 'point.p1', label: 'Ponto 1', order: 0 }
      ],
      cells: {},
      order: 0
    };

    const updatedWorkbook = addDataset(wb, newDataset);
    expect(updatedWorkbook.datasets).toHaveLength(1);
    expect(updatedWorkbook.datasets[0].columns).toHaveLength(2);
    expect(updatedWorkbook.datasets[0].rows).toHaveLength(1);

    const validation = validateProductWorkbook(updatedWorkbook);
    expect(validation.valid).toBe(true);
  });

  it('EMENDA 5: rejeita criação de dataset vinculado a módulo inexistente', () => {
    let wb = createBaseWorkbook();

    const orphanDataset: TechnicalDataset = {
      id: 'ds_orphan',
      semanticKey: 'metrology.specs.orphan',
      moduleId: 'mod_non_existent',
      label: 'Orphan Table',
      kind: 'matrix',
      columns: [],
      rows: [],
      cells: {},
      order: 0
    };

    expect(() => addDataset(wb, orphanDataset)).toThrowError(/Módulo com ID "mod_non_existent"/);
  });

  it('EMENDA 4: valida compatibilidade de tipo e unidade ao atribuir célula', () => {
    let wb = createBaseWorkbook();

    const dataset: TechnicalDataset = {
      id: 'ds_table_types',
      semanticKey: 'metrology.specs.types',
      moduleId: 'mod_metrology',
      label: 'Tabela Tipos',
      kind: 'matrix',
      columns: [
        { id: 'col_temp', semanticKey: 'spec.temp', label: 'Temperatura', valueType: 'quantity', unit: 'celsius', order: 0 },
        { id: 'col_notes', semanticKey: 'spec.notes', label: 'Notas', valueType: 'text', order: 1 }
      ],
      rows: [
        { id: 'row_p1', semanticKey: 'point.p1', label: 'Ponto 1', order: 0 }
      ],
      cells: {},
      order: 0
    };

    let wbWithDs = addDataset(wb, dataset);

    // Adiciona datum correto (quantity, celsius)
    let wbWithData = addDatum(wbWithDs, {
      semanticKey: 'spec.temp.p1',
      moduleId: 'mod_metrology',
      label: 'Temp P1',
      value: { type: 'quantity', amount: 50, unit: 'celsius' },
      evidence: [],
      status: 'verified'
    }, 'dtm_temp_ok') as ProductWorkbookV2;

    // Adiciona datum com unidade incompatível (quantity, bar)
    wbWithData = addDatum(wbWithData, {
      semanticKey: 'spec.temp.bar',
      moduleId: 'mod_metrology',
      label: 'Temp Errada',
      value: { type: 'quantity', amount: 10, unit: 'bar' },
      evidence: [],
      status: 'verified'
    }, 'dtm_temp_wrong_unit') as ProductWorkbookV2;

    // Adiciona datum com tipo incompatível (text)
    wbWithData = addDatum(wbWithData, {
      semanticKey: 'spec.temp.text',
      moduleId: 'mod_metrology',
      label: 'Temp Texto',
      value: { type: 'text', value: '50 °C' },
      evidence: [],
      status: 'verified'
    }, 'dtm_temp_wrong_type') as ProductWorkbookV2;

    // Caso 1: Sucesso ao atribuir valor compatível
    const wbSuccess = setDatasetCell(wbWithData, 'ds_table_types', {
      rowId: 'row_p1',
      columnId: 'col_temp',
      datumId: 'dtm_temp_ok'
    });
    const cellKey = getDatasetCellKey('row_p1', 'col_temp');
    expect(wbSuccess.datasets[0].cells[cellKey].datumId).toBe('dtm_temp_ok');

    // Caso 2: Falha ao tentar associar tipo incompatível
    expect(() =>
      setDatasetCell(wbWithData, 'ds_table_types', {
        rowId: 'row_p1',
        columnId: 'col_temp',
        datumId: 'dtm_temp_wrong_type'
      })
    ).toThrowError(/TYPE_MISMATCH/);

    // Caso 3: Falha ao tentar associar unidade incompatível
    expect(() =>
      setDatasetCell(wbWithData, 'ds_table_types', {
        rowId: 'row_p1',
        columnId: 'col_temp',
        datumId: 'dtm_temp_wrong_unit'
      })
    ).toThrowError(/UNIT_MISMATCH/);
  });

  it('permite limpar célula e deletar colunas/linhas com limpeza em cascata das células', () => {
    let wb = createBaseWorkbook();

    const dataset: TechnicalDataset = {
      id: 'ds_table_cascade',
      semanticKey: 'metrology.specs.cascade',
      moduleId: 'mod_metrology',
      label: 'Tabela Cascata',
      kind: 'matrix',
      columns: [
        { id: 'col_acc', semanticKey: 'spec.acc', label: 'Exatidão', valueType: 'text', order: 0 }
      ],
      rows: [
        { id: 'row_p1', semanticKey: 'point.p1', label: 'Ponto 1', order: 0 }
      ],
      cells: {},
      order: 0
    };

    let wbWithDs = addDataset(wb, dataset);

    let wbWithData = addDatum(wbWithDs, {
      semanticKey: 'spec.acc.p1',
      moduleId: 'mod_metrology',
      label: 'Acc P1',
      value: { type: 'text', value: '±0.05' },
      evidence: [],
      status: 'verified'
    }, 'dtm_acc_1') as ProductWorkbookV2;

    wbWithData = setDatasetCell(wbWithData, 'ds_table_cascade', {
      rowId: 'row_p1',
      columnId: 'col_acc',
      datumId: 'dtm_acc_1'
    });

    const cellKey = getDatasetCellKey('row_p1', 'col_acc');
    expect(wbWithData.datasets[0].cells[cellKey]).toBeDefined();

    // Limpa célula
    const wbCleared = clearDatasetCell(wbWithData, 'ds_table_cascade', 'row_p1', 'col_acc');
    expect(wbCleared.datasets[0].cells[cellKey]).toBeUndefined();

    // Reatribui e deleta linha: célula deve ser limpa em cascata
    const wbReassigned = setDatasetCell(wbWithData, 'ds_table_cascade', {
      rowId: 'row_p1',
      columnId: 'col_acc',
      datumId: 'dtm_acc_1'
    });
    const wbDeletedRow = deleteDatasetRow(wbReassigned, 'ds_table_cascade', 'row_p1');
    expect(wbDeletedRow.datasets[0].rows).toHaveLength(0);
    expect(wbDeletedRow.datasets[0].cells[cellKey]).toBeUndefined();
  });

  it('EMENDA 8: searchDatasets projeta dados sem duplicar autoridade de valores', () => {
    let wb = createBaseWorkbook();

    const dataset: TechnicalDataset = {
      id: 'ds_search_test',
      semanticKey: 'metrology.specs.matrix',
      moduleId: 'mod_metrology',
      label: 'Matriz Metrológica',
      kind: 'matrix',
      columns: [
        { id: 'col_acc', semanticKey: 'spec.acc', label: 'Exatidão Calibrada', valueType: 'text', order: 0 }
      ],
      rows: [
        { id: 'row_p50c', semanticKey: 'point.p50c', label: '50 °C', order: 0 }
      ],
      cells: {},
      order: 0
    };

    let wbWithDs = addDataset(wb, dataset);

    let wbWithData = addDatum(wbWithDs, {
      semanticKey: 'spec.acc.p50c',
      moduleId: 'mod_metrology',
      label: 'Alta Exatidão',
      value: { type: 'text', value: '±0.02 °C' },
      evidence: [],
      status: 'verified'
    }, 'dtm_acc_high') as ProductWorkbookV2;

    wbWithData = setDatasetCell(wbWithData, 'ds_search_test', {
      rowId: 'row_p50c',
      columnId: 'col_acc',
      datumId: 'dtm_acc_high'
    });

    // Projeta busca por "Calibrada" (match na coluna)
    const results = searchDatasets(wbWithData, 'Calibrada');
    expect(results).toHaveLength(1);
    expect(results[0].datasetId).toBe('ds_search_test');
    expect(results[0].columnLabel).toBe('Exatidão Calibrada');
    expect(results[0].matchField).toBe('column');

    // Projeta busca por "±0.02" (match no valor da célula)
    const cellResults = searchDatasets(wbWithData, '0.02');
    expect(cellResults).toHaveLength(1);
    expect(cellResults[0].datasetId).toBe('ds_search_test');
    expect(cellResults[0].datumId).toBe('dtm_acc_high');
    expect(cellResults[0].matchField).toBe('cell_value');
  });
});
