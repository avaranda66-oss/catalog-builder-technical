// tests/components/specs-table-pilot.test.tsx
// Suíte de Testes de Produção do Piloto Table Core V2 (Fase CORE.T2B.1).
// Valida o primeiro uso de produção read-through para o bloco specs_table:
// 1. SPECS-PILOT-1: legacy -> adapter -> TableCoreRenderer com integridade no DOM.
// 2. SPECS-PILOT-2: Zero mutação do ContentBlock durante o ciclo de renderização.
// 3. SPECS-PILOT-3: Paridade estrita de conteúdo entre Editor e CleanA4.
// 4. SPECS-PILOT-4: Modificações no Store refletem dinamicamente via re-adaptação.
// 5. SPECS-PILOT-5: Zero Ghost Data — tabela vazia gera zero linhas de dados.
// 6. SPECS-PILOT-6: Fallback seguro (Fail Closed / Escape Hatch) quando o adapter rejeitar.
// 7. SPECS-PILOT-I18N-1: Textos traduzidos fluem com integridade pelo pipeline.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { TechnicalTableBlock } from '../../src/components/editor/blocks/TechnicalTableBlock';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { Catalog, ContentBlock } from '../../src/domain/catalog.schema';
import { adaptLegacyBlockToTableCore } from '../../src/domain/table-core';

describe('Table Core V2: specs_table Read-Through Production Pilot (CORE.T2B.1)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  const sampleSpecsBlock: ContentBlock = {
    id: 'blk_specs_pilot_1',
    type: 'specs_table',
    title: 'Especificações Termométricas Piloto',
    tableColumns: [
      { key: 'modelo', label: 'Modelo', visible: true, width: 100 },
      { key: 'faixa', label: 'Faixa Operacional', visible: true, width: 140 },
      { key: 'exatidao', label: 'Exatidão Global', visible: true, width: 120 }
    ],
    tableRows: [
      {
        id: 'r_mod_1',
        productRefId: 'prod_ta500',
        localOverrides: {
          modelo: 'TA-500N',
          faixa: '-50 a 500 °C',
          exatidao: '± 0.1 °C'
        }
      },
      {
        id: 'r_mod_2',
        productRefId: 'prod_ta1200',
        localOverrides: {
          modelo: 'TA-1200N',
          faixa: '50 a 1200 °C',
          exatidao: '± 0.25 °C'
        }
      }
    ]
  };

  const sampleCatalog: Catalog = {
    id: 'cat_specs_pilot',
    title: 'Catálogo Piloto Table Core V2',
    description: 'Validação de Produção Read-Through',
    status: 'draft',
    version: 1,
    themeId: 'default',
    locale: 'pt-BR',
    pages: [
      {
        id: 'page_pilot_1',
        pageNumber: 1,
        title: 'Página 1 - Termometria',
        blocks: [sampleSpecsBlock]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock ResizeObserver
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;

    // Mock IntersectionObserver
    if (typeof (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver === 'undefined') {
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      };
    }

    // Reset stores
    useCatalogStore.setState({
      currentCatalog: sampleCatalog,
      activePageIndex: 0,
      selectedBlockId: null
    });
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
    vi.restoreAllMocks();
  });

  const renderComponent = (element: React.ReactElement) => {
    root = createRoot(container);
    act(() => {
      root?.render(element);
    });
  };

  // ==========================================================================
  // SPECS-PILOT-1: Fluxo Completo: Legacy -> Adapter -> TableCoreRenderer
  // ==========================================================================
  it('SPECS-PILOT-1: Renderiza bloco specs_table via TableCoreRenderer garantindo integridade no DOM', () => {
    const adaptRes = adaptLegacyBlockToTableCore(sampleSpecsBlock);
    expect(adaptRes.supported).toBe(true);

    renderComponent(
      <TechnicalTableBlock block={sampleSpecsBlock} pageId="page_pilot_1" />
    );

    // O TableCoreRenderer deve estar ativo no DOM
    const tableCoreEl = container.querySelector('[data-table-mode="editor"]');
    expect(tableCoreEl).not.toBeNull();

    // Colunas canônicas presentes
    expect(container.textContent).toContain('Modelo');
    expect(container.textContent).toContain('Faixa Operacional');
    expect(container.textContent).toContain('Exatidão Global');

    // Células de dados presentes
    expect(container.textContent).toContain('TA-500N');
    expect(container.textContent).toContain('-50 a 500 °C');
    expect(container.textContent).toContain('± 0.1 °C');
    expect(container.textContent).toContain('TA-1200N');
    expect(container.textContent).toContain('50 a 1200 °C');
    expect(container.textContent).toContain('± 0.25 °C');

    // Células possuem identificadores estáveis semânticos do TableCore
    const cells = container.querySelectorAll('tbody td[data-cell-id]');
    expect(cells.length).toBe(6); // 2 linhas x 3 colunas
  });

  // ==========================================================================
  // SPECS-PILOT-2: Zero Mutação no ContentBlock durante Render
  // ==========================================================================
  it('SPECS-PILOT-2: Renderização é estritamente pura e NÃO muta o ContentBlock original', () => {
    const blockClone = JSON.parse(JSON.stringify(sampleSpecsBlock));
    const frozenBlock = Object.freeze({ ...sampleSpecsBlock });

    renderComponent(
      <TechnicalTableBlock block={frozenBlock} pageId="page_pilot_1" />
    );

    // O bloco deve permanecer exatamente idêntico ao original pré-renderização
    expect(frozenBlock).toEqual(blockClone);
    expect((frozenBlock as unknown as Record<string, unknown>).tableCore).toBeUndefined();
    expect((frozenBlock as unknown as Record<string, unknown>).tableCoreJson).toBeUndefined();
  });

  // ==========================================================================
  // SPECS-PILOT-3: Paridade Estrita Editor vs CleanA4Document
  // ==========================================================================
  it('SPECS-PILOT-3: Editor e CleanA4Document renderizam os mesmos dados úteis da specs_table', () => {
    // 1. Render Editor (A4Canvas)
    renderComponent(<A4Canvas />);
    const editorText = container.textContent || '';
    act(() => {
      root?.unmount();
      root = null;
    });

    // 2. Render CleanA4Document (PDF/Export)
    const exportContainer = document.createElement('div');
    document.body.appendChild(exportContainer);
    const exportRoot = createRoot(exportContainer);
    act(() => {
      exportRoot.render(<CleanA4Document document={sampleCatalog} />);
    });
    const exportText = exportContainer.textContent || '';
    act(() => {
      exportRoot.unmount();
    });
    exportContainer.parentNode?.removeChild(exportContainer);

    // Ambas as superfícies contêm os dados canônicos
    const expectedKeywords = [
      'Especificações Termométricas Piloto',
      'Modelo',
      'Faixa Operacional',
      'Exatidão Global',
      'TA-500N',
      '-50 a 500 °C',
      '± 0.1 °C',
      'TA-1200N',
      '50 a 1200 °C',
      '± 0.25 °C'
    ];

    for (const kw of expectedKeywords) {
      expect(editorText).toContain(kw);
      expect(exportText).toContain(kw);
    }
  });

  // ==========================================================================
  // SPECS-PILOT-4: Modificações no Store refletem dinamicamente no TableCoreRenderer
  // ==========================================================================
  it('SPECS-PILOT-4: Mutação no Store reflete imediatamente no TableCoreRenderer via re-adaptação pura', () => {
    renderComponent(<A4Canvas />);

    expect(container.textContent).toContain('-50 a 500 °C');
    expect(container.textContent).not.toContain('-80 a 600 °C (Calibrado)');

    // Simula atualização do Store legado (ex.: edição de override de célula pelo usuário)
    act(() => {
      useCatalogStore.getState().updateCellOverride(
        'blk_specs_pilot_1',
        'r_mod_1',
        'faixa',
        '-80 a 600 °C (Calibrado)'
      );
    });

    // O TableCoreRenderer re-adaptou o bloco atualizado e exibe o novo valor
    expect(container.textContent).toContain('-80 a 600 °C (Calibrado)');
  });

  // ==========================================================================
  // SPECS-PILOT-5: Zero Ghost Data em Tabela com 0 Linhas
  // ==========================================================================
  it('SPECS-PILOT-5: specs_table com 0 rows renderiza 0 linhas de dados (Zero Ghost Row)', () => {
    const emptySpecsBlock: ContentBlock = {
      id: 'blk_empty_specs',
      type: 'specs_table',
      title: 'Tabela Vazia',
      tableColumns: [
        { key: 'c1', label: 'Parâmetro', visible: true }
      ],
      tableRows: []
    };

    renderComponent(
      <TechnicalTableBlock block={emptySpecsBlock} pageId="page_pilot_1" />
    );

    // Não deve haver nenhum <tr> de dados no tbody
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(0);
  });

  // ==========================================================================
  // SPECS-PILOT-6: Fallback Seguro para Legacy Renderer se Adapter Rejeitar (Escape Hatch)
  // ==========================================================================
  it('SPECS-PILOT-6: Se o adapter rejeitar bloco não suportado, executa fallback para TechnicalTable legado sem crashar', () => {
    // Bloco malformado sem colunas que causa supported: false no adapter
    const unsupportedBlock: ContentBlock = {
      id: 'blk_unsupported_test',
      type: 'specs_table',
      title: 'Tabela Sem Colunas',
      tableColumns: [],
      tableRows: []
    };

    const adaptRes = adaptLegacyBlockToTableCore(unsupportedBlock);
    expect(adaptRes.supported).toBe(false);

    // Não deve lançar exceção
    expect(() => {
      renderComponent(
        <TechnicalTableBlock block={unsupportedBlock} pageId="page_pilot_1" />
      );
    }).not.toThrow();

    // TableCoreRenderer NÃO é renderizado, fallback legado atuou de forma fail-safe
    const tableCoreEl = container.querySelector('[data-table-mode="editor"]');
    expect(tableCoreEl).toBeNull();
  });

  // ==========================================================================
  // SPECS-PILOT-I18N-1: Localização de Conteúdo Traduzido pelo Pipeline
  // ==========================================================================
  it('SPECS-PILOT-I18N-1: Conteúdo traduzido no bloco legado flui com precisão para o TableCoreRenderer', () => {
    const translatedBlock: ContentBlock = {
      id: 'blk_specs_i18n',
      type: 'specs_table',
      title: 'Thermometry Technical Specifications (EN)',
      tableColumns: [
        { key: 'model', label: 'Model', visible: true, width: 120 },
        { key: 'range', label: 'Operating Range', visible: true, width: 140 },
        { key: 'accuracy', label: 'Overall Accuracy', visible: true, width: 120 }
      ],
      tableRows: [
        {
          id: 'r_en_1',
          localOverrides: {
            model: 'TA-500N-EN',
            range: '-50 to 500 °C',
            accuracy: '± 0.1 °C'
          }
        }
      ]
    };

    renderComponent(
      <TechnicalTableBlock block={translatedBlock} pageId="page_pilot_1" isExport={true} />
    );

    expect(container.textContent).toContain('Model');
    expect(container.textContent).toContain('Operating Range');
    expect(container.textContent).toContain('Overall Accuracy');
    expect(container.textContent).toContain('TA-500N-EN');
    expect(container.textContent).toContain('-50 to 500 °C');
    expect(container.textContent).toContain('± 0.1 °C');
  });
});
