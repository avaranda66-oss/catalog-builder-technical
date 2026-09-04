// tests/domain/product-workbook/ingestion-fail-closed.test.ts
// Tests for Ingestion Fail-Closed validations (PIM.PRODUCTION.CORE1.1 - Item 11).

import { describe, it, expect } from 'vitest';
import {
  ProductWorkbookV2,
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  ExtractedDatumCandidate,
  ExtractedDatasetCandidate,
  approveDatumCandidate,
  approveDatasetCandidate,
  ProductWorkbookError
} from '../../../src/domain/product-workbook';

function createTestWorkbook(): ProductWorkbookV2 {
  const base = createWorkbook({
    owner: { kind: 'product', id: 'prod_test_ingestion' }
  });
  const v2 = ensureWorkbookV2(base);
  return addModule(v2, {
    id: 'mod_metrology',
    semanticKey: 'metrology.specs',
    label: 'Especificações Metrológicas',
    kind: 'matrix',
    order: 0
  }) as ProductWorkbookV2;
}

describe('Item 11 — Ingestion Fail-Closed Validations', () => {
  const validDatasetCandidate: ExtractedDatasetCandidate = {
    id: 'cand_ds_1',
    jobId: 'job_123',
    sourceDocumentId: 'doc_manual_ta500',
    suggestedKind: 'matrix',
    suggestedLabel: 'Tabela de Exatidão',
    suggestedSemanticKey: 'metrology.accuracy_table',
    columns: [
      { semanticKey: 'col.range', label: 'Faixa', valueType: 'range' },
      { semanticKey: 'col.accuracy', label: 'Exatidão', valueType: 'number', unit: '°C' }
    ],
    rows: [
      { semanticKey: 'row.p1', label: 'Ponto 50 °C' },
      { semanticKey: 'row.p2', label: 'Ponto 100 °C' }
    ],
    cells: [
      {
        rowIdx: 0,
        colIdx: 1,
        value: { type: 'number', value: 0.05 },
        excerpt: 'Incerteza a 50C: 0.05 C'
      }
    ],
    confidence: 0.95,
    status: 'pending_review'
  };

  it('FAIL-CLOSED 1: rowIdx fora dos limites deve lançar INVALID_CELL_COORDINATE e não gerar dataset parcial', () => {
    const wb = createTestWorkbook();
    const invalidCand: ExtractedDatasetCandidate = {
      ...validDatasetCandidate,
      cells: [
        {
          rowIdx: 99, // Inválido! Apenas 2 linhas (0 e 1)
          colIdx: 0,
          value: { type: 'range', lower: 0, upper: 100, unit: '°C' }
        }
      ]
    };

    expect(() =>
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      })
    ).toThrow(ProductWorkbookError);

    try {
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      });
    } catch (err: any) {
      expect(err.code).toBe('INVALID_CELL_COORDINATE');
    }

    // Zero dataset parcial adicionado
    expect(wb.datasets).toHaveLength(0);
    expect(Object.keys(wb.data)).toHaveLength(0);
  });

  it('FAIL-CLOSED 2: colIdx fora dos limites deve lançar INVALID_CELL_COORDINATE', () => {
    const wb = createTestWorkbook();
    const invalidCand: ExtractedDatasetCandidate = {
      ...validDatasetCandidate,
      cells: [
        {
          rowIdx: 0,
          colIdx: 5, // Inválido! Apenas 2 colunas (0 e 1)
          value: { type: 'number', value: 10 }
        }
      ]
    };

    expect(() =>
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      })
    ).toThrow(ProductWorkbookError);

    try {
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      });
    } catch (err: any) {
      expect(err.code).toBe('INVALID_CELL_COORDINATE');
    }
  });

  it('FAIL-CLOSED 3: incompatibilidade de tipo (column.valueType vs cell.value.type) deve lançar TYPE_MISMATCH', () => {
    const wb = createTestWorkbook();
    const invalidCand: ExtractedDatasetCandidate = {
      ...validDatasetCandidate,
      cells: [
        {
          rowIdx: 0,
          colIdx: 1, // Coluna espera 'number'
          value: { type: 'text', value: '±0.05 °C' } // Inválido! Enviou 'text'
        }
      ]
    };

    expect(() =>
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      })
    ).toThrow(ProductWorkbookError);

    try {
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      });
    } catch (err: any) {
      expect(err.code).toBe('TYPE_MISMATCH');
    }
  });

  it('FAIL-CLOSED 4: incompatibilidade de unidade com coluna deve lançar UNIT_MISMATCH', () => {
    const wb = createTestWorkbook();
    const invalidCand: ExtractedDatasetCandidate = {
      ...validDatasetCandidate,
      cells: [
        {
          rowIdx: 0,
          colIdx: 0, // Coluna de range
          value: { type: 'range', lower: 0, upper: 100, unit: 'bar' } // Conflito de range
        }
      ],
      columns: [
        { semanticKey: 'col.range', label: 'Faixa', valueType: 'range', unit: '°C' },
        { semanticKey: 'col.accuracy', label: 'Exatidão', valueType: 'number', unit: '°C' }
      ]
    };

    expect(() =>
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      })
    ).toThrow(ProductWorkbookError);

    try {
      approveDatasetCandidate({
        candidate: invalidCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology'
      });
    } catch (err: any) {
      expect(err.code).toBe('UNIT_MISMATCH');
    }
  });

  it('FAIL-CLOSED 5: sourceDocumentId não autorizado no contexto de aprovação do dataset deve lançar UNAUTHORIZED_SOURCE_DOCUMENT', () => {
    const wb = createTestWorkbook();

    expect(() =>
      approveDatasetCandidate({
        candidate: validDatasetCandidate, // Usa 'doc_manual_ta500'
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology',
        authorizedSourceDocumentIds: ['doc_folha_dados_outra'] // Não autoriza doc_manual_ta500
      })
    ).toThrow(ProductWorkbookError);

    try {
      approveDatasetCandidate({
        candidate: validDatasetCandidate,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology',
        authorizedSourceDocumentIds: ['doc_folha_dados_outra']
      });
    } catch (err: any) {
      expect(err.code).toBe('UNAUTHORIZED_SOURCE_DOCUMENT');
    }
  });

  it('FAIL-CLOSED 6: sourceDocumentId não autorizado no contexto de aprovação de datum deve lançar UNAUTHORIZED_SOURCE_DOCUMENT', () => {
    const wb = createTestWorkbook();
    const datumCand: ExtractedDatumCandidate = {
      id: 'cand_dtm_1',
      jobId: 'job_456',
      sourceDocumentId: 'doc_nao_autorizado',
      suggestedSemanticKey: 'metrology.specs.single_fact',
      suggestedLabel: 'Fator de Calibração',
      suggestedValue: { type: 'number', value: 1.002 },
      confidence: 0.9,
      status: 'pending_review'
    };

    expect(() =>
      approveDatumCandidate({
        candidate: datumCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology',
        authorizedSourceDocumentIds: ['doc_oficial_1', 'doc_oficial_2']
      })
    ).toThrow(ProductWorkbookError);

    try {
      approveDatumCandidate({
        candidate: datumCand,
        targetWorkbook: wb,
        targetModuleId: 'mod_metrology',
        authorizedSourceDocumentIds: ['doc_oficial_1', 'doc_oficial_2']
      });
    } catch (err: any) {
      expect(err.code).toBe('UNAUTHORIZED_SOURCE_DOCUMENT');
    }
  });

  it('HAPPY PATH: aprovação com todos os invariantes válidos promove dataset e cria datums consistentes', () => {
    const wb = createTestWorkbook();
    const { updatedWorkbook, approvedDataset, updatedCandidate } = approveDatasetCandidate({
      candidate: validDatasetCandidate,
      targetWorkbook: wb,
      targetModuleId: 'mod_metrology',
      authorizedSourceDocumentIds: ['doc_manual_ta500']
    });

    expect(updatedCandidate.status).toBe('approved');
    expect(updatedWorkbook.datasets).toHaveLength(1);
    expect(approvedDataset.columns).toHaveLength(2);
    expect(approvedDataset.rows).toHaveLength(2);

    const cellKeys = Object.keys(approvedDataset.cells);
    expect(cellKeys).toHaveLength(1);
    const cell = approvedDataset.cells[cellKeys[0]];
    const datum = updatedWorkbook.data[cell.datumId];

    expect(datum).toBeDefined();
    expect(datum.value).toEqual({ type: 'number', value: 0.05 });
    expect(datum.evidence).toHaveLength(1);
    expect(datum.evidence[0].sourceDocumentId).toBe('doc_manual_ta500');
    expect(datum.status).toBe('verified');
  });
});
