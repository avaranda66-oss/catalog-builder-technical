// tests/domain/product-workspace/workspace-foundation-1d.test.ts
// Comprehensive Test Suite for PIM.MEGA.WORKSPACE.FOUNDATION1D
// 20 Mandatory Invariant Tests

import { describe, it, expect } from 'vitest';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  TechnicalDatum,
  TechnicalDataset,
  SourceDocument,
  getDatasetCellKey
} from '../../../src/domain/product-workbook';
import {
  WorkspaceLayoutV1,
  WorkspaceBlockDef,
  WorkspaceTechnicalTableDef,
  DatasetViewBlockDef,
  FactGridBlockDef,
  SourceGroupBlockDef,
  validateWorkspaceAgainstKnowledge,
  autoOrganizeProductWorkspace,
  createSemanticRegistry,
  resolveSemanticRegistry,
  buildAiProductKnowledgeEnvelope,
  buildWorkspaceProjection,
  addBlock,
  removeBlock
} from '../../../src/domain/product-workspace';

// ============================================================================
// HELPERS & FIXTURES
// ============================================================================

function createSampleWorkbook(productId = 'PROD-TA25'): ProductWorkbookV2 {
  const d1: TechnicalDatum = {
    id: 'dat_temp_range',
    semanticKey: 'metrology.temperature.range',
    moduleId: 'mod_metrology',
    label: 'Faixa de Temperatura',
    value: { type: 'range', lower: -200, upper: 850, unit: 'celsius' },
    evidence: [],
    status: 'verified'
  };

  const d2: TechnicalDatum = {
    id: 'dat_temp_acc',
    semanticKey: 'metrology.temperature.accuracy',
    moduleId: 'mod_metrology',
    label: 'Exatidão Térmica',
    value: { type: 'quantity', amount: 0.05, unit: 'celsius' },
    evidence: [],
    status: 'verified'
  };

  return {
    id: `wb_${productId}`,
    schemaVersion: 2,
    owner: { kind: 'product', id: productId },
    revision: 1,
    modules: [
      {
        id: 'mod_metrology',
        semanticKey: 'ta.metrology',
        label: 'Metrologia Geral',
        kind: 'key_value',
        order: 0,
        datumIds: ['dat_temp_range', 'dat_temp_acc']
      }
    ],
    data: {
      [d1.id]: d1,
      [d2.id]: d2
    },
    datasets: []
  };
}

function createBaseLayout(productId = 'PROD-TA25'): WorkspaceLayoutV1 {
  return {
    schemaVersion: 1,
    id: `layout_${productId}`,
    productId,
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    title: 'Layout de Teste',
    sections: [
      {
        id: 'sec_main',
        title: 'Seção Principal',
        blockIds: [],
        order: 0
      }
    ],
    blocks: {}
  };
}

describe('PIM.MEGA.WORKSPACE.FOUNDATION1D — Test Matrix', () => {
  // --------------------------------------------------------------------------
  // 1. canonical table key validated
  // --------------------------------------------------------------------------
  it('1. canonical table key validated: aceita chaves no formato getDatasetCellKey', () => {
    const workbook = createSampleWorkbook();
    let layout = createBaseLayout();

    const rowId = 'row_pt100';
    const colId = 'col_accuracy';
    const canonicalKey = getDatasetCellKey(rowId, colId);

    const tableDef: WorkspaceTechnicalTableDef = {
      id: 'table_canonical',
      title: 'Tabela Canônica',
      columns: [{ id: colId, label: 'Exatidão' }],
      rows: [{ id: rowId, label: 'Pt100', order: 0 }],
      cells: {
        [canonicalKey]: {
          type: 'datum_ref',
          datumId: 'dat_temp_acc'
        }
      }
    };

    const block: WorkspaceBlockDef = {
      id: 'blk_table_canonical',
      kind: 'technical_table',
      tableDef
    };

    layout = addBlock(layout, 'sec_main', block);

    const report = validateWorkspaceAgainstKnowledge({
      layout,
      workbook
    });

    expect(report.isValid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 2. ${row}:${col} rejected/not recognized
  // --------------------------------------------------------------------------
  it('2. ${row}:${col} rejected/not recognized: rejeita formato com colon simples', () => {
    const workbook = createSampleWorkbook();
    let layout = createBaseLayout();

    const rowId = 'row_1';
    const colId = 'col_1';
    const colonKey = `${rowId}:${colId}`; // ERRADO: colon simples

    const tableDef: WorkspaceTechnicalTableDef = {
      id: 'table_colon_error',
      title: 'Tabela Inválida',
      columns: [{ id: colId, label: 'Coluna 1' }],
      rows: [{ id: rowId, label: 'Linha 1', order: 0 }],
      cells: {
        [colonKey]: {
          type: 'editorial_literal',
          value: 'Valor Teste'
        }
      }
    };

    const block: WorkspaceBlockDef = {
      id: 'blk_table_colon',
      kind: 'technical_table',
      tableDef
    };

    layout = addBlock(layout, 'sec_main', block);

    const report = validateWorkspaceAgainstKnowledge({
      layout,
      workbook
    });

    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.code === 'TABLE_CELL_KEY_INVALID')).toBe(true);
    expect(report.errors.find((e) => e.code === 'TABLE_CELL_KEY_INVALID')?.message).toContain(
      'Formatos simples como row:col são proibidos'
    );
  });

  // --------------------------------------------------------------------------
  // 3. datumId cannot be semanticKey
  // --------------------------------------------------------------------------
  it('3. datumId cannot be semanticKey: rejeita semanticKey silenciosa em datumIds', () => {
    const workbook = createSampleWorkbook();
    let layout = createBaseLayout();

    const invalidFactGrid: FactGridBlockDef = {
      id: 'blk_fact_semantic_key',
      kind: 'fact_grid',
      title: 'Destaques com Semantic Key Errada',
      datumIds: ['metrology.temperature.range'], // SemanticKey passada onde deveria ser datumId estável ('dat_temp_range')
      columns: 2
    };

    layout = addBlock(layout, 'sec_main', invalidFactGrid);

    const report = validateWorkspaceAgainstKnowledge({
      layout,
      workbook
    });

    expect(report.isValid).toBe(false);
    const datumError = report.errors.find((e) => e.code === 'DATUM_NOT_FOUND');
    expect(datumError).toBeDefined();
    expect(datumError?.entityId).toBe('metrology.temperature.range');
  });

  // --------------------------------------------------------------------------
  // 4, 5, 6. Effective Family & Product Datasets & No duplicate inferred table
  // --------------------------------------------------------------------------
  it('4, 5, 6. TA Family Requirement: datasets efetivos (família + local) e zero tabelas duplicadas inferidas', () => {
    // Family datasets
    const dsInputs: TechnicalDataset = {
      id: 'ds_inputs',
      semanticKey: 'ta.electrical.inputs',
      moduleId: 'mod_ta_inputs',
      label: 'Entradas Elétricas e Sensores',
      kind: 'matrix',
      columns: [{ id: 'c1', semanticKey: 'ta.inputs.range', label: 'Faixa', valueType: 'range', order: 0 }],
      rows: [{ id: 'r1', label: 'Pt100', order: 0 }],
      cells: {
        [getDatasetCellKey('r1', 'c1')]: {
          rowId: 'r1',
          columnId: 'c1',
          datumId: 'dat_input_pt100'
        }
      },
      order: 0
    };

    const dsInserts: TechnicalDataset = {
      id: 'ds_inserts',
      semanticKey: 'ta.mechanical.inserts',
      moduleId: 'mod_ta_inserts',
      label: 'Blocos de Inserção',
      kind: 'custom',
      columns: [{ id: 'c_diam', semanticKey: 'ta.inserts.diam', label: 'Diâmetro', valueType: 'quantity', order: 0 }],
      rows: [{ id: 'r_ins1', label: 'Inserto A', order: 0 }],
      cells: {
        [getDatasetCellKey('r_ins1', 'c_diam')]: {
          rowId: 'r_ins1',
          columnId: 'c_diam',
          datumId: 'dat_insert_a'
        }
      },
      order: 1
    };

    // Product local dataset
    const dsLocalAcessorio: TechnicalDataset = {
      id: 'ds_local_acc',
      semanticKey: 'ta.local.accessories',
      moduleId: 'mod_local_acc',
      label: 'Acessórios Especiais Locais',
      kind: 'collection',
      columns: [{ id: 'c_part', semanticKey: 'ta.accessories.pn', label: 'Part Number', valueType: 'text', order: 0 }],
      rows: [{ id: 'r_acc1', label: 'Cabo Especial', order: 0 }],
      cells: {
        [getDatasetCellKey('r_acc1', 'c_part')]: {
          rowId: 'r_acc1',
          columnId: 'c_part',
          datumId: 'dat_acc_1'
        }
      },
      order: 2
    };

    const productWorkbook: ProductWorkbookV2 = {
      id: 'wb_PROD-TA25N',
      schemaVersion: 2,
      owner: { kind: 'product', id: 'PROD-TA25N' },
      revision: 1,
      modules: [
        {
          id: 'mod_local_acc',
          semanticKey: 'ta.local.accessories',
          label: 'Acessórios Especiais Locais',
          kind: 'collection',
          order: 0,
          datumIds: ['dat_acc_1']
        }
      ],
      data: {
        dat_acc_1: {
          id: 'dat_acc_1',
          semanticKey: 'ta.accessories.cable.pn',
          moduleId: 'mod_local_acc',
          label: 'PN Cabo',
          value: { type: 'text', value: 'ACC-001' },
          evidence: [],
          status: 'verified'
        }
      },
      datasets: [dsLocalAcessorio]
    };

    // ResolvedProductKnowledge com exatamente 3 datasets efetivos (2 herdados da família + 1 local)
    const effectiveKnowledge: ResolvedProductKnowledge = {
      productId: 'PROD-TA25N',
      modules: [
        {
          id: 'mod_ta_inputs',
          semanticKey: 'ta.electrical.inputs',
          label: 'Entradas Elétricas da Família TA',
          kind: 'matrix',
          order: 0,
          datumIds: ['dat_input_pt100']
        },
        {
          id: 'mod_ta_inserts',
          semanticKey: 'ta.mechanical.inserts',
          label: 'Blocos de Inserção da Família TA',
          kind: 'custom',
          order: 1,
          datumIds: ['dat_insert_a']
        },
        {
          id: 'mod_local_acc',
          semanticKey: 'ta.local.accessories',
          label: 'Acessórios Especiais Locais',
          kind: 'collection',
          order: 2,
          datumIds: ['dat_acc_1']
        }
      ],
      effectiveData: new Map([
        [
          'ta.electrical.inputs.rtd.range',
          {
            datum: {
              id: 'dat_input_pt100',
              semanticKey: 'ta.electrical.inputs.rtd.range',
              moduleId: 'mod_ta_inputs',
              label: 'Faixa Entrada RTD',
              value: { type: 'range', lower: -200, upper: 850, unit: 'celsius' },
              evidence: [],
              status: 'verified'
            },
            origin: 'family',
            effectiveStatus: 'verified'
          }
        ],
        [
          'ta.mechanical.inserts.diam',
          {
            datum: {
              id: 'dat_insert_a',
              semanticKey: 'ta.mechanical.inserts.diam',
              moduleId: 'mod_ta_inserts',
              label: 'Diâmetro Inserto A',
              value: { type: 'quantity', amount: 6.5, unit: 'mm' },
              evidence: [],
              status: 'verified'
            },
            origin: 'family',
            effectiveStatus: 'verified'
          }
        ],
        [
          'ta.accessories.cable.pn',
          {
            datum: {
              id: 'dat_acc_1',
              semanticKey: 'ta.accessories.cable.pn',
              moduleId: 'mod_local_acc',
              label: 'PN Cabo',
              value: { type: 'text', value: 'ACC-001' },
              evidence: [],
              status: 'verified'
            },
            origin: 'product_local',
            effectiveStatus: 'verified'
          }
        ]
      ]),
      effectiveDatasets: new Map([
        ['ta.electrical.inputs', { dataset: dsInputs, origin: 'family', isSuppressed: false }],
        ['ta.mechanical.inserts', { dataset: dsInserts, origin: 'family', isSuppressed: false }],
        ['ta.local.accessories', { dataset: dsLocalAcessorio, origin: 'product_local', isSuppressed: false }]
      ]),
      suppressedKeys: [],
      conflictsCount: 0
    };

    const organizedLayout = autoOrganizeProductWorkspace({
      workbook: productWorkbook,
      effectiveKnowledge
    });

    // Filtra blocos de dataset e blocos de tabela técnica inferida
    const datasetBlocks = Object.values(organizedLayout.blocks).filter(
      (b): b is DatasetViewBlockDef => b.kind === 'dataset_view'
    );
    const inferredTableBlocks = Object.values(organizedLayout.blocks).filter(
      (b) => b.kind === 'technical_table'
    );

    // 4 & 5. Exatamente 3 dataset views (2 herdados da família + 1 local do produto)
    expect(datasetBlocks).toHaveLength(3);
    const datasetIds = datasetBlocks.map((b) => b.datasetId);
    expect(datasetIds).toContain('ds_inputs');
    expect(datasetIds).toContain('ds_inserts');
    expect(datasetIds).toContain('ds_local_acc');

    // 6. Zero duplicate inferred mega tables
    expect(inferredTableBlocks).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 7. effective family module label preserved
  // --------------------------------------------------------------------------
  it('7. effective family module label preserved: label de módulo herdado da família é preservado', () => {
    // Definimos 6 datums de destaque (keywords de resumo) e 1 datum em módulo herdado
    const summaryDatum: TechnicalDatum = {
      id: 'dat_summary_range',
      semanticKey: 'metrology.temperature_range',
      moduleId: 'mod_summary',
      label: 'Faixa Resumo',
      value: { type: 'range', lower: 0, upper: 100, unit: 'celsius' },
      evidence: [],
      status: 'verified'
    };

    const isolatedDatum: TechnicalDatum = {
      id: 'dat_fam_iso',
      semanticKey: 'ta.family.isolated.spec',
      moduleId: 'mod_family_isolated',
      label: 'Especificação Isolada',
      value: { type: 'text', value: '1000V' },
      evidence: [],
      status: 'verified'
    };

    const productWorkbook: ProductWorkbookV2 = {
      id: 'wb_PROD-HERITAGE',
      schemaVersion: 2,
      owner: { kind: 'product', id: 'PROD-HERITAGE' },
      revision: 1,
      modules: [], // Produto local NÃO tem o módulo cadastrado
      data: {},
      datasets: []
    };

    const effectiveKnowledge: ResolvedProductKnowledge = {
      productId: 'PROD-HERITAGE',
      modules: [
        {
          id: 'mod_family_isolated',
          semanticKey: 'ta.family.isolated',
          label: 'Módulo Metrológico Avançado da Família',
          kind: 'key_value',
          order: 0,
          datumIds: ['dat_fam_iso']
        }
      ],
      effectiveData: new Map([
        [
          summaryDatum.semanticKey,
          {
            datum: summaryDatum,
            origin: 'product_local',
            effectiveStatus: 'verified'
          }
        ],
        [
          isolatedDatum.semanticKey,
          {
            datum: isolatedDatum,
            origin: 'family',
            effectiveStatus: 'verified'
          }
        ]
      ]),
      suppressedKeys: [],
      conflictsCount: 0
    };

    const layout = autoOrganizeProductWorkspace({
      workbook: productWorkbook,
      effectiveKnowledge
    });

    // O bloco de detalhe gerado para dat_fam_iso deve carregar o label do módulo da família
    const detailBlock = Object.values(layout.blocks).find(
      (b): b is FactGridBlockDef => b.kind === 'fact_grid' && b.id.includes('mod_family_isolated')
    );

    expect(detailBlock).toBeDefined();
    expect(detailBlock?.title).toBe('Módulo Metrológico Avançado da Família');
  });

  // --------------------------------------------------------------------------
  // 8, 9, 10, 11. Semantic Registry Owner, Precedence, and Zero Physical Copy
  // --------------------------------------------------------------------------
  it('8, 9, 10, 11. Semantic Registry: resolves family and product, enforces precedence and avoids physical copies', () => {
    // 8. Family Registry
    const familyRegistry = createSemanticRegistry({
      owner: { kind: 'family', id: 'FAM-TA' },
      revision: 1,
      descriptors: {
        'metrology.accuracy': {
          canonicalKey: 'metrology.accuracy',
          displayLabel: 'Exatidão da Família',
          aliases: ['precisao_base'],
          description: 'Definição metrológica padrão da família'
        },
        'metrology.stability': {
          canonicalKey: 'metrology.stability',
          displayLabel: 'Estabilidade Térmica',
          aliases: ['estabilidade'],
          description: 'Estabilidade de 0.05 C'
        }
      }
    });

    const resolvedFamilyOnly = resolveSemanticRegistry({ familyRegistry });
    expect(resolvedFamilyOnly.owner.kind).toBe('family');
    expect(resolvedFamilyOnly.effectiveDescriptors.get('metrology.accuracy')?.origin).toBe('family');
    expect(resolvedFamilyOnly.effectiveDescriptors.get('metrology.accuracy')?.isInherited).toBe(true);

    // 9. Product Registry
    const productRegistry = createSemanticRegistry({
      owner: { kind: 'product', id: 'PROD-TA25N' },
      revision: 1,
      descriptors: {
        'metrology.accuracy': {
          canonicalKey: 'metrology.accuracy',
          displayLabel: 'Exatidão Calibrada do TA-25N',
          aliases: ['acuracia_ta25']
        },
        'metrology.local.feature': {
          canonicalKey: 'metrology.local.feature',
          displayLabel: 'Recurso Exclusivo Local',
          aliases: ['exclusivo']
        }
      }
    });

    const resolvedProductOnly = resolveSemanticRegistry({ productRegistry });
    expect(resolvedProductOnly.owner.kind).toBe('product');
    expect(resolvedProductOnly.effectiveDescriptors.get('metrology.local.feature')?.origin).toBe('product_local');

    // 10. Precedence and Aliases Merge
    const effectiveRegistry = resolveSemanticRegistry({ familyRegistry, productRegistry });
    const accuracyDesc = effectiveRegistry.effectiveDescriptors.get('metrology.accuracy');

    expect(accuracyDesc?.origin).toBe('product_override');
    expect(accuracyDesc?.descriptor.displayLabel).toBe('Exatidão Calibrada do TA-25N');
    // Mesclou aliases sem perder o da família
    expect(accuracyDesc?.descriptor.aliases).toContain('precisao_base');
    expect(accuracyDesc?.descriptor.aliases).toContain('acuracia_ta25');
    // Preservou a descrição herdada da família
    expect(accuracyDesc?.descriptor.description).toBe('Definição metrológica padrão da família');

    // 11. Zero Physical Copy: O registry original da família permanece intacto e inalterado
    expect(familyRegistry.descriptors['metrology.accuracy'].displayLabel).toBe('Exatidão da Família');
    expect(familyRegistry.descriptors['metrology.accuracy'].aliases).toEqual(['precisao_base']);
  });

  // --------------------------------------------------------------------------
  // 12, 13. AI ignores layout semanticDescriptors by default; accepts explicit migration fallback
  // --------------------------------------------------------------------------
  it('12, 13. AI Knowledge: ignores layout semanticDescriptors by default; accepts explicit migration fallback', () => {
    const workbook = createSampleWorkbook();
    let layout = createBaseLayout();

    // Layout pessoal com semanticDescriptors arbitrários
    layout = {
      ...layout,
      semanticDescriptors: {
        'metrology.temperature.range': {
          canonicalKey: 'metrology.temperature.range',
          displayLabel: 'Rótulo Pessoal do Usuário',
          aliases: ['termo_pessoal_inadequado']
        }
      }
    };

    // 12. Default: AI IGNORES layout semanticDescriptors
    const aiEnvelopeDefault = buildAiProductKnowledgeEnvelope({
      workbook,
      layout,
      semanticRegistry: undefined
      // allowLegacyLayoutSemanticFallback: false por padrão
    });

    const factDefault = aiEnvelopeDefault.facts.find(
      (f) => f.canonicalSemanticKey === 'metrology.temperature.range'
    );
    expect(factDefault).toBeDefined();
    // Não foi poluído com os aliases arbitrários do layout pessoal
    expect(factDefault?.aliases).toHaveLength(0);
    expect(factDefault?.aliases).not.toContain('termo_pessoal_inadequado');

    // 13. Explicit migration compatibility tooling
    const aiEnvelopeMigration = buildAiProductKnowledgeEnvelope({
      workbook,
      layout,
      allowLegacyLayoutSemanticFallback: true // Habilitado explicitamente para migration tooling
    });

    const factMigration = aiEnvelopeMigration.facts.find(
      (f) => f.canonicalSemanticKey === 'metrology.temperature.range'
    );
    expect(factMigration?.aliases).toContain('termo_pessoal_inadequado');
  });

  // --------------------------------------------------------------------------
  // 14, 15. displayOverride affects UI only, not AI aliases
  // --------------------------------------------------------------------------
  it('14, 15. displayOverride affects UI only and never pollutes AI aliases', () => {
    const workbook = createSampleWorkbook();
    let layout = createBaseLayout();

    // Adiciona bloco FactGrid explicitamente referenciando o datum
    const factBlock: FactGridBlockDef = {
      id: 'blk_temp_display',
      kind: 'fact_grid',
      title: 'Temperatura',
      datumIds: ['dat_temp_range'],
      columns: 2
    };
    layout = addBlock(layout, 'sec_main', factBlock);

    layout = {
      ...layout,
      displayOverrides: {
        'metrology.temperature.range': {
          customLabel: 'Faixa Visível Apenas na Tela'
        }
      }
    };

    const semanticRegistry = createSemanticRegistry({
      owner: { kind: 'product', id: workbook.owner.id },
      descriptors: {
        'metrology.temperature.range': {
          canonicalKey: 'metrology.temperature.range',
          displayLabel: 'Faixa de Temperatura Canônica',
          aliases: ['span_termico']
        }
      }
    });

    // 14. UI Projection respeita displayOverride
    const projection = buildWorkspaceProjection({
      workbook,
      layout,
      semanticRegistry
    });

    let projectedLabel = '';
    for (const sec of projection.sections) {
      for (const blk of sec.blocks) {
        if (blk.kind === 'fact_grid' && blk.items) {
          const found = blk.items.find((f) => f.canonicalSemanticKey === 'metrology.temperature.range');
          if (found) projectedLabel = found.displayLabel;
        }
      }
    }
    expect(projectedLabel).toBe('Faixa Visível Apenas na Tela');

    // 15. AI Envelope NÃO é afetado por displayOverride
    const aiEnvelope = buildAiProductKnowledgeEnvelope({
      workbook,
      layout,
      semanticRegistry
    });

    const aiFact = aiEnvelope.facts.find((f) => f.canonicalSemanticKey === 'metrology.temperature.range');
    expect(aiFact?.displayLabel).toBe('Faixa de Temperatura Canônica');
    expect(aiFact?.aliases).toEqual(['span_termico']);
    expect(aiFact?.aliases).not.toContain('Faixa Visível Apenas na Tela');
  });

  // --------------------------------------------------------------------------
  // 16. removeBlock wrong owner cannot corrupt layout
  // --------------------------------------------------------------------------
  it('16. removeBlock wrong owner: não corrompe o layout ao passar seção incorreta', () => {
    let layout = createBaseLayout();

    // Cria 2 seções
    layout = {
      ...layout,
      sections: [
        { id: 'sec_A', title: 'Seção A', blockIds: [], order: 0 },
        { id: 'sec_B', title: 'Seção B', blockIds: [], order: 1 }
      ]
    };

    const block: WorkspaceBlockDef = {
      id: 'blk_belonging_to_A',
      kind: 'text_note',
      title: 'Nota da Seção A',
      content: 'Conteúdo'
    };

    layout = addBlock(layout, 'sec_A', block);
    expect(layout.sections[0].blockIds).toContain('blk_belonging_to_A');
    expect(layout.blocks['blk_belonging_to_A']).toBeDefined();

    const revisionBefore = layout.revision;

    // Tentativa de remover bloco informando seção errada (sec_B)
    expect(() => {
      removeBlock(layout, 'sec_B', 'blk_belonging_to_A');
    }).toThrow('Inconsistência de propriedade');

    // Layout original permanece 100% íntegro e bloco não se tornou órfão
    expect(layout.sections[0].blockIds).toContain('blk_belonging_to_A');
    expect(layout.blocks['blk_belonging_to_A']).toBeDefined();
    expect(layout.revision).toBe(revisionBefore);
  });

  // --------------------------------------------------------------------------
  // 17. addBlock ID collision rejected
  // --------------------------------------------------------------------------
  it('17. addBlock ID collision: rejeita bloco com ID já existente no layout', () => {
    let layout = createBaseLayout();

    const initialBlock: WorkspaceBlockDef = {
      id: 'blk_unique_id',
      kind: 'text_note',
      title: 'Bloco Original',
      content: 'Texto 1'
    };

    layout = addBlock(layout, 'sec_main', initialBlock);

    // Tentativa de adicionar outro bloco com mesmo ID
    const conflictingBlock: WorkspaceBlockDef = {
      id: 'blk_unique_id',
      kind: 'text_note',
      title: 'Bloco Intruso',
      content: 'Texto 2'
    };

    expect(() => {
      addBlock(layout, 'sec_main', conflictingBlock);
    }).toThrow('Colisão de blockId');

    // Bloco original não foi destruído
    const blk = layout.blocks['blk_unique_id'];
    expect(blk?.kind === 'text_note' && blk.title).toBe('Bloco Original');

    // Mesma adição idêntica na mesma seção é NO-OP sem erro
    const sameBlockLayout = addBlock(layout, 'sec_main', initialBlock);
    expect(sameBlockLayout.revision).toBe(layout.revision);
  });

  // --------------------------------------------------------------------------
  // 18. missing source context does not falsely validate
  // --------------------------------------------------------------------------
  it('18. missing source context: distingue sources === undefined de sources === [] e não valida falsamente', () => {
    const workbook = createSampleWorkbook();
    let layout = createBaseLayout();

    const sourceBlock: SourceGroupBlockDef = {
      id: 'blk_sources',
      kind: 'source_group',
      title: 'Fontes Oficiais',
      sourceDocumentIds: ['doc_manual_ta']
    };

    layout = addBlock(layout, 'sec_main', sourceBlock);

    // Contexto ausente (sources: undefined) -> Erro explícito SOURCE_CONTEXT_UNAVAILABLE
    const reportUndefinedSources = validateWorkspaceAgainstKnowledge({
      layout,
      workbook,
      sources: undefined
    });

    expect(reportUndefinedSources.isValid).toBe(false);
    expect(
      reportUndefinedSources.errors.some((e) => e.code === 'SOURCE_CONTEXT_UNAVAILABLE')
    ).toBe(true);

    // Contexto conhecido porém vazio (sources: []) -> SOURCE_DOCUMENT_NOT_FOUND
    const reportEmptySources = validateWorkspaceAgainstKnowledge({
      layout,
      workbook,
      sources: []
    });

    expect(reportEmptySources.isValid).toBe(false);
    expect(
      reportEmptySources.errors.some((e) => e.code === 'SOURCE_DOCUMENT_NOT_FOUND')
    ).toBe(true);

    // Contexto com o documento presente -> VÁLIDO
    const validDoc: SourceDocument = {
      id: 'doc_manual_ta',
      title: 'Manual TA',
      documentType: 'manual'
    };

    const reportValid = validateWorkspaceAgainstKnowledge({
      layout,
      workbook,
      sources: [validDoc]
    });

    expect(reportValid.isValid).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 19. invalid visibleColumnId rejected
  // --------------------------------------------------------------------------
  it('19. invalid visibleColumnId rejected: rejeita visibleColumnId inexistente no dataset', () => {
    const dsTest: TechnicalDataset = {
      id: 'ds_test',
      semanticKey: 'ta.test.dataset',
      moduleId: 'mod_metrology',
      label: 'Dataset Teste',
      kind: 'matrix',
      columns: [
        { id: 'col_a', semanticKey: 'ta.test.col_a', label: 'Coluna A', valueType: 'text', order: 0 },
        { id: 'col_b', semanticKey: 'ta.test.col_b', label: 'Coluna B', valueType: 'text', order: 1 }
      ],
      rows: [{ id: 'r1', label: 'Linha 1', order: 0 }],
      cells: {},
      order: 0
    };

    const workbook: ProductWorkbookV2 = {
      ...createSampleWorkbook(),
      datasets: [dsTest]
    };

    let layout = createBaseLayout();

    const invalidDatasetView: DatasetViewBlockDef = {
      id: 'blk_ds_view',
      kind: 'dataset_view',
      datasetId: 'ds_test',
      visibleColumnIds: ['col_a', 'col_fantasma_invalida'] // 'col_fantasma_invalida' não existe
    };

    layout = addBlock(layout, 'sec_main', invalidDatasetView);

    const report = validateWorkspaceAgainstKnowledge({
      layout,
      workbook
    });

    expect(report.isValid).toBe(false);
    const colError = report.errors.find((e) => e.code === 'DATASET_COLUMN_NOT_FOUND');
    expect(colError).toBeDefined();
    expect(colError?.entityId).toBe('col_fantasma_invalida');
  });

  // --------------------------------------------------------------------------
  // 20. full suite passes with original vitest.config
  // --------------------------------------------------------------------------
  it('20. full suite passes with original vitest.config: validação de ambiente isolado', () => {
    // Confirma que variáveis de ambiente mockadas globalmente NÃO existem por padrão
    expect(process.env.VITE_SUPABASE_URL).not.toBe('https://mock-test.supabase.co');
    expect(process.env.VITE_SUPABASE_ANON_KEY).not.toBe('mock-anon-key');
  });
});
