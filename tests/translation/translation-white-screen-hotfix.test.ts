// tests/translation/translation-white-screen-hotfix.test.ts
// Suíte de Testes do P0 Hotfix: Proteção contra Tela Branca (White Screen) ao Abrir Translation Center

import { describe, it, expect, beforeEach } from 'vitest';
import { Catalog } from '@/domain/catalog.schema';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';
import { CoverageAuditor } from '@/translation/coverage.auditor';
import { TranslationApplierRegistry } from '@/translation/translation-applier.registry';
import { useTranslationStore } from '@/stores/useTranslationStore';

describe('P0 Hotfix: Translation Center White Screen Prevention & Legacy Data Hardening', () => {
  const representativeRealCatalog: Catalog = {
    id: 'cat-real-ta25n',
    title: 'Calibrador de Temperatura TA-25N',
    subtitle: 'Tecnologia Avançada de Calibração em Bloco Seco',
    themeId: 'default-technical',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    version: 1,
    locale: 'pt-BR',
    sourceLocale: 'pt-BR',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        title: 'Apresentação',
        blocks: [
          {
            id: 'b-hero',
            type: 'hero_banner',
            title: 'SÉRIE TA-25N ADVANCED',
            subtitle: 'Calibrador de temperatura portátil de -25 a 140 °C'
          },
          {
            id: 'b-additel',
            type: 'additel_two_col_hero',
            title: 'Padrão Metrológico',
            customData: {
              bulletList: 'bullet em formato legado texto string', // FORMA MALFORMADA LEGADA
              overview: 'Descrição técnica'
            }
          }
        ]
      },
      {
        id: 'page-2',
        pageNumber: 2,
        title: 'Especificações & Recursos',
        blocks: [
          {
            id: 'b-soft',
            type: 'software_connectivity',
            title: 'Conectividade',
            customData: {
              items: { item1: 'Software ISOPLAN' } // FORMA MALFORMADA LEGADA (Objeto em vez de array)
            }
          },
          {
            id: 'b-modes',
            type: 'multi_mode_calibrator',
            title: 'Modos de Operação',
            customData: {
              modes: 'dry block, banho, superficie' // FORMA MALFORMADA LEGADA (String em vez de array)
            }
          },
          {
            id: 'b-inserts',
            type: 'inserts_visual',
            title: 'Insertos',
            customData: {
              tableColumns: { col1: 'TA-25N' }, // Objeto
              tableRows: 'linha 1', // String
              inserts: null // Null
            }
          },
          {
            id: 'b-custom-tbl',
            type: 'custom_table',
            title: 'Matriz',
            customData: {
              headers: 12345, // Number
              rows: { r1: ['a', 'b'] } // Objeto
            }
          },
          {
            id: 'b-matrix',
            type: 'matrix_spec_table',
            title: 'Matriz Comparativa',
            customData: {
              columns: 'coluna 1, coluna 2', // String
              rows: 999, // Number
              sections: { sec1: 'titulo' } // Objeto
            }
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    useTranslationStore.getState().resetWorkflow();
  });

  it('TR-UI-OPEN-1: Abrir o Translation Center executa refreshCoverage sem lançar exceção (ZERO White Screen)', () => {
    // Simula a ação do usuário clicando no botão "Traduzir (AI)"
    const store = useTranslationStore.getState();

    expect(() => {
      store.openModal();
      store.refreshCoverage(representativeRealCatalog);
    }).not.toThrow();

    const state = useTranslationStore.getState();
    expect(state.isModalOpen).toBe(true);
    expect(state.coverage).toBeDefined();
  });

  it('TR-LEGACY-SHAPES-ALL: extractCatalogNodes extrai nós de catálogos com dados corrompidos/legados sem erro fatal', () => {
    expect(() => {
      const nodes = PrintableTextRegistry.extractCatalogNodes(representativeRealCatalog);
      expect(nodes.length).toBeGreaterThan(0);
    }).not.toThrow();
  });

  it('TR-COVERAGE-FAIL-SAFE: CoverageAuditor.auditCatalog nunca lança exceção mesmo com dados completamente inválidos', () => {
    const brokenData: any = {
      pages: 'não é um array',
      title: 12345
    };

    expect(() => {
      const audit = CoverageAuditor.auditCatalog(brokenData);
      expect(audit).toBeDefined();
      expect(typeof audit.isComplete).toBe('boolean');
    }).not.toThrow();
  });

  it('TR-APPLIER-LEGACY-FAIL-SAFE: TranslationApplierRegistry.applyTranslations não quebra com customData malformado', () => {
    const nodes = PrintableTextRegistry.extractCatalogNodes(representativeRealCatalog);
    const transMap = new Map<string, string>();
    nodes.forEach((n) => transMap.set(n.id, `[EN] ${n.sourceText}`));

    expect(() => {
      const result = TranslationApplierRegistry.applyTranslations(representativeRealCatalog, transMap, 'en-US');
      expect(result.translatedCatalog).toBeDefined();
      expect(result.appliedCount).toBeGreaterThan(0);
    }).not.toThrow();
  });
});
