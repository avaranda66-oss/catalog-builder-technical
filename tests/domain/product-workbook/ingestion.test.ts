// tests/domain/product-workbook/ingestion.test.ts
// Tests for Assisted PDF & Source Document Ingestion Review Queue (EMENDA 13).
// Validates invariant: Zero Automatic Approval of extracted candidates.

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  createExtractionJob,
  approveDatumCandidate,
  rejectDatumCandidate,
  approveDatasetCandidate,
  ExtractedDatumCandidate,
  ExtractedDatasetCandidate,
  ProductWorkbookV2
} from '../../../src/domain/product-workbook';

describe('Assisted PDF & Document Ingestion Review Queue (EMENDA 13)', () => {
  function createBaseWorkbook(): ProductWorkbookV2 {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod_ta25' } });
    wb = addModule(wb, {
      id: 'mod_metrology',
      semanticKey: 'metrology.specs',
      label: 'Especificações Metrológicas',
      kind: 'matrix',
      order: 0
    });
    return ensureWorkbookV2(wb);
  }

  it('cria job de extração e gerencia ciclo de vida do candidato', () => {
    const job = createExtractionJob({
      sourceDocumentId: 'doc_datasheet_pdf',
      metadata: { filename: 'Manual_TA25_Rev4.pdf' }
    });

    expect(job.status).toBe('queued');
    expect(job.sourceDocumentId).toBe('doc_datasheet_pdf');

    const candidate: ExtractedDatumCandidate = {
      id: 'cand_1',
      jobId: job.id,
      sourceDocumentId: 'doc_datasheet_pdf',
      suggestedSemanticKey: 'metrology.specs.accuracy',
      suggestedLabel: 'Exatidão Calibrada',
      suggestedValue: { type: 'text', value: '±0.05 °C' },
      confidence: 0.94,
      page: 12,
      section: 'Tabela 3.1',
      status: 'pending_review'
    };

    // Rejeição humana explícita
    const rejected = rejectDatumCandidate({
      candidate,
      rejectionReason: 'Valor refere-se ao modelo TA-35, não TA-25',
      reviewerId: 'engineer_eng1'
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toContain('TA-35');
    expect(rejected.reviewedBy).toBe('engineer_eng1');
  });

  it('aprovação humana promove candidato a TechnicalDatum com evidência estrita vinculada', () => {
    const wb = createBaseWorkbook();

    const candidate: ExtractedDatumCandidate = {
      id: 'cand_temp_range',
      jobId: 'job_123',
      sourceDocumentId: 'doc_datasheet_pdf',
      suggestedSemanticKey: 'metrology.specs.range',
      suggestedLabel: 'Faixa de Temperatura',
      suggestedValue: {
        type: 'range',
        lower: -25,
        upper: 140,
        unit: '°C'
      },
      confidence: 0.98,
      page: 4,
      section: 'Seção 2',
      locator: 'Página 4, Parágrafo 3',
      excerpt: 'Faixa de operação de -25 °C a 140 °C em temperatura ambiente de 23 °C',
      status: 'pending_review'
    };

    const { updatedWorkbook, approvedDatum, updatedCandidate } = approveDatumCandidate({
      candidate,
      targetWorkbook: wb,
      targetModuleId: 'mod_metrology',
      reviewerId: 'metrologist_ana'
    });

    // Invariante 1: O candidato foi marcado como approved
    expect(updatedCandidate.status).toBe('approved');

    // Invariante 2: O datum foi criado no targetModule com status verified
    expect(approvedDatum.status).toBe('verified');
    expect(approvedDatum.semanticKey).toBe('metrology.specs.range');
    expect(approvedDatum.moduleId).toBe('mod_metrology');

    // Invariante 3: Evidência completa e auditável foi anexada ao datum
    expect(approvedDatum.evidence).toHaveLength(1);
    expect(approvedDatum.evidence[0].sourceDocumentId).toBe('doc_datasheet_pdf');
    expect(approvedDatum.evidence[0].page).toBe(4);
    expect(approvedDatum.evidence[0].excerpt).toContain('-25 °C a 140 °C');
    expect(approvedDatum.evidence[0].capturedBy).toBe('metrologist_ana');

    // Invariante 4: O workbook foi atualizado
    expect(updatedWorkbook.data[approvedDatum.id]).toBeDefined();
    expect(updatedWorkbook.modules[0].datumIds).toContain(approvedDatum.id);
  });

  it('aprovação de ExtractedDatasetCandidate cria TechnicalDataset e datums com evidências', () => {
    const wb = createBaseWorkbook();

    const datasetCandidate: ExtractedDatasetCandidate = {
      id: 'cand_ds_table',
      jobId: 'job_456',
      sourceDocumentId: 'doc_datasheet_pdf',
      suggestedKind: 'matrix',
      suggestedLabel: 'Tabela de Estabilidade',
      suggestedSemanticKey: 'metrology.specs.stability',
      columns: [
        { semanticKey: 'spec.stability.val', label: 'Estabilidade', valueType: 'text' }
      ],
      rows: [
        { semanticKey: 'point.p50c', label: '50 °C' }
      ],
      cells: [
        {
          rowIdx: 0,
          colIdx: 0,
          value: { type: 'text', value: '±0.01 °C' },
          excerpt: 'Estabilidade de ±0.01 °C a 50 °C'
        }
      ],
      confidence: 0.91,
      status: 'pending_review'
    };

    const { updatedWorkbook, approvedDataset } = approveDatasetCandidate({
      candidate: datasetCandidate,
      targetWorkbook: wb,
      targetModuleId: 'mod_metrology',
      reviewerId: 'metrologist_ana'
    });

    expect(approvedDataset.columns).toHaveLength(1);
    expect(approvedDataset.rows).toHaveLength(1);
    expect(Object.keys(approvedDataset.cells)).toHaveLength(1);

    const cell = Object.values(approvedDataset.cells)[0];
    const createdDatum = updatedWorkbook.data[cell.datumId];
    expect(createdDatum).toBeDefined();
    expect(createdDatum.status).toBe('verified');
    expect(createdDatum.evidence).toHaveLength(1);
    expect(createdDatum.evidence[0].sourceDocumentId).toBe('doc_datasheet_pdf');
  });
});
