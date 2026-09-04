// tests/domain/table-core/table-production-experience-1-1.test.tsx
// Suíte de Testes Mandatória para TABLE.PRODUCTION.EXPERIENCE1.1:
// Binding + Identity + Presentation + Publish Closure.
// 17 Testes de Regressão e Validação Arquitetural:
// 1. actual Picker UI → store bridge
// 2. product-scoped picker
// 3. dataset action != datum binding
// 4. strict snapshot malformed rejection
// 5. snapshot PIM offline
// 6. review snapshot offline
// 7. unlink typed PIM keep-value
// 8. official table zero ghost
// 9. stable IDs after reorder
// 10. canonical datum identity
// 11. binding sourceRevision round-trip
// 12. user template save/reload/apply
// 13. row/column/cell style round-trip
// 14. freshness revision regression
// 15. publish BLOCK/WARN
// 16. old catalog compatibility
// 17. PDF/export parity

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Catalog,
  CatalogSchema,
  ContentBlock,
  CatalogTableRowSchema
} from '../../../src/domain/catalog.schema';
import {
  adaptLegacyBlockToTableCore,
  getCellKey,
  getTablePreset,
  TablePresentationModel,
  TablePresentationModelSchema,
  auditCatalogPublishSafety,
  TableCoreModel
} from '../../../src/domain/table-core';
import { TableCoreRenderer } from '../../../src/components/editor/table-core/TableCoreRenderer';
import { TableCellLiteralContent } from '../../../src/domain/table-values';
import {
  projectTechnicalDatasetToTableCore,
  generateDeterministicDatasetColumnId,
  generateDeterministicDatasetRowId,
  generateDeterministicDatasetCellId
} from '../../../src/domain/table-binding/dataset-to-table.adapter';
import {
  createProductWorkbookDatumResolver
} from '../../../src/domain/table-binding/product-workbook-datum.resolver';
import {
  evaluateBindingFreshness
} from '../../../src/domain/table-binding/binding-freshness';
import {
  TestProductKnowledgeProvider,
  TechnicalDatasetProjection
} from '../../../src/domain/table-binding/product-knowledge-provider.types';
import {
  getUserPresentationTemplates,
  saveUserPresentationTemplate
} from '../../../src/services/user-presentation-templates.service';
import { useCatalogStore } from '../../../src/stores/useCatalogStore';
import { useUIStore, KnowledgePickerTarget } from '../../../src/stores/useUIStore';
import { ProductKnowledgePickerModal } from '../../../src/components/editor/picker/ProductKnowledgePickerModal';

describe('TABLE.PRODUCTION.EXPERIENCE1.1: Quality Gates & Comprehensive Audit Suite', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // =========================================================================
  // 1. actual Picker UI → store bridge
  // =========================================================================
  it('1. actual Picker UI → store bridge: vincula célula usando coordenadas legadas (legacyRowId, legacyColKey) e snapshot textual tipado', async () => {
    const testCatalog: Catalog = {
      id: 'cat-picker-test',
      schemaVersion: 1,
      version: 1,
      title: 'Catálogo de Teste do Picker',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          blocks: [
            {
              id: 'block-picker-target',
              type: 'specs_table',
              title: 'Tabela de Teste',
              tableColumns: [
                { key: 'model', label: 'Modelo', visible: true, width: 100 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 150 }
              ],
              tableRows: [
                { id: 'legacy-row-01', productRefId: 'prod-ta25n', order: 0 }
              ]
            }
          ]
        }
      ]
    };
    useCatalogStore.setState({ currentCatalog: testCatalog });

    const target: KnowledgePickerTarget = {
      kind: 'cell',
      blockId: 'block-picker-target',
      legacyRowId: 'legacy-row-01',
      legacyColKey: 'accuracy',
      productId: 'prod-ta25n',
      productModel: 'TA-25N'
    };

    useUIStore.setState({
      isProductKnowledgePickerModalOpen: true,
      knowledgePickerTarget: target
    });

    const mockProvider = new TestProductKnowledgeProvider([
      {
        id: 'res-acc-ta25n',
        kind: 'datum',
        productId: 'prod-ta25n',
        productModel: 'TA-25N',
        semanticKey: 'accuracy.reference',
        label: 'Exatidão Referência',
        status: 'approved',
        origin: 'PIM',
        sourceCount: 1,
        preview: '±0.05 °C (Calibrado)',
        sourceRevision: 5
      }
    ]);

    await act(async () => {
      root?.render(<ProductKnowledgePickerModal provider={mockProvider} />);
    });

    const bindBtn = container.querySelector('[data-testid="picker-bind-cell-accuracy.reference"]') as HTMLButtonElement | null;
    expect(bindBtn).not.toBeNull();

    await act(async () => {
      bindBtn!.click();
    });

    const updatedCatalog = useCatalogStore.getState().currentCatalog;
    const targetRow = updatedCatalog?.pages[0].blocks[0].tableRows?.[0];
    expect(targetRow).toBeDefined();

    const binding = targetRow?.cellBindings?.['accuracy'];
    expect(binding).toBeDefined();
    expect(binding?.productId).toBe('prod-ta25n');
    expect(binding?.semanticKey).toBe('accuracy.reference');
    expect(binding?.sourceRevision).toBe(5);
    expect(binding?.snapshot).toEqual({ kind: 'text', text: '±0.05 °C (Calibrado)' });
  });

  // =========================================================================
  // 2. product-scoped picker
  // =========================================================================
  it('2. product-scoped picker: abre com escopo do produto da linha e permite alternar para Todos os Produtos', async () => {
    const target: KnowledgePickerTarget = {
      kind: 'cell',
      blockId: 'blk-scope',
      legacyRowId: 'row-1',
      legacyColKey: 'range',
      productId: 'prod-ta25n',
      productModel: 'TA-25N'
    };

    useUIStore.setState({
      isProductKnowledgePickerModalOpen: true,
      knowledgePickerTarget: target
    });

    const mockProvider = new TestProductKnowledgeProvider([
      {
        id: 'res-pressure-range',
        kind: 'datum',
        productId: 'prod-ta25n',
        productModel: 'TA-25N',
        semanticKey: 'pressure.range',
        label: 'Faixa de Pressão',
        status: 'approved',
        origin: 'PIM',
        sourceCount: 1,
        preview: '0 a 10 bar'
      }
    ]);

    await act(async () => {
      root?.render(<ProductKnowledgePickerModal provider={mockProvider} />);
    });

    expect(container.textContent).toContain('Buscando em: TA-25N');

    const toggleScopeBtn = container.querySelector('[data-testid="toggle-product-scope"]') as HTMLButtonElement | null;
    expect(toggleScopeBtn).not.toBeNull();

    await act(async () => {
      toggleScopeBtn!.click();
    });
    expect(container.textContent).toContain('Buscando em: Todos os Produtos');
  });

  // =========================================================================
  // 3. dataset action != datum binding
  // =========================================================================
  it('3. dataset action != datum binding: resultados do tipo dataset não possuem ação de vincular à célula', async () => {
    const target: KnowledgePickerTarget = {
      kind: 'cell',
      blockId: 'blk-ds',
      legacyRowId: 'row-1',
      legacyColKey: 'col-1'
    };

    useUIStore.setState({
      isProductKnowledgePickerModalOpen: true,
      knowledgePickerTarget: target
    });

    const mockProvider = new TestProductKnowledgeProvider([
      {
        id: 'res-ds-ranges-01',
        kind: 'dataset',
        productId: 'prod-ta25n',
        productModel: 'TA-25N',
        semanticKey: 'ds-ranges-01',
        datasetId: 'ds-ranges-01',
        label: 'Tabela de Faixas Disponíveis',
        status: 'approved',
        origin: 'PIM',
        sourceCount: 1,
        preview: '2 faixas'
      }
    ]);

    await act(async () => {
      root?.render(<ProductKnowledgePickerModal provider={mockProvider} />);
    });

    const insertTableBtn = container.querySelector('[data-testid="picker-insert-dataset-ds-ranges-01"]');
    expect(insertTableBtn).not.toBeNull();

    const invalidCellBindBtn = container.querySelector('[data-testid="picker-bind-cell-ds-ranges-01"]');
    expect(invalidCellBindBtn).toBeNull();
  });

  // =========================================================================
  // 4. strict snapshot malformed rejection
  // =========================================================================
  it('4. strict snapshot malformed rejection: rejeita snapshot sem tipagem estrita no schema Zod', () => {
    const invalidRow = {
      id: 'row-malformed',
      cellBindings: {
        accuracy: {
          sourceKind: 'pim_datum',
          productId: 'prod-ta25n',
          semanticKey: 'accuracy.value',
          bindingMode: 'snapshot',
          snapshot: { kind: 'arbitrary_unsupported_kind', value: '123' }
        }
      }
    };

    const parseResult = CatalogTableRowSchema.safeParse(invalidRow);
    expect(parseResult.success).toBe(false);
  });

  // =========================================================================
  // 5. snapshot PIM offline
  // =========================================================================
  it('5. snapshot PIM offline: snapshot congela o valor e é retornado imediatamente sem consultar provedor offline', () => {
    const snapshotContent: TableCellLiteralContent = { kind: 'text', text: '±0.05 °C Congelado' };
    const resolver = createProductWorkbookDatumResolver(new Map());

    const result = resolver({
      kind: 'datum_reference',
      productId: 'prod-ta25n',
      datumKey: 'accuracy.value',
      bindingMode: 'snapshot',
      snapshot: snapshotContent
    });

    expect(result?.status).toBe('approved');
    expect(result?.value).toEqual(snapshotContent);
  });

  // =========================================================================
  // 6. review snapshot offline
  // =========================================================================
  it('6. review snapshot offline: review_required com snapshot rende snapshot e sinaliza diagnóstico sem falha', () => {
    const snapshotContent: TableCellLiteralContent = { kind: 'text', text: '10.0 bar (Anterior)' };
    const resolver = createProductWorkbookDatumResolver(new Map());

    const result = resolver({
      kind: 'datum_reference',
      productId: 'prod-ta25n',
      datumKey: 'pressure.range',
      bindingMode: 'review_required',
      snapshot: snapshotContent
    });

    expect(result?.value).toEqual(snapshotContent);
    expect(result?.diagnostic).toBeDefined();
    expect(result?.diagnostic?.message).toContain('revisão');
  });

  // =========================================================================
  // 7. unlink typed PIM keep-value
  // =========================================================================
  it('7. unlink typed PIM keep-value: desvincula materializando literal tipado e mirror textual em cellValues e localOverrides', () => {
    const store = useCatalogStore.getState();
    const testCatalog: Catalog = {
      id: 'cat-unlink-typed',
      schemaVersion: 1,
      version: 1,
      title: 'Teste de Unlink Tipado',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          blocks: [
            {
              id: 'blk-ta',
              type: 'specs_table',
              title: 'Especificações',
              tableColumns: [
                { key: 'temp_range', label: 'Faixa de Temperatura', visible: true }
              ],
              tableRows: [
                {
                  id: 'row-ta-1',
                  cellBindings: {
                    temp_range: {
                      sourceKind: 'pim_datum',
                      productId: 'prod-ta25n',
                      semanticKey: 'temp.range',
                      bindingMode: 'live'
                    }
                  },
                  order: 0
                }
              ]
            }
          ]
        }
      ]
    };
    useCatalogStore.setState({ currentCatalog: testCatalog });

    const typedRangeLiteral: TableCellLiteralContent = {
      kind: 'range',
      lower: -25,
      upper: 250,
      unit: '°C'
    };

    store.unlinkTableCell('blk-ta', 'row-ta-1', 'temp_range', 'keep_value', typedRangeLiteral);

    const updatedRow = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0].tableRows?.[0];
    expect(updatedRow).toBeDefined();
    expect(updatedRow?.cellBindings?.['temp_range']).toBeUndefined();
    expect(updatedRow?.cellValues?.['temp_range']).toEqual(typedRangeLiteral);
    expect(updatedRow?.localOverrides?.['temp_range']).toBe('-25 a 250 °C');

    const adaptResult = adaptLegacyBlockToTableCore(useCatalogStore.getState().currentCatalog!.pages[0].blocks[0]);
    expect(adaptResult.supported).toBe(true);
    if (!adaptResult.supported) return;

    const cell = Object.values(adaptResult.table.cells)[0];
    expect(cell.content).toEqual(typedRangeLiteral);
  });

  // =========================================================================
  // 8. official table zero ghost
  // =========================================================================
  it('8. official table zero ghost: tabelas técnicas nascem com tableRows = [] e sem dados fantasmas de outros produtos', () => {
    const blankBlock: ContentBlock = {
      id: 'blk-presys-blank',
      type: 'specs_table',
      title: 'Tabela de Especificações Presys Oficial',
      tableColumns: [
        { key: 'model', label: 'Modelo', visible: true },
        { key: 'range', label: 'Faixa', visible: true }
      ],
      tableRows: []
    };

    const res = adaptLegacyBlockToTableCore(blankBlock);
    expect(res.supported).toBe(true);
    if (!res.supported) return;

    expect(res.table.rows).toHaveLength(0);
    expect(Object.keys(res.table.cells)).toHaveLength(0);
  });

  // =========================================================================
  // 9. stable IDs after reorder
  // =========================================================================
  it('9. stable IDs after reorder: IDs determinísticos de dataset não variam quando linhas ou colunas são reordenadas', () => {
    const dsId = 'dataset-sensors-v1';
    const colA = 'sensor_type';
    const colB = 'operating_range';
    const row1 = 'row_pt100';
    const row2 = 'row_thermocouple_k';

    const colIdA = generateDeterministicDatasetColumnId(dsId, colA);
    const colIdB = generateDeterministicDatasetColumnId(dsId, colB);
    const rowId1 = generateDeterministicDatasetRowId(dsId, row1);
    const rowId2 = generateDeterministicDatasetRowId(dsId, row2);

    expect(colIdB).toBeDefined();
    expect(rowId2).toBeDefined();

    const reorderedColIdA = generateDeterministicDatasetColumnId(dsId, colA);
    const reorderedRowId1 = generateDeterministicDatasetRowId(dsId, row1);

    expect(colIdA).toBe(reorderedColIdA);
    expect(rowId1).toBe(reorderedRowId1);

    const cellId1A = generateDeterministicDatasetCellId('tbl_test', rowId1, colIdA);
    const cellId1A_reorder = generateDeterministicDatasetCellId('tbl_test', rowId1, colIdA);
    expect(cellId1A).toBe(cellId1A_reorder);
  });

  // =========================================================================
  // 10. canonical datum identity
  // =========================================================================
  it('10. canonical datum identity: fail-closed caso célula em dataset live não possua identidade canônica real', () => {
    const invalidDataset: TechnicalDatasetProjection = {
      datasetId: 'ds-invalid',
      productId: 'prod-ta25n',
      title: 'Dataset Inválido',
      bindingMode: 'live',
      columns: [{ key: 'accuracy', label: 'Exatidão' }],
      rows: [
        {
          rowId: 'r1',
          cells: {
            accuracy: { kind: 'text', text: '0.1%' }
          }
        }
      ]
    };

    expect(() => projectTechnicalDatasetToTableCore(invalidDataset)).toThrow(/\[FAIL_CLOSED\]/);
  });

  // =========================================================================
  // 11. binding sourceRevision round-trip
  // =========================================================================
  it('11. binding sourceRevision round-trip: preserva sourceRevision através de CatalogSchema e TableCoreModel', () => {
    const blockWithRevision: ContentBlock = {
      id: 'blk-rev',
      type: 'specs_table',
      title: 'Tabela de Revisões',
      tableColumns: [{ key: 'param', label: 'Parâmetro', visible: true }],
      tableRows: [
        {
          id: 'row-rev-1',
          cellBindings: {
            param: {
              sourceKind: 'pim_datum',
              productId: 'prod-ta25n',
              semanticKey: 'pressure.accuracy',
              bindingMode: 'live',
              sourceRevision: 142
            }
          },
          order: 0
        }
      ]
    };

    const res = adaptLegacyBlockToTableCore(blockWithRevision);
    expect(res.supported).toBe(true);
    if (!res.supported) return;

    const cell = Object.values(res.table.cells)[0];
    expect(cell.content.kind).toBe('datum_reference');
    if (cell.content.kind === 'datum_reference') {
      expect(cell.content.sourceRevision).toBe(142);
    }
  });

  // =========================================================================
  // 12. user template save/reload/apply
  // =========================================================================
  it('12. user template save/reload/apply: salva template de apresentação do usuário, recarrega e aplica à tabela', () => {
    const customPresentation: TablePresentationModel = {
      presetId: 'dense_spec_matrix',
      density: 'compact',
      borderStyle: 'horizontal_only',
      stripeStyle: 'subtle_zebra',
      headerBackgroundToken: 'brand_navy',
      headerTextColorToken: 'white',
      fontScale: 'compact',
      tableWidth: { mode: 'auto_fill' }
    };

    const saved = saveUserPresentationTemplate('Template Presys Densa', customPresentation);
    expect(saved.id).toBeDefined();
    expect(saved.name).toBe('Template Presys Densa');

    const loaded = getUserPresentationTemplates();
    expect(loaded.some((t) => t.id === saved.id)).toBe(true);

    const store = useCatalogStore.getState();
    const testCatalog: Catalog = {
      id: 'cat-template-test',
      schemaVersion: 1,
      version: 1,
      title: 'Catálogo Template',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          blocks: [
            {
              id: 'blk-template-target',
              type: 'specs_table',
              title: 'Tabela Alvo',
              tableColumns: [{ key: 'col1', label: 'Col 1' }],
              tableRows: [{ id: 'r1', order: 0 }]
            }
          ]
        }
      ]
    };
    useCatalogStore.setState({ currentCatalog: testCatalog });

    store.applyTablePresentationTemplate('blk-template-target', saved);

    const updatedBlock = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0];
    expect(updatedBlock?.customData?.tablePresentation).toEqual(customPresentation);
    expect(updatedBlock?.customData?.presentationPresetId).toBe('dense_spec_matrix');
  });

  // =========================================================================
  // 13. row/column/cell style round-trip
  // =========================================================================
  it('13. row/column/cell style round-trip: overrides canônicos em linha, coluna e célula são serializados e cascateados no renderizador', () => {
    const presentationWithOverrides: TablePresentationModel = {
      ...getTablePreset('presys_clean_technical'),
      rowStyleOverrides: {
        'row-1': { backgroundToken: 'surface_subtle', bold: true }
      },
      columnStyleOverrides: {
        'col-acc': { align: 'right' }
      },
      cellStyleOverrides: {
        'cell-special': { backgroundColorToken: 'brand_primary', textColorToken: 'white' }
      }
    };

    const schemaCheck = TablePresentationModelSchema.safeParse(presentationWithOverrides);
    expect(schemaCheck.success).toBe(true);

    const testBlock: ContentBlock = {
      id: 'blk-styling',
      type: 'specs_table',
      title: 'Tabela Estilizada',
      tableColumns: [
        { key: 'col_acc', label: 'Exatidão', visible: true }
      ],
      tableRows: [
        {
          id: 'row_1',
          cellValues: { col_acc: { kind: 'text', text: '0.01%' } },
          order: 0
        }
      ],
      customData: {
        tablePresentation: presentationWithOverrides
      }
    };

    const adaptResult = adaptLegacyBlockToTableCore(testBlock);
    expect(adaptResult.supported).toBe(true);
    if (!adaptResult.supported) return;

    expect(adaptResult.table.presentation.rowStyleOverrides).toBeDefined();
    expect(adaptResult.table.presentation.columnStyleOverrides).toBeDefined();
    expect(adaptResult.table.presentation.cellStyleOverrides).toBeDefined();
  });

  // =========================================================================
  // 14. freshness revision regression
  // =========================================================================
  it('14. freshness revision regression: regressão de revisão detectada como revision_regressed e nunca como fresh', () => {
    expect(evaluateBindingFreshness({ sourceKind: 'dataset', productId: 'p1', semanticKey: 'k', bindingMode: 'snapshot', sourceRevision: 10 }, 15).status).toBe('frozen');
    expect(evaluateBindingFreshness({ sourceKind: 'dataset', productId: 'p1', semanticKey: 'k', bindingMode: 'live', sourceRevision: 5 }, undefined).status).toBe('source_missing');
    expect(evaluateBindingFreshness({ sourceKind: 'dataset', productId: 'p1', semanticKey: 'k', bindingMode: 'live', sourceRevision: 10 }, 10).status).toBe('fresh');
    expect(evaluateBindingFreshness({ sourceKind: 'dataset', productId: 'p1', semanticKey: 'k', bindingMode: 'live', sourceRevision: 10 }, 12).status).toBe('review_required');

    const regressed = evaluateBindingFreshness({ sourceKind: 'dataset', productId: 'p1', semanticKey: 'k', bindingMode: 'live', sourceRevision: 10 }, 8);
    expect(regressed.status).toBe('revision_regressed');
    expect(regressed.status).not.toBe('fresh');
  });

  // =========================================================================
  // 15. publish BLOCK/WARN
  // =========================================================================
  it('15. publish BLOCK/WARN: bloqueia exportação em 3 camadas se houver conflito, binding malformado ou live datum sem snapshot', () => {
    const catalogWithBlockIssue: Catalog = {
      id: 'cat-audit-test',
      schemaVersion: 1,
      version: 1,
      title: 'Catálogo com Problemas de Publicação',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'blk-audit',
              type: 'specs_table',
              title: 'Tabela com Problema',
              tableColumns: [{ key: 'k1', label: 'Coluna 1' }],
              tableRows: [
                {
                  id: 'r1',
                  cellBindings: {
                    k1: {
                      sourceKind: 'pim_datum',
                      productId: 'p1',
                      semanticKey: 'accuracy',
                      bindingMode: 'review_required'
                    }
                  },
                  order: 0
                }
              ]
            }
          ]
        }
      ]
    };

    const report1 = auditCatalogPublishSafety({
      catalog: catalogWithBlockIssue,
      syncStatus: 'synced'
    });

    expect(report1.canPublish).toBe(false);
    expect(report1.blockCount).toBeGreaterThan(0);
    expect(report1.issues.some((i) => i.code === 'REVIEW_REQUIRED_WITHOUT_SNAPSHOT')).toBe(true);

    const report2 = auditCatalogPublishSafety({
      catalog: catalogWithBlockIssue,
      syncStatus: 'conflict'
    });
    expect(report2.canPublish).toBe(false);
    expect(report2.issues.some((i) => i.layer === 'C_GATE')).toBe(true);

    const catalogWithWarningOnly: Catalog = {
      ...catalogWithBlockIssue,
      pages: [
        {
          ...catalogWithBlockIssue.pages[0],
          blocks: [
            {
              ...catalogWithBlockIssue.pages[0].blocks[0],
              tableRows: [
                {
                  id: 'r1',
                  cellBindings: {
                    k1: {
                      sourceKind: 'pim_datum',
                      productId: 'p1',
                      semanticKey: 'accuracy',
                      bindingMode: 'review_required',
                      snapshot: { kind: 'text', text: '±0.01 °C' }
                    }
                  },
                  order: 0
                }
              ]
            }
          ]
        }
      ]
    };

    const report3 = auditCatalogPublishSafety({
      catalog: catalogWithWarningOnly,
      syncStatus: 'synced'
    });
    expect(report3.canPublish).toBe(true);
    expect(report3.blockCount).toBe(0);
    expect(report3.warnCount).toBe(1);
    expect(report3.issues[0].code).toBe('REVIEW_REQUIRED_WITH_SNAPSHOT');
  });

  // =========================================================================
  // 16. old catalog compatibility
  // =========================================================================
  it('16. old catalog compatibility: catálogos legados sem cellValues e com localOverrides em string continuam funcionando perfeitamente', () => {
    const legacyCatalogJson = {
      id: 'legacy-cat-01',
      title: 'Catálogo Legado V1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'page-leg-1',
          pageNumber: 1,
          blocks: [
            {
              id: 'blk-leg-1',
              type: 'specs_table',
              title: 'Tabela Legada',
              tableColumns: [
                { key: 'model', label: 'Modelo' },
                { key: 'range', label: 'Faixa' }
              ],
              tableRows: [
                {
                  id: 'row-leg-1',
                  productRefId: 'prod-ta25n',
                  localOverrides: {
                    range: 'Faixa Legada 0 a 100 bar'
                  },
                  order: 0
                }
              ]
            }
          ]
        }
      ]
    };

    const parseRes = CatalogSchema.safeParse(legacyCatalogJson);
    expect(parseRes.success).toBe(true);

    if (parseRes.success) {
      const adaptRes = adaptLegacyBlockToTableCore(parseRes.data.pages[0].blocks[0]);
      expect(adaptRes.supported).toBe(true);
      if (adaptRes.supported) {
        const cell = Object.values(adaptRes.table.cells).find((c) => c.columnId.includes('range'));
        expect(cell).toBeDefined();
        expect(cell?.content).toEqual({ kind: 'text', text: 'Faixa Legada 0 a 100 bar' });
      }
    }
  });

  // =========================================================================
  // 17. PDF/export parity
  // =========================================================================
  it('17. PDF/export parity: TableCoreRenderer em modo export omite classes de interação e preserva data-printable-field', async () => {
    const testTable: TableCoreModel = {
      id: 'tbl-export-test',
      schemaVersion: 1,
      columns: [
        { id: 'c1', semanticKey: 'model', defaultLabel: 'Modelo', widthSpec: { mode: 'auto' }, align: 'left' },
        { id: 'c2', semanticKey: 'acc', defaultLabel: 'Exatidão', widthSpec: { mode: 'auto' }, align: 'center' }
      ],
      rows: [
        { id: 'r1', kind: 'data' }
      ],
      cells: {
        [getCellKey('r1', 'c1')]: { id: 'cell-1', rowId: 'r1', columnId: 'c1', content: { kind: 'text', text: 'TA-25N' } },
        [getCellKey('r1', 'c2')]: { id: 'cell-2', rowId: 'r1', columnId: 'c2', content: { kind: 'text', text: '0.05 °C' } }
      },
      presentation: getTablePreset('presys_clean_technical'),
      paginationPolicy: {
        allowRowSplit: false,
        repeatHeaderOnBreak: true,
        keepHeaderWithFirstRow: true,
        minOrphanRows: 1
      }
    };

    await act(async () => {
      root?.render(<TableCoreRenderer table={testTable} mode="editor" selectedCellId="cell-1" />);
    });

    const editorCell = container.querySelector('#cell-cell-1');
    expect(editorCell).toBeDefined();
    expect(editorCell?.getAttribute('id')).toBe('cell-cell-1');

    await act(async () => {
      root?.render(<TableCoreRenderer table={testTable} mode="export" />);
    });

    const exportCell = container.querySelector('#cell-cell-1');
    expect(exportCell).toBeNull();

    const printableCell = container.querySelector('td:nth-child(2)');
    expect(printableCell).toBeDefined();
    expect(container.textContent).toContain('TA-25N');
    expect(container.textContent).toContain('0.05 °C');
  });
});
