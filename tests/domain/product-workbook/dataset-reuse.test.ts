// tests/domain/product-workbook/dataset-reuse.test.ts
// Tests for Technical Dataset Reuse, Cloning, Templates, and Family Inheritance (PIM.REUSE1).
// Validates all 8 mandatory invariants specified in EMENDA ADICIONAL — PIM.REUSE1.

import { describe, it, expect } from 'vitest';
import {
  ProductWorkbookV2,
  TechnicalDataset,
  TechnicalModule,
  TechnicalDatum,
  createWorkbook,
  ensureWorkbookV2,
  copyDatasetStructure,
  cloneDataset,
  instantiateDatasetFromTemplate,
  CANONICAL_DATASET_TEMPLATES,
  resolveEffectiveProductKnowledge,
  getDatasetCellKey,
  parseDatasetCellKey
} from '../../../src/domain/product-workbook';

function createMockV2ProductWorkbook(id: string, productId: string): ProductWorkbookV2 {
  const base = createWorkbook({
    id,
    owner: { kind: 'product', id: productId }
  });
  return ensureWorkbookV2(base);
}

function createMockV2FamilyWorkbook(id: string, familyId: string): ProductWorkbookV2 {
  const base = createWorkbook({
    id,
    owner: { kind: 'family', id: familyId }
  });
  return ensureWorkbookV2(base);
}

describe('PIM.REUSE1 — Technical Dataset Reuse, Cloning & Inheritance', () => {
  // Setup common fixture
  const sourceModule: TechnicalModule = {
    id: 'mod_metrology',
    semanticKey: 'metrology.specs',
    label: 'Especificações Metrológicas',
    kind: 'matrix',
    order: 0,
    datumIds: []
  };

  const targetModule: TechnicalModule = {
    id: 'mod_target_metrology',
    semanticKey: 'metrology.specs',
    label: 'Especificações Alvo',
    kind: 'matrix',
    order: 0,
    datumIds: []
  };

  const sampleDataset: TechnicalDataset = {
    id: 'ds_metrology_01',
    semanticKey: 'metrology.specs.table',
    moduleId: 'mod_metrology',
    label: 'Tabela de Exatidão',
    description: 'Faixas e exatidão calibrada',
    kind: 'matrix',
    columns: [
      { id: 'col_range', semanticKey: 'spec.range', label: 'Faixa', valueType: 'range', order: 0 },
      { id: 'col_acc', semanticKey: 'spec.accuracy', label: 'Exatidão', valueType: 'text', order: 1 }
    ],
    rows: [
      { id: 'row_50c', semanticKey: 'temp.50c', label: '50 °C', order: 0 },
      { id: 'row_100c', semanticKey: 'temp.100c', label: '100 °C', order: 1 }
    ],
    cells: {
      [getDatasetCellKey('row_50c', 'col_acc')]: {
        rowId: 'row_50c',
        columnId: 'col_acc',
        datumId: 'dtm_source_50c_acc'
      },
      [getDatasetCellKey('row_100c', 'col_acc')]: {
        rowId: 'row_100c',
        columnId: 'col_acc',
        datumId: 'dtm_source_100c_acc'
      }
    },
    order: 0
  };

  // 1. COPY STRUCTURE CREATES ZERO TECHNICAL VALUES
  it('TESTE 1: copy structure creates zero technical values and zero shared datumIds', () => {
    const targetWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_target', 'prod_target'),
      modules: [targetModule]
    };

    const { updatedWorkbook, createdDataset } = copyDatasetStructure({
      sourceDataset: sampleDataset,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology',
      options: {
        newDatasetId: 'ds_copied_structure'
      }
    });

    // Invariante 1: Novo dataset ID
    expect(createdDataset.id).toBe('ds_copied_structure');
    expect(createdDataset.id).not.toBe(sampleDataset.id);

    // Invariante 2: Novas identidades para colunas e linhas
    expect(createdDataset.columns.map((c) => c.id)).not.toEqual(sampleDataset.columns.map((c) => c.id));
    expect(createdDataset.rows.map((r) => r.id)).not.toEqual(sampleDataset.rows.map((r) => r.id));

    // Invariante 3: Preserva semântica e tipagem
    expect(createdDataset.columns[0].semanticKey).toBe('spec.range');
    expect(createdDataset.columns[0].valueType).toBe('range');

    // Invariante 4: ZERO células copiadas e ZERO valores técnicos
    expect(Object.keys(createdDataset.cells)).toHaveLength(0);
    expect(createdDataset.cells).toEqual({});

    // Invariante 5: Target workbook data permanece vazio (zero datums adicionados)
    expect(Object.keys(updatedWorkbook.data)).toHaveLength(0);
  });

  // 2. CLONE CREATES INDEPENDENT IDS
  it('TESTE 2: clone creates independent IDs for dataset, rows, columns, and datums', () => {
    const sourceWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_source', 'prod_source'),
      modules: [sourceModule],
      datasets: [sampleDataset],
      data: {
        dtm_source_50c_acc: {
          id: 'dtm_source_50c_acc',
          semanticKey: 'metrology.specs.50c_acc',
          moduleId: 'mod_metrology',
          label: 'Exatidão a 50 °C',
          value: { type: 'text', value: '±0.05 °C' },
          evidence: [],
          status: 'verified',
          audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
        },
        dtm_source_100c_acc: {
          id: 'dtm_source_100c_acc',
          semanticKey: 'metrology.specs.100c_acc',
          moduleId: 'mod_metrology',
          label: 'Exatidão a 100 °C',
          value: { type: 'text', value: '±0.08 °C' },
          evidence: [],
          status: 'verified',
          audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
        }
      }
    };

    const targetWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_target', 'prod_target'),
      modules: [targetModule]
    };

    const { updatedWorkbook, createdDataset } = cloneDataset({
      sourceDataset: sampleDataset,
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology',
      options: {
        newDatasetId: 'ds_cloned_independent'
      }
    });

    expect(createdDataset.id).toBe('ds_cloned_independent');
    expect(createdDataset.columns[0].id).not.toBe(sampleDataset.columns[0].id);
    expect(createdDataset.rows[0].id).not.toBe(sampleDataset.rows[0].id);

    // Células existem no clone mas apontam para novos datumIds
    const clonedCells = Object.values(createdDataset.cells);
    expect(clonedCells).toHaveLength(2);

    for (const cell of clonedCells) {
      expect(cell.datumId).not.toBe('dtm_source_50c_acc');
      expect(cell.datumId).not.toBe('dtm_source_100c_acc');
      expect(updatedWorkbook.data[cell.datumId]).toBeDefined();
      expect(updatedWorkbook.data[cell.datumId].moduleId).toBe('mod_target_metrology');
    }
  });

  // 3. EDITING CLONE DOES NOT MUTATE SOURCE
  it('TESTE 3: editing clone does not mutate source', () => {
    const sourceWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_source', 'prod_source'),
      modules: [sourceModule],
      datasets: [sampleDataset],
      data: {
        dtm_source_50c_acc: {
          id: 'dtm_source_50c_acc',
          semanticKey: 'metrology.specs.50c_acc',
          moduleId: 'mod_metrology',
          label: 'Exatidão a 50 °C',
          value: { type: 'text', value: '±0.05 °C' },
          evidence: [],
          status: 'verified',
          audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
        }
      }
    };

    const targetWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_target', 'prod_target'),
      modules: [targetModule]
    };

    const { updatedWorkbook: clonedWbk, createdDataset: clonedDataset } = cloneDataset({
      sourceDataset: sampleDataset,
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology'
    });

    // Modifica célula no clone via operação imutável
    const firstClonedCell = Object.values(clonedDataset.cells)[0];
    const modifiedDatumId = firstClonedCell.datumId;

    const modifiedTargetWbk: ProductWorkbookV2 = {
      ...clonedWbk,
      data: {
        ...clonedWbk.data,
        [modifiedDatumId]: {
          ...clonedWbk.data[modifiedDatumId],
          value: { type: 'text', value: '±0.99 °C (ALTERADO NO CLONE)' }
        }
      }
    };

    // Source continua intacto e inalterado
    expect(sourceWbk.data['dtm_source_50c_acc'].value).toEqual({
      type: 'text',
      value: '±0.05 °C'
    });
    expect(modifiedTargetWbk.data[modifiedDatumId].value).toEqual({
      type: 'text',
      value: '±0.99 °C (ALTERADO NO CLONE)'
    });
  });

  // 4. NO DUPLICATE DATUM AUTHORITY
  it('TESTE 4: no duplicate datum authority: clone creates draft/isolated datums with independent IDs', () => {
    const sourceWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_source', 'prod_source'),
      modules: [sourceModule],
      datasets: [sampleDataset],
      data: {
        dtm_source_50c_acc: {
          id: 'dtm_source_50c_acc',
          semanticKey: 'metrology.specs.50c_acc',
          moduleId: 'mod_metrology',
          label: 'Exatidão a 50 °C',
          value: { type: 'text', value: '±0.05 °C' },
          evidence: [],
          status: 'verified',
          audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
        }
      }
    };

    const targetWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_target', 'prod_target'),
      modules: [targetModule]
    };

    const { updatedWorkbook } = cloneDataset({
      sourceDataset: sampleDataset,
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology',
      options: {
        datumStatusFallback: 'draft'
      }
    });

    const targetDatums = Object.values(updatedWorkbook.data);
    expect(targetDatums.length).toBeGreaterThan(0);
    // Cada novo datum criado no destino está isolado como draft (sem autoridade indevida herdada)
    for (const d of targetDatums) {
      expect(d.status).toBe('draft');
      expect(sourceWbk.data[d.id]).toBeUndefined();
    }
  });

  // 5. INVALID EVIDENCE IS NOT SILENTLY COPIED
  it('TESTE 5: invalid evidence is not silently copied (requires policy & valid source document)', () => {
    const sourceWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_source', 'prod_source'),
      modules: [sourceModule],
      datasets: [sampleDataset],
      data: {
        dtm_source_50c_acc: {
          id: 'dtm_source_50c_acc',
          semanticKey: 'metrology.specs.50c_acc',
          moduleId: 'mod_metrology',
          label: 'Exatidão a 50 °C',
          value: { type: 'text', value: '±0.05 °C' },
          evidence: [
            {
              id: 'ev_datasheet_01',
              sourceDocumentId: 'doc_datasheet_source_only',
              locator: 'Tabela 2, página 4',
              capturedAt: '2026-09-01T00:00:00Z'
            }
          ],
          canonicalDecision: {
            kind: 'selected_evidence',
            selectedEvidenceId: 'ev_datasheet_01',
            rationale: 'Datasheet original da fábrica',
            decidedAt: '2026-09-01T00:00:00Z'
          },
          status: 'verified',
          audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
        }
      }
    };

    const targetWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_target', 'prod_target'),
      modules: [targetModule]
    };

    // Caso A: preserveEvidence = false (padrão seguro)
    const cloneWithoutEvidence = cloneDataset({
      sourceDataset: sampleDataset,
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology'
    });
    const datumA = Object.values(cloneWithoutEvidence.updatedWorkbook.data)[0];
    expect(datumA.evidence).toEqual([]);
    expect(datumA.canonicalDecision).toBeUndefined();

    // Caso B: preserveEvidence = true MAS documento de origem não existe no target
    const cloneWithInvalidDoc = cloneDataset({
      sourceDataset: sampleDataset,
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology',
      options: {
        preserveEvidence: true,
        validSourceDocumentIds: ['doc_target_manual'] // 'doc_datasheet_source_only' NÃO está nesta lista
      }
    });
    const datumB = Object.values(cloneWithInvalidDoc.updatedWorkbook.data)[0];
    expect(datumB.evidence).toEqual([]); // Descartada pois documento é inválido no destino

    // Caso C: preserveEvidence = true E documento explicitamente autorizado
    const cloneWithValidDoc = cloneDataset({
      sourceDataset: sampleDataset,
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology',
      options: {
        preserveEvidence: true,
        validSourceDocumentIds: ['doc_datasheet_source_only']
      }
    });
    const datumC = Object.values(cloneWithValidDoc.updatedWorkbook.data)[0];
    expect(datumC.evidence).toHaveLength(1);
    expect(datumC.evidence[0].sourceDocumentId).toBe('doc_datasheet_source_only');
  });

  // 6. FAMILY INHERITED DATASET REMAINS SINGLE-SOURCE
  it('TESTE 6: family inherited dataset remains single-source (zero physical copy)', () => {
    const familyWbk: ProductWorkbookV2 = {
      ...createMockV2FamilyWorkbook('wbk_family_ta', 'fam_temperature_dryblock'),
      modules: [sourceModule],
      datasets: [sampleDataset],
      data: {}
    };

    const productWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_prod_ta25', 'prod_ta25'),
      modules: [],
      datasets: [], // Zero datasets locais
      data: {}
    };

    const effective = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWbk,
      productWorkbook: productWbk
    });

    // Invariante 1: Dataset herdado aparece no conhecimento efetivo
    expect(effective.effectiveDatasets).toBeDefined();
    const effectiveDs = effective.effectiveDatasets!.get(sampleDataset.semanticKey);
    expect(effectiveDs).toBeDefined();
    expect(effectiveDs!.origin).toBe('family');
    expect(effectiveDs!.dataset.id).toBe(sampleDataset.id); // Mesmo dataset da família

    // Invariante 2: O productWorkbook NÃO sofreu cópia física (permanece vazio em datasets locais)
    expect(productWbk.datasets).toHaveLength(0);
  });

  // 7. PRODUCT OVERRIDE DOES NOT MUTATE FAMILY
  it('TESTE 7: product override does not mutate family', () => {
    const familyWbk: ProductWorkbookV2 = {
      ...createMockV2FamilyWorkbook('wbk_family_ta', 'fam_temperature_dryblock'),
      modules: [sourceModule],
      datasets: [sampleDataset],
      data: {}
    };

    // Produto define um override para o dataset da família
    const productWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_prod_ta25', 'prod_ta25'),
      modules: [],
      datasets: [],
      data: {},
      datasetOverrides: {
        [sampleDataset.semanticKey]: {
          targetSemanticKey: sampleDataset.semanticKey,
          mode: 'override',
          overriddenLabel: 'Tabela de Exatidão Exclusiva do TA-25'
        }
      }
    };

    const effective = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWbk,
      productWorkbook: productWbk
    });

    const effectiveDs = effective.effectiveDatasets!.get(sampleDataset.semanticKey);
    expect(effectiveDs).toBeDefined();
    expect(effectiveDs!.origin).toBe('product_override');
    expect(effectiveDs!.dataset.label).toBe('Tabela de Exatidão Exclusiva do TA-25');

    // A Família permanece estritamente imutável com seu label original
    expect(familyWbk.datasets[0].label).toBe('Tabela de Exatidão');
  });

  // 8. TEMPLATE CONTAINS NO FABRICATED PRODUCT FACTS
  it('TESTE 8: template contains no fabricated product facts or technical values', () => {
    // Verifica todos os templates canônicos
    expect(CANONICAL_DATASET_TEMPLATES.length).toBeGreaterThanOrEqual(6);

    for (const tpl of CANONICAL_DATASET_TEMPLATES) {
      // Cada coluna define apenas tipagem e rótulo estrutural
      for (const col of tpl.columns) {
        expect(col.semanticKey).toBeDefined();
        expect(col.label).toBeDefined();
        expect(col.valueType).toBeDefined();
      }

      // Ao instanciar um dataset a partir do template:
      const targetWbk: ProductWorkbookV2 = {
        ...createMockV2ProductWorkbook('wbk_target', 'prod_target'),
        modules: [targetModule]
      };

      const { updatedWorkbook, createdDataset } = instantiateDatasetFromTemplate({
        template: tpl,
        targetWorkbook: targetWbk,
        targetModuleId: 'mod_target_metrology'
      });

      // Invariante: Células estão estritamente vazias (zero valores fabricados)
      expect(Object.keys(createdDataset.cells)).toHaveLength(0);
      expect(createdDataset.cells).toEqual({});
      expect(Object.keys(updatedWorkbook.data)).toHaveLength(0);
    }
  });

  // Teste de integridade de Chave de Célula (EMENDA 3)
  it('CELL-KEY: getDatasetCellKey e parseDatasetCellKey são determinísticos e imunes a colisões', () => {
    const row = 'row:with|special:chars';
    const col = 'col:with|delimiters';

    const key = getDatasetCellKey(row, col);
    const parsed = parseDatasetCellKey(key);

    expect(parsed.rowId).toBe(row);
    expect(parsed.columnId).toBe(col);
  });

  // ITEM 9 — CLONE CANONICAL DECISION SAFETY (Zero Orphan Decision)
  it('ITEM 9: canonical decision is cleared and downgraded to draft when any required evidence is filtered out', () => {
    const datumWithDecision: TechnicalDatum = {
      id: 'dtm_multi_evidence',
      semanticKey: 'metrology.specs.accuracy_multi',
      moduleId: 'mod_metrology',
      label: 'Exatidão Comprovada Multi-Doc',
      value: { type: 'text', value: '±0.02 °C' },
      status: 'verified',
      evidence: [
        {
          id: 'ev_a',
          sourceDocumentId: 'doc_cert_calibracao',
          page: 3,
          locator: 'p.3',
          excerpt: 'Erro observado 0.015 C'
        },
        {
          id: 'ev_b',
          sourceDocumentId: 'doc_folha_dados',
          page: 12,
          locator: 'p.12',
          excerpt: 'Especificação de catálogo'
        }
      ],
      canonicalDecision: {
        kind: 'engineering_decision',
        basisEvidenceIds: ['ev_a', 'ev_b'],
        rationale: 'Consolidação de laudo de calibração com folha de dados do fabricante',
        decidedAt: '2026-09-01T10:00:00Z',
        decidedBy: 'eng_responsavel'
      },
      audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
    };

    const sourceWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_source_safety', 'prod_source_safety'),
      modules: [sourceModule],
      datasets: [
        {
          ...sampleDataset,
          id: 'ds_safety_source',
          cells: {
            [getDatasetCellKey('row_50c', 'col_acc')]: {
              rowId: 'row_50c',
              columnId: 'col_acc',
              datumId: 'dtm_multi_evidence'
            }
          }
        }
      ],
      data: {
        dtm_multi_evidence: datumWithDecision
      }
    };

    const targetWbk: ProductWorkbookV2 = {
      ...createMockV2ProductWorkbook('wbk_target_safety', 'prod_target_safety'),
      modules: [targetModule],
      datasets: [],
      data: {}
    };

    // Cenário 1: Target autoriza APENAS 'doc_cert_calibracao' (ev_b é filtrada)
    const { updatedWorkbook: partialTargetWbk, createdDataset: partialDs } = cloneDataset({
      sourceDataset: sourceWbk.datasets[0],
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology',
      options: {
        preserveEvidence: true,
        validSourceDocumentIds: ['doc_cert_calibracao'] // apenas doc A!
      }
    });

    const targetCellKey = Object.keys(partialDs.cells)[0];
    const targetCell = partialDs.cells[targetCellKey];
    const clonedDatumPartial = partialTargetWbk.data[targetCell.datumId];

    expect(clonedDatumPartial).toBeDefined();
    // Apenas evidência A sobreviveu
    expect(clonedDatumPartial.evidence).toHaveLength(1);
    expect(clonedDatumPartial.evidence[0].id).toBe('ev_a');
    // Invariante ITEM 9: como ev_b necessária foi filtrada, canonicalDecision DEVE ser undefined!
    expect(clonedDatumPartial.canonicalDecision).toBeUndefined();
    // Status deve ser rebaixado para draft
    expect(clonedDatumPartial.status).toBe('draft');

    // Cenário 2: Target autoriza ambos os documentos ('doc_cert_calibracao' e 'doc_folha_dados')
    const { updatedWorkbook: fullTargetWbk, createdDataset: fullDs } = cloneDataset({
      sourceDataset: sourceWbk.datasets[0],
      sourceWorkbook: sourceWbk,
      targetWorkbook: targetWbk,
      targetModuleId: 'mod_target_metrology',
      options: {
        preserveEvidence: true,
        validSourceDocumentIds: ['doc_cert_calibracao', 'doc_folha_dados']
      }
    });

    const targetFullCellKey = Object.keys(fullDs.cells)[0];
    const targetFullCell = fullDs.cells[targetFullCellKey];
    const clonedDatumFull = fullTargetWbk.data[targetFullCell.datumId];

    expect(clonedDatumFull.evidence).toHaveLength(2);
    // Como todas as evidências de base sobreviveram, a decisão permanece válida
    expect(clonedDatumFull.canonicalDecision).toBeDefined();
    expect(clonedDatumFull.canonicalDecision?.kind).toBe('engineering_decision');
    expect(clonedDatumFull.status).toBe('verified');
  });
});
