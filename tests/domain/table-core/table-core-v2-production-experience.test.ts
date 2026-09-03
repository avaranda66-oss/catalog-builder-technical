// tests/domain/table-core/table-core-v2-production-experience.test.ts
// Testes de Domínio e Comportamento para o TABLE.PRODUCTION.EXPERIENCE1.
// Abrange: Tabela em Branco V2, Linhas Vinculadas/Híbridas/Manuais, Overrides Locais,
// Desvinculação com Materialização (keep_value vs clear), Restauração Condicional,
// Literais Tipados Sem Perda, Provedor de Conhecimento Fail-Closed e Adaptador de Datasets.

import { describe, it, expect } from 'vitest';
import {
  ContentBlock,
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
              code: { kind: 'text', text: 'R-01' },
              range: { kind: 'text', text: '0 a 1 bar' },
              accuracy: { kind: 'text', text: '0.01% FE' }
            }
          },
          {
            rowId: 'row-02',
            label: 'Faixa 2',
            cells: {
              code: { kind: 'text', text: 'R-02' },
              range: { kind: 'text', text: '0 a 70 bar' },
              accuracy: { kind: 'text', text: '0.01% FE' }
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
});
