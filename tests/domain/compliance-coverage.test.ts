// tests/domain/compliance-coverage.test.ts
// Validação canônica da matriz de cobertura e veracidade factual da auditoria de conformidade.
// Fase CORE.H2 — Confiabilidade do Editor e Veracidade de Conformidade.

import { describe, it, expect } from 'vitest';
import { AIService } from '../../src/services/ai.service';
import { Catalog, ContentBlock } from '../../src/domain/catalog.schema';
import { INITIAL_PRODUCTS } from '../../src/data/initialProducts';
import {
  evaluateBlockComplianceCapability,
  isTableLikeBlock,
  TABLE_LIKE_BLOCK_TYPES
} from '../../src/domain/compliance-coverage';

const MOCK_PRODUCTS = INITIAL_PRODUCTS;

function createCatalogWithBlocks(blocks: ContentBlock[]): Catalog {
  return {
    id: 'cat-compliance-test',
    title: 'Catálogo de Teste de Conformidade',
    themeId: 'default',
    version: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        title: 'Página 1',
        blocks
      }
    ]
  };
}

describe('CORE.H2 — Compliance Coverage Truth & Capability Matrix', () => {
  it('identifica corretamente todos os tipos table-like cadastrados no sistema', () => {
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('table');
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('specs_table');
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('electrical_table');
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('accessories_table');
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('custom_table');
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('matrix_spec_table');
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('ordering_codes');
    expect(TABLE_LIKE_BLOCK_TYPES).toContain('inserts_visual');

    expect(isTableLikeBlock('table')).toBe(true);
    expect(isTableLikeBlock('matrix_spec_table')).toBe(true);
    expect(isTableLikeBlock('hero_banner')).toBe(false);
    expect(isTableLikeBlock('text')).toBe(false);
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-1: table canonical -> audited
  // =========================================================================
  it('COMPLIANCE-COVERAGE-1: table canônica com tableRows vinculados à biblioteca é auditada e reporta 100% conforme', () => {
    const block: ContentBlock = {
      id: 'b-table',
      type: 'table',
      title: 'Tabela Canônica',
      tableColumns: [{ key: 'range', label: 'Faixa' }],
      tableRows: [
        {
          id: 'r1',
          productRefId: 'prod-presys-ta-25n',
          localOverrides: {},
          order: 0
        }
      ]
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(true);
    expect(evalRes.tier).toBe('SUPPORTED_CANONICAL_ROWS');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.auditedBlocksCount).toBe(1);
    expect(report.skippedBlocksCount).toBe(0);
    expect(report.divergenceCount).toBe(0);
    expect(report.coverageComplete).toBe(true);
    expect(report.isFullyCompliant).toBe(true);
    expect(report.complianceStatus).toBe('compliant');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-2: specs_table canonical -> audited
  // =========================================================================
  it('COMPLIANCE-COVERAGE-2: specs_table canônica é auditada e incluída na verificação de produtos', () => {
    const block: ContentBlock = {
      id: 'b-specs',
      type: 'specs_table',
      title: 'Tabela de Especificações',
      tableColumns: [{ key: 'range', label: 'Faixa' }],
      tableRows: [
        {
          id: 'r1',
          productRefId: 'prod-presys-ta-35n',
          localOverrides: {},
          order: 0
        }
      ]
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(true);
    expect(evalRes.tier).toBe('SUPPORTED_CANONICAL_ROWS');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.auditedBlocksCount).toBe(1);
    expect(report.isFullyCompliant).toBe(true);
    expect(report.complianceStatus).toBe('compliant');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-3: electrical_table canonical -> audited
  // =========================================================================
  it('COMPLIANCE-COVERAGE-3: electrical_table canônica é auditada', () => {
    const block: ContentBlock = {
      id: 'b-elec',
      type: 'electrical_table',
      title: 'Tabela Elétrica',
      tableColumns: [{ key: 'sinal', label: 'Sinal' }],
      tableRows: [
        {
          id: 'r1',
          productRefId: 'prod-presys-ta-25n',
          localOverrides: {},
          order: 0
        }
      ]
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(true);
    expect(evalRes.tier).toBe('SUPPORTED_CANONICAL_ROWS');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.auditedBlocksCount).toBe(1);
    expect(report.complianceStatus).toBe('compliant');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-4: accessories_table canonical -> audited
  // =========================================================================
  it('COMPLIANCE-COVERAGE-4: accessories_table canônica é auditada', () => {
    const block: ContentBlock = {
      id: 'b-acc',
      type: 'accessories_table',
      title: 'Tabela de Acessórios',
      tableColumns: [{ key: 'codigo', label: 'Código' }],
      tableRows: [
        {
          id: 'r1',
          productRefId: 'prod-presys-ta-35n',
          localOverrides: {},
          order: 0
        }
      ]
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(true);
    expect(evalRes.tier).toBe('SUPPORTED_CANONICAL_ROWS');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.auditedBlocksCount).toBe(1);
    expect(report.complianceStatus).toBe('compliant');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-5: custom_table canonical shape -> audited
  // =========================================================================
  it('COMPLIANCE-COVERAGE-5: custom_table com formato canônico (tableRows com productRefId) é auditada', () => {
    const block: ContentBlock = {
      id: 'b-custom-canonical',
      type: 'custom_table',
      title: 'Tabela Customizada Canônica',
      tableColumns: [{ key: 'range', label: 'Faixa' }],
      tableRows: [
        {
          id: 'r1',
          productRefId: 'prod-presys-ta-25n',
          localOverrides: {},
          order: 0
        }
      ]
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(true);
    expect(evalRes.tier).toBe('SUPPORTED_CANONICAL_ROWS');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.auditedBlocksCount).toBe(1);
    expect(report.complianceStatus).toBe('compliant');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-6: custom_table proprietary shape -> skipped
  // =========================================================================
  it('COMPLIANCE-COVERAGE-6: custom_table com formato livre (sem productRefId) é ignorada sem falsa conformidade', () => {
    const block: ContentBlock = {
      id: 'b-custom-freeform',
      type: 'custom_table',
      title: 'Tabela Customizada Livre',
      customData: {
        headers: ['Item', 'Descrição'],
        rows: [['Pressão Máx', '100 bar']]
      }
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(false);
    expect(evalRes.tier).toBe('UNSUPPORTED_CUSTOM_SHAPE');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(0);
    expect(report.skippedBlocksCount).toBe(1);
    expect(report.skippedBlockTypes).toContain('custom_table');
    expect(report.isFullyCompliant).toBe(false);
    expect(report.complianceStatus).toBe('partial');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-7: matrix_spec_table -> unsupported truthfully
  // =========================================================================
  it('COMPLIANCE-COVERAGE-7: matrix_spec_table é classificada como não suportada com transparência', () => {
    const block: ContentBlock = {
      id: 'b-matrix',
      type: 'matrix_spec_table',
      title: 'Matriz Comparativa'
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(false);
    expect(evalRes.tier).toBe('UNSUPPORTED_SPECIALIZED');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(0);
    expect(report.skippedBlocksCount).toBe(1);
    expect(report.skippedBlockTypes).toContain('matrix_spec_table');
    expect(report.isFullyCompliant).toBe(false);
    expect(report.complianceStatus).toBe('partial');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-8: ordering_codes -> unsupported truthfully
  // =========================================================================
  it('COMPLIANCE-COVERAGE-8: ordering_codes é classificada como estrutura não suportada para conformidade de produto', () => {
    const block: ContentBlock = {
      id: 'b-ordering',
      type: 'ordering_codes',
      title: 'Part Number Generator'
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(false);
    expect(evalRes.tier).toBe('UNSUPPORTED_SPECIALIZED');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.skippedBlocksCount).toBe(1);
    expect(report.skippedBlockTypes).toContain('ordering_codes');
    expect(report.isFullyCompliant).toBe(false);
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-9: inserts_visual -> unsupported truthfully
  // =========================================================================
  it('COMPLIANCE-COVERAGE-9: inserts_visual é classificada como estrutura não suportada', () => {
    const block: ContentBlock = {
      id: 'b-inserts',
      type: 'inserts_visual',
      title: 'Furações de Insertos'
    };

    const evalRes = evaluateBlockComplianceCapability(block);
    expect(evalRes.isSupported).toBe(false);
    expect(evalRes.tier).toBe('UNSUPPORTED_SPECIALIZED');

    const report = AIService.checkCatalogCompliance(createCatalogWithBlocks([block]), MOCK_PRODUCTS);
    expect(report.skippedBlocksCount).toBe(1);
    expect(report.skippedBlockTypes).toContain('inserts_visual');
    expect(report.isFullyCompliant).toBe(false);
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-10: only unsupported tables -> NOT "100% compliant"
  // =========================================================================
  it('COMPLIANCE-COVERAGE-10: catálogo contendo exclusivamente tabelas não suportadas NÃO reporta 100% conforme', () => {
    const catalog = createCatalogWithBlocks([
      { id: 'b-m', type: 'matrix_spec_table', title: 'Matriz' },
      { id: 'b-o', type: 'ordering_codes', title: 'Part Number' }
    ]);

    const report = AIService.checkCatalogCompliance(catalog, MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(0);
    expect(report.divergenceCount).toBe(0);
    expect(report.isFullyCompliant).toBe(false);
    expect(report.coverageComplete).toBe(false);
    expect(report.complianceStatus).toBe('partial');
    expect(report.skippedBlocksCount).toBe(2);
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-11: zero tables -> no false green
  // =========================================================================
  it('COMPLIANCE-COVERAGE-11: catálogo com zero tabelas reporta estado neutro no_tables sem falso verde', () => {
    const catalog = createCatalogWithBlocks([
      { id: 'b-text', type: 'text', textContent: 'Texto descritivo' },
      { id: 'b-hero', type: 'hero_banner', title: 'Banner' }
    ]);

    const report = AIService.checkCatalogCompliance(catalog, MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(0);
    expect(report.divergenceCount).toBe(0);
    expect(report.isFullyCompliant).toBe(false);
    expect(report.complianceStatus).toBe('no_tables');
    expect(report.notes).toContain('Nenhuma tabela compatível');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-12: mixed supported + unsupported -> audited rows + partial
  // =========================================================================
  it('COMPLIANCE-COVERAGE-12: catálogo misto (tabela suportada + matriz comparativa) audita linhas e reporta cobertura parcial', () => {
    const catalog = createCatalogWithBlocks([
      {
        id: 'b-tbl',
        type: 'table',
        tableRows: [{ id: 'r1', productRefId: 'prod-presys-ta-25n', localOverrides: {}, order: 0 }]
      },
      {
        id: 'b-mat',
        type: 'matrix_spec_table',
        title: 'Matriz'
      }
    ]);

    const report = AIService.checkCatalogCompliance(catalog, MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.auditedBlocksCount).toBe(1);
    expect(report.skippedBlocksCount).toBe(1);
    expect(report.coverageComplete).toBe(false);
    expect(report.isFullyCompliant).toBe(false);
    expect(report.complianceStatus).toBe('partial');
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-13: real divergence in supported table -> divergence detected
  // =========================================================================
  it('COMPLIANCE-COVERAGE-13: divergência factual em tabela suportada é detectada com status divergent', () => {
    const catalog = createCatalogWithBlocks([
      {
        id: 'b-tbl',
        type: 'table',
        tableRows: [
          {
            id: 'r1',
            productRefId: 'prod-presys-ta-25n',
            localOverrides: { range: '-50 a 200 °C' }, // Oficial é -25 a 140 °C
            order: 0
          }
        ]
      }
    ]);

    const report = AIService.checkCatalogCompliance(catalog, MOCK_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.divergenceCount).toBeGreaterThanOrEqual(1);
    expect(report.isFullyCompliant).toBe(false);
    expect(report.complianceStatus).toBe('divergent');
    expect(report.items.length).toBe(1);
    expect(report.items[0].divergences.some((d) => d.fieldKey === 'range')).toBe(true);
  });

  // =========================================================================
  // COMPLIANCE-COVERAGE-14: no divergence + partial coverage -> clearly partial
  // =========================================================================
  it('COMPLIANCE-COVERAGE-14: zero divergências nas linhas auditadas porém com estruturas ignoradas reporta claramente partial', () => {
    const catalog = createCatalogWithBlocks([
      {
        id: 'b-tbl',
        type: 'table',
        tableRows: [
          {
            id: 'r1',
            productRefId: 'prod-presys-ta-25n',
            localOverrides: {}, // Sem divergências
            order: 0
          }
        ]
      },
      {
        id: 'b-ord',
        type: 'ordering_codes'
      }
    ]);

    const report = AIService.checkCatalogCompliance(catalog, MOCK_PRODUCTS);
    expect(report.divergenceCount).toBe(0);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.coverageComplete).toBe(false);
    expect(report.isFullyCompliant).toBe(false);
    expect(report.complianceStatus).toBe('partial');
    expect(report.notes).toContain('Auditoria parcial');
  });
});
