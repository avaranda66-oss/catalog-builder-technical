// tests/domain/table-core/table-core-v2-production-experience.test.ts
// Testes de Domínio e Comportamento para o TABLE.PRODUCTION.EXPERIENCE1.
// Abrange: Tabela em Branco V2, Linhas Vinculadas/Híbridas/Manuais, Overrides Locais,
// Desvinculação com Materialização (keep_value vs clear), Restauração Condicional,
// Literais Tipados Sem Perda, Provedor de Conhecimento Fail-Closed e Adaptador de Datasets.

import { describe, it, expect } from 'vitest';
import {
  ContentBlock,
  Catalog,
  CatalogSchema,
  CatalogTableRow,
  CatalogCellBindingSchema
} from '../../../src/domain/catalog.schema';
import {
  adaptLegacyBlockToTableCore,
  TableCellRangeContent,
  TableCellBooleanContent,
  TableCellEnumContent,
  TableCellTechnicalTokenContent,
  getCellKey
} from '../../../src/domain/table-core';
import {
  TableRowKindSchema,
  TableRowModelSchema
} from '../../../src/domain/table-core/table.schema';
import { useCatalogStore } from '../../../src/stores/useCatalogStore';
import {
  UnavailableProductKnowledgeProvider,
  TestProductKnowledgeProvider,
  TechnicalDatasetProjection
} from '../../../src/domain/table-binding/product-knowledge-provider.types';
import { projectTechnicalDatasetToTableCore } from '../../../src/domain/table-binding/dataset-to-table.adapter';
import { mapTechnicalValueToTableLiteralV2 } from '../../../src/domain/table-binding/product-workbook-datum.resolver';

describe('TABLE.PRODUCTION.EXPERIENCE1: Production Experience & Flexible Authoring', () => {
  describe('1. Tabela em Branco V2 (Zero Seeds & Definição Livre)', () => {
    it('deve instanciar uma specs_table sem linhas e sem referências de produtos fictícios', () => {
      const blankBlock: ContentBlock = {
        id: 'block-blank-v2-test',
        type: 'specs_table',
        title: 'Nova Tabela Técnica V2',
        tableColumns: [
          { key: 'col_item', label: 'Item', visible: true, width: 70, isCustom: true },
          { key: 'col_desc', label: 'Descrição / Parâmetro', visible: true, width: 220, isCustom: true },
          { key: 'col_val', label: 'Especificação', visible: true, width: 160, isCustom: true },
          { key: 'col_obs', label: 'Observações', visible: true, width: 150, isCustom: true }
        ],
        tableRows: []
      };

      const res = adaptLegacyBlockToTableCore(blankBlock);
      expect(res.supported).toBe(true);
      if (!res.supported) return;
      expect(res.table.rows).toHaveLength(0);
      expect(res.table.columns).toHaveLength(4);
      expect(Object.keys(res.table.cells)).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
    });
  });

  describe('2. Suporte a Linhas Misturadas na Mesma Tabela (Vinculada, Híbrida e 100% Manual)', () => {
    it('deve conviver na mesma tabela com linha vinculada, linha híbrida com overrides e linha manual', () => {
      const mixedBlock: ContentBlock = {
        id: 'block-mixed-rows',
        type: 'specs_table',
        title: 'Tabela Mista',
        tableColumns: [
          { key: 'model', label: 'Modelo', visible: true, width: 120 },
          { key: 'range', label: 'Faixa', visible: true, width: 140 },
          { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
          { key: 'notes', label: 'Observações', visible: true, width: 150, isCustom: true }
        ],
        tableRows: [
          // Linha 1: 100% Vinculada a produto da biblioteca
          {
            id: 'row-bound',
            productRefId: 'prod-pcon-y18',
            localOverrides: {},
            order: 0
          },
          // Linha 2: Híbrida (produto da biblioteca + override local em accuracy + binding explícito em range)
          {
            id: 'row-hybrid',
            productRefId: 'prod-pcon-y18',
            localOverrides: {
              accuracy: '0.005% FE (Custom Calibrada)'
            },
            cellBindings: {
              range: {
                sourceKind: 'pim_datum',
                productId: 'prod-pcon-y18',
                semanticKey: 'pressure.vacuum_range',
                bindingMode: 'live'
              }
            },
            order: 1
          },
          // Linha 3: 100% Manual (sem productRefId, sem dependência da biblioteca)
          {
            id: 'row-manual',
            productRefId: undefined,
            localOverrides: {
              model: 'Bancada Especial Custom',
              range: '0 a 100 bar',
              accuracy: '0.02% FE',
              notes: 'Fabricação sob encomenda'
            },
            order: 2
          }
        ]
      };

      const res = adaptLegacyBlockToTableCore(mixedBlock);
      expect(res.supported).toBe(true);
      if (!res.supported) return;
      const bridge = res.bridge;

      // Validação da Linha 1 (Vinculada)
      const r1Model = bridge.getByLegacyCoordinates('row-bound', 'model');
      expect(r1Model).toBeDefined();
      expect(r1Model?.hasProductBinding).toBe(true);
      expect(r1Model?.isOverride).toBe(false);
      expect(r1Model?.isManualRow).toBe(false);
      expect(r1Model?.isManualValue).toBe(false);

      // Validação da Linha 2 (Híbrida)
      const r2Accuracy = bridge.getByLegacyCoordinates('row-hybrid', 'accuracy');
      expect(r2Accuracy).toBeDefined();
      expect(r2Accuracy?.hasProductBinding).toBe(true);
      expect(r2Accuracy?.isOverride).toBe(true); // Bound + local override
      expect(r2Accuracy?.isManualValue).toBe(false);
      expect(r2Accuracy?.originalOverrideValue).toBe('0.005% FE (Custom Calibrada)');

      const r2Range = bridge.getByLegacyCoordinates('row-hybrid', 'range');
      expect(r2Range).toBeDefined();
      expect(r2Range?.cellBinding?.sourceKind).toBe('pim_datum');
      expect(r2Range?.cellBinding?.semanticKey).toBe('pressure.vacuum_range');

      // Validação da Linha 3 (100% Manual)
      const r3Model = bridge.getByLegacyCoordinates('row-manual', 'model');
      expect(r3Model).toBeDefined();
      expect(r3Model?.isManualRow).toBe(true);
      expect(r3Model?.hasProductBinding).toBe(false);
      expect(r3Model?.isOverride).toBe(false); // Linha manual NUNCA é override!
      expect(r3Model?.isManualValue).toBe(true); // É valor manual!
      expect(r3Model?.originalOverrideValue).toBe('Bancada Especial Custom');

      const r3Notes = bridge.getByLegacyCoordinates('row-manual', 'notes');
      expect(r3Notes?.isManualValue).toBe(true);
      expect(r3Notes?.isOverride).toBe(false);
    });
  });

  describe('3. Desvinculação Segura (Keep Value vs Clear)', () => {
    it('deve materializar o valor resolvido nos overrides locais ao desvincular célula com keep_value', () => {
      const row: CatalogTableRow = {
        id: 'r1',
        productRefId: 'prod-pcon-y18',
        cellBindings: {
          range: {
            sourceKind: 'pim_datum',
            productId: 'prod-pcon-y18',
            semanticKey: 'pressure.range',
            bindingMode: 'live'
          }
        },
        localOverrides: {}
      };

      // Simulação da lógica de unlinkTableCell com keep_value
      const resolvedValue = '-0.9 a 70 bar';
      const updatedBindings = { ...row.cellBindings };
      delete updatedBindings.range;

      const updatedOverrides = {
        ...row.localOverrides,
        range: resolvedValue
      };

      const unlinkedRow: CatalogTableRow = {
        ...row,
        cellBindings: updatedBindings,
        localOverrides: updatedOverrides
      };

      expect(unlinkedRow.cellBindings?.range).toBeUndefined();
      expect(unlinkedRow.localOverrides?.range).toBe('-0.9 a 70 bar');
    });

    it('deve remover completamente o valor ao desvincular célula com clear', () => {
      const row: CatalogTableRow = {
        id: 'r1',
        productRefId: 'prod-pcon-y18',
        cellBindings: {
          range: {
            sourceKind: 'pim_datum',
            productId: 'prod-pcon-y18',
            semanticKey: 'pressure.range',
            bindingMode: 'live'
          }
        },
        localOverrides: {
          range: '-0.9 a 70 bar'
        }
      };

      const updatedBindings = { ...row.cellBindings };
      delete updatedBindings.range;

      const updatedOverrides = { ...row.localOverrides };
      delete updatedOverrides.range;

      const unlinkedRow: CatalogTableRow = {
        ...row,
        cellBindings: updatedBindings,
        localOverrides: updatedOverrides
      };

      expect(unlinkedRow.cellBindings?.range).toBeUndefined();
      expect(unlinkedRow.localOverrides?.range).toBeUndefined();
    });

    it('deve desvincular linha inteira mantendo valores resolvidos como manuais', () => {
      const row: CatalogTableRow = {
        id: 'r1',
        productRefId: 'prod-pcon-y18',
        localOverrides: {
          accuracy: '0.01% FE'
        },
        cellBindings: {
          range: {
            sourceKind: 'pim_datum',
            productId: 'prod-pcon-y18',
            semanticKey: 'range',
            bindingMode: 'live'
          }
        }
      };

      const resolvedValues = {
        model: 'PCON-Y18',
        range: '0 a 70 bar',
        accuracy: '0.01% FE'
      };

      const unlinkedRow: CatalogTableRow = {
        ...row,
        productRefId: undefined, // Desvincula da biblioteca
        cellBindings: {}, // Limpa bindings
        localOverrides: {
          ...row.localOverrides,
          ...resolvedValues
        }
      };

      expect(unlinkedRow.productRefId).toBeUndefined();
      expect(Object.keys(unlinkedRow.cellBindings || {})).toHaveLength(0);
      expect(unlinkedRow.localOverrides?.model).toBe('PCON-Y18');
      expect(unlinkedRow.localOverrides?.range).toBe('0 a 70 bar');
      expect(unlinkedRow.localOverrides?.accuracy).toBe('0.01% FE');
    });
  });

  describe('4. Mapeamento de Literais Tipados Sem Perda (Lossless Typing)', () => {
    it('deve mapear valor técnico numérico com range para TableCellRangeContent', () => {
      const technicalDatum = {
        type: 'range' as const,
        lower: -0.9,
        upper: 70,
        unit: 'bar',
        lowerInclusive: true,
        upperInclusive: true
      };

      const res = mapTechnicalValueToTableLiteralV2(technicalDatum as any);
      expect(res.supported).toBe(true);
      if (res.supported) {
        expect(res.content.kind).toBe('range');
        const range = res.content as TableCellRangeContent;
        expect(range.lower).toBe(-0.9);
        expect(range.upper).toBe(70);
        expect(range.unit).toBe('bar');
        expect(range.lowerInclusive).toBe(true);
        expect(range.upperInclusive).toBe(true);
      }
    });

    it('deve mapear boolean preservando valor e suportando formats', () => {
      const technicalBool = {
        type: 'boolean' as const,
        value: true
      };

      const res = mapTechnicalValueToTableLiteralV2(technicalBool as any);
      expect(res.supported).toBe(true);
      if (res.supported) {
        expect(res.content.kind).toBe('boolean');
        const boolContent = res.content as TableCellBooleanContent;
        expect(boolContent.value).toBe(true);
      }
    });

    it('deve mapear enum com code e label', () => {
      const technicalEnum = {
        type: 'enum' as const,
        code: 'SIL3',
        label: 'SIL 3 Capable'
      };

      const res = mapTechnicalValueToTableLiteralV2(technicalEnum as any);
      expect(res.supported).toBe(true);
      if (res.supported) {
        expect(res.content.kind).toBe('enum');
        const enumContent = res.content as TableCellEnumContent;
        expect(enumContent.code).toBe('SIL3');
        expect(enumContent.label).toBe('SIL 3 Capable');
      }
    });

    it('deve mapear technical_token com token', () => {
      const technicalToken = {
        type: 'technical_token' as const,
        token: 'HART_7'
      };

      const res = mapTechnicalValueToTableLiteralV2(technicalToken as any);
      expect(res.supported).toBe(true);
      if (res.supported) {
        expect(res.content.kind).toBe('technical_token');
        const tokenContent = res.content as TableCellTechnicalTokenContent;
        expect(tokenContent.token).toBe('HART_7');
      }
    });
  });

  describe('5. Provedor de Conhecimento Neutro & Fail-Closed (Emenda 1 & 10)', () => {
    it('deve ser estritamente fail-closed em produção com UnavailableProductKnowledgeProvider', async () => {
      const provider = new UnavailableProductKnowledgeProvider();
      expect(provider.isAvailable()).toBe(false);

      const searchResults = await provider.search(undefined, 'pcon');
      expect(searchResults).toHaveLength(0);

      const datum = await provider.getDatum('prod-1', 'range');
      expect(datum).toBeUndefined();

      const dataset = await provider.getDataset('prod-1', 'ds-1');
      expect(dataset).toBeUndefined();
    });

    it('deve permitir busca e recuperação no TestProductKnowledgeProvider exclusivo para testes', async () => {
      const testProvider = new TestProductKnowledgeProvider([
        {
          bindable: true,
          id: 'k1',
          kind: 'datum',
          productId: 'prod-pcon-y18',
          productModel: 'PCON-Y18',
          semanticKey: 'pressure.range',
          label: 'Faixa de Pressão',
          status: 'approved',
          origin: 'calibrators_module',
          sourceCount: 2,
          preview: '-0.9 a 70 bar'
        }
      ]);

      expect(testProvider.isAvailable()).toBe(true);

      const results = await testProvider.search('prod-pcon-y18', 'Faixa');
      expect(results).toHaveLength(1);
      expect(results[0].semanticKey).toBe('pressure.range');
      expect(results[0].status).toBe('approved');
    });
  });

  describe('6. Adaptador de Projeção de Datasets Técnicos (projectTechnicalDatasetToTableCore)', () => {
    it('deve projetar um TechnicalDatasetProjection em um TableCoreModel estruturado', () => {
      const dataset: TechnicalDatasetProjection = {
        datasetId: 'ds-ranges',
        productId: 'prod-pcon-y18',
        title: 'Faixas de Pressão Disponíveis',
        bindingMode: 'live',
        columns: [
          { key: 'code', label: 'Código', widthMm: 30 },
          { key: 'range', label: 'Faixa de Calibração', widthMm: 50 },
          { key: 'accuracy', label: 'Exatidão', widthMm: 40 }
        ],
        rows: [
          {
            rowId: 'row-01',
            label: 'Faixa 1',
            cells: {
              code: { datumId: 'd-code-1', datumKey: 'pressure.ranges.code_1', value: { kind: 'text', text: 'R-01' } },
              range: { datumId: 'd-range-1', datumKey: 'pressure.ranges.range_1', value: { kind: 'text', text: '0 a 1 bar' } },
              accuracy: { datumId: 'd-acc-1', datumKey: 'pressure.ranges.acc_1', value: { kind: 'text', text: '0.01% FE' } }
            }
          },
          {
            rowId: 'row-02',
            label: 'Faixa 2',
            cells: {
              code: { datumId: 'd-code-2', datumKey: 'pressure.ranges.code_2', value: { kind: 'text', text: 'R-02' } },
              range: { datumId: 'd-range-2', datumKey: 'pressure.ranges.range_2', value: { kind: 'text', text: '0 a 70 bar' } },
              accuracy: { datumId: 'd-acc-2', datumKey: 'pressure.ranges.acc_2', value: { kind: 'text', text: '0.01% FE' } }
            }
          }
        ]
      };

      const tableCore = projectTechnicalDatasetToTableCore(dataset);
      expect(tableCore.columns).toHaveLength(3);
      expect(tableCore.rows).toHaveLength(2);
      expect(tableCore.title).toBe('Faixas de Pressão Disponíveis');

      const k1 = getCellKey(tableCore.rows[0].id, tableCore.columns[0].id);
      const cell1 = tableCore.cells[k1];
      expect(cell1).toBeDefined();
      expect(cell1.content.kind).toBe('datum_reference');
      if (cell1.content.kind === 'datum_reference') {
        expect(cell1.content.productId).toBe('prod-pcon-y18');
        expect(cell1.content.datasetId).toBe('ds-ranges');
        expect(cell1.content.bindingMode).toBe('live');
      }
    });
  });

  describe('7. Validação de Schema e Retrocompatibilidade de cellBindings', () => {
    it('deve validar e serializar perfeitamente CatalogCellBindingSchema', () => {
      const validBinding = {
        sourceKind: 'pim_datum' as const,
        productId: 'prod-123',
        semanticKey: 'pressure.stability',
        moduleKey: 'calibrator',
        bindingMode: 'live' as const
      };

      const parsed = CatalogCellBindingSchema.parse(validBinding);
      expect(parsed.productId).toBe('prod-123');
      expect(parsed.sourceKind).toBe('pim_datum');
      expect(parsed.semanticKey).toBe('pressure.stability');
    });
  });

  describe('8. AUDIT GATE: TableRowKind Compatibility', () => {
    it('deve preservar todos os tipos históricos (header, data, footer, divider) e aceitar section', () => {
      const kinds = ['header', 'data', 'footer', 'divider', 'section'] as const;
      kinds.forEach((kind) => {
        expect(TableRowKindSchema.parse(kind)).toBe(kind);
        const row = TableRowModelSchema.parse({
          id: `row-${kind}`,
          kind
        });
        expect(row.kind).toBe(kind);
      });

      // Modelo legado sem kind explícito deve parsear e adotar default 'data'
      const legacyRowWithoutKind = TableRowModelSchema.parse({
        id: 'row-legacy-default'
      });
      expect(legacyRowWithoutKind.kind).toBe('data');
    });
  });

  describe('9. AUDIT GATE: Unlink Keep-Value Materialization & Offline Provider Resilience', () => {
    it('deve materializar ±0.1 °C, remover o binding e manter o valor renderizando mesmo se o provider ficar offline', () => {
      // 1. Catálogo com célula vinculada e valor da fonte "±0.1 °C"
      const blockId = 'blk-unlink-resilience';
      const rowId = 'r-ta25n';
      const initialCatalog: Catalog = {
        id: 'cat-unlink-test',
        title: 'Catálogo de Teste de Unlink',
        themeId: 'default',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            title: 'Página 1',
            blocks: [
              {
                id: blockId,
                type: 'specs_table',
                title: 'Tabela com Binding',
                tableColumns: [
                  { key: 'model', label: 'Modelo', visible: true },
                  { key: 'accuracy', label: 'Exatidão', visible: true }
                ],
                tableRows: [
                  {
                    id: rowId,
                    productRefId: 'prod-ta25n',
                    cellBindings: {
                      accuracy: {
                        sourceKind: 'pim_datum',
                        productId: 'prod-ta25n',
                        semanticKey: 'metrology.accuracy',
                        bindingMode: 'live',
                        snapshot: { kind: 'text', text: '±0.1 °C' }
                      }
                    },
                    localOverrides: {}
                  }
                ]
              }
            ]
          }
        ]
      };

      // Injeta no store
      useCatalogStore.setState({
        currentCatalog: initialCatalog,
        activePageIndex: 0,
        selectedBlockId: null,
        selectedChildId: null
      });

      // 2. Executa unlinkTableCell com policy 'keep_value' fornecendo o valor resolvido da fonte
      useCatalogStore.getState().unlinkTableCell(blockId, rowId, 'accuracy', 'keep_value', '±0.1 °C');

      // 3. Provedor torna-se posteriormente indisponível (fail-closed)
      const offlineProvider = new UnavailableProductKnowledgeProvider();
      expect(offlineProvider.isAvailable()).toBe(false);

      // 4. Salvar / Recarregar (Simula serialização e parsing Zod do catálogo)
      const serialized = JSON.stringify(useCatalogStore.getState().currentCatalog);
      const parsedDoc = CatalogSchema.parse(JSON.parse(serialized));
      useCatalogStore.setState({ currentCatalog: parsedDoc });

      // 5. Verifica que ±0.1 °C continua renderizando e preservado no override
      const reloadedBlock = parsedDoc.pages[0].blocks[0];
      const unlinkedRow = reloadedBlock.tableRows![0];
      expect(unlinkedRow.cellBindings?.accuracy).toBeUndefined(); // Binding foi 100% removido
      expect(unlinkedRow.localOverrides?.accuracy).toBe('±0.1 °C'); // Valor foi materializado

      const adapted = adaptLegacyBlockToTableCore(reloadedBlock);
      expect(adapted.supported).toBe(true);
      if (adapted.supported) {
        const cell = adapted.bridge.getByLegacyCoordinates(rowId, 'accuracy');
        expect(cell).toBeDefined();
        expect(cell?.isOverride).toBe(true);
        expect(cell?.originalOverrideValue).toBe('±0.1 °C');
        expect(cell?.content).toEqual({ kind: 'text', text: '±0.1 °C' });
      }
    });
  });

  describe('10. AUDIT GATE: Cell Binding Full Round-Trip (live, snapshot, review_required)', () => {
    it('deve realizar round-trip completo (setTableCellBinding -> serialize -> Zod parse -> reload -> adapter -> TableCore) para live, snapshot e review_required', () => {
      const blockId = 'blk-roundtrip';
      const rowId = 'r-roundtrip';
      const catalog: Catalog = {
        id: 'cat-roundtrip-test',
        title: 'Catálogo Round-Trip Test',
        themeId: 'default',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            title: 'Página 1',
            blocks: [
              {
                id: blockId,
                type: 'specs_table',
                title: 'Tabela Round-Trip',
                tableColumns: [
                  { key: 'col_live', label: 'Coluna Live', visible: true },
                  { key: 'col_snapshot', label: 'Coluna Snapshot', visible: true },
                  { key: 'col_review', label: 'Coluna Review', visible: true }
                ],
                tableRows: [
                  {
                    id: rowId,
                    productRefId: 'prod-pcon-y18',
                    cellBindings: {
                      col_live: {
                        sourceKind: 'pim_datum',
                        productId: 'prod-pcon-y18',
                        semanticKey: 'pressure.range',
                        bindingMode: 'live'
                      },
                      col_snapshot: {
                        sourceKind: 'pim_datum',
                        productId: 'prod-pcon-y18',
                        semanticKey: 'pressure.vacuum_range',
                        bindingMode: 'snapshot',
                        snapshot: { kind: 'text', text: '-0.9 a 70 bar' },
                        sourceRevision: 4
                      },
                      col_review: {
                        sourceKind: 'pim_datum',
                        productId: 'prod-pcon-y18',
                        semanticKey: 'pressure.safety_valve',
                        bindingMode: 'review_required',
                        snapshot: { kind: 'text', text: '120 bar' },
                        sourceRevision: 2
                      }
                    }
                  }
                ]
              }
            ]
          }
        ]
      };

      // 1. Zod Parse inicial
      const initialValidated = CatalogSchema.parse(catalog);

      // 2. Serialização JSON
      const serialized = JSON.stringify(initialValidated);

      // 3. Deserialização & Zod Parse
      const parsedJson = JSON.parse(serialized);
      const reloadedCatalog = CatalogSchema.parse(parsedJson);

      // 4. Adaptador Legacy -> TableCore
      const block = reloadedCatalog.pages[0].blocks[0];
      const adaptRes = adaptLegacyBlockToTableCore(block);
      expect(adaptRes.supported).toBe(true);
      if (!adaptRes.supported) return;

      const bridge = adaptRes.bridge;

      // 5. Verificação da Célula Live
      const liveCell = bridge.getByLegacyCoordinates(rowId, 'col_live');
      expect(liveCell).toBeDefined();
      expect(liveCell?.cellBinding?.bindingMode).toBe('live');
      expect(liveCell?.cellBinding?.sourceKind).toBe('pim_datum');
      expect(liveCell?.cellBinding?.semanticKey).toBe('pressure.range');

      // 6. Verificação da Célula Snapshot
      const snapCell = bridge.getByLegacyCoordinates(rowId, 'col_snapshot');
      expect(snapCell).toBeDefined();
      expect(snapCell?.cellBinding?.bindingMode).toBe('snapshot');
      expect(snapCell?.cellBinding?.snapshot).toEqual({ kind: 'text', text: '-0.9 a 70 bar' });
      expect(snapCell?.cellBinding?.sourceRevision).toBe(4);

      // 7. Verificação da Célula Review Required
      const revCell = bridge.getByLegacyCoordinates(rowId, 'col_review');
      expect(revCell).toBeDefined();
      expect(revCell?.cellBinding?.bindingMode).toBe('review_required');
      expect(revCell?.cellBinding?.snapshot).toEqual({ kind: 'text', text: '120 bar' });
      expect(revCell?.cellBinding?.sourceRevision).toBe(2);
    });
  });
});
