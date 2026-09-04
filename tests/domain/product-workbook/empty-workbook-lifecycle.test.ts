// tests/domain/product-workbook/empty-workbook-lifecycle.test.ts
// Teste do fluxo completo de resolução do dead-end de workbook vazio (PIM.PRODUCTION.CORE1.1).
// Fluxo: Workbook Vazio -> Criar Módulo -> Criar Datum -> Criar Dataset -> Preencher Célula -> Validar C9.

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  addDataset,
  addDatasetColumn,
  addDatasetRow,
  setDatasetCell,
  validateProductWorkbook
} from '../../../src/domain/product-workbook';
import { MODULE_STRUCTURE_TEMPLATES } from '../../../src/components/library/product-workspace/NewModuleModal';

describe('PIM Core V1.1 — Empty Workbook Lifecycle & First Module Creation', () => {
  it('EMPTY-FLOW-1: Inicialização limpa e criação do primeiro módulo a partir de templates estruturais', () => {
    // 1. Workbook Vazio Canônico
    const baseWb = createWorkbook({
      owner: { kind: 'product', id: '11111111-1111-4111-8111-111111111111' },
      revision: 0
    });
    const emptyWb = ensureWorkbookV2(baseWb);

    expect(emptyWb.modules.length).toBe(0);
    expect(Object.keys(emptyWb.data).length).toBe(0);
    expect(emptyWb.datasets.length).toBe(0);

    // 2. Criar primeiro módulo a partir do template estrutural de Metrologia (Zero Fatos)
    const tmpl = MODULE_STRUCTURE_TEMPLATES[0]; // Especificações Metrológicas
    const wbWithModule = addModule(emptyWb, {
      id: 'mod_metrology',
      semanticKey: tmpl.semanticKey,
      label: tmpl.label,
      kind: tmpl.kind,
      order: 0
    });

    expect(wbWithModule.modules.length).toBe(1);
    expect(wbWithModule.modules[0].id).toBe('mod_metrology');
    expect(wbWithModule.modules[0].semanticKey).toBe('metrology.specs');

    // 3. Criar primeiro dado técnico no módulo recém-criado
    const wbWithDatum = addDatum(wbWithModule, {
      moduleId: 'mod_metrology',
      semanticKey: 'metrology.specs.accuracy',
      label: 'Exatidão a 50 °C',
      value: { type: 'number', value: 0.05 },
      evidence: [],
      status: 'draft'
    }, 'dat_acc_50c');

    expect(wbWithDatum.data['dat_acc_50c']).toBeDefined();
    expect(wbWithDatum.modules[0].datumIds).toContain('dat_acc_50c');

    // 4. Criar primeiro dataset vinculado ao módulo
    const wbWithDataset = addDataset(wbWithDatum, {
      id: 'ds_metrology_table',
      semanticKey: 'metrology.tables.specs',
      moduleId: 'mod_metrology',
      label: 'Tabela de Exatidão Térmica',
      kind: 'matrix',
      columns: [],
      rows: [],
      cells: {},
      order: 0
    });

    expect(wbWithDataset.datasets.length).toBe(1);
    expect(wbWithDataset.datasets[0].id).toBe('ds_metrology_table');

    // 5. Adicionar coluna e linha na grade
    const wbWithCol = addDatasetColumn(wbWithDataset, 'ds_metrology_table', {
      id: 'col_accuracy',
      semanticKey: 'metrology.col.acc',
      label: 'Exatidão Metrológica',
      valueType: 'number',
      unit: '°C',
      order: 0
    });

    const wbWithRow = addDatasetRow(wbWithCol, 'ds_metrology_table', {
      id: 'row_faixa_50',
      semanticKey: 'metrology.row.faixa50',
      label: 'Ponto 50 °C',
      order: 0
    });

    // 6. Preencher célula referenciando o datum criado
    const finalWb = setDatasetCell(
      wbWithRow,
      'ds_metrology_table',
      {
        rowId: 'row_faixa_50',
        columnId: 'col_accuracy',
        datumId: 'dat_acc_50c'
      }
    );

    // 7. Validação de Invariantes C9: workbook final 100% válido
    const validation = validateProductWorkbook(finalWb);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });
});
