import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { Catalog } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useLibraryStore } from '../../src/stores/useLibraryStore';

describe('P0.5 — Professional Clean PDF Export & Render Isolation Suite', () => {
  const sampleCatalog: Catalog = {
    id: 'cat-clean-pdf-001',
    title: 'PRESYS Calibration Station PCON-Y18',
    subtitle: 'Datasheet de Alta Precisão',
    themeId: 'default-technical',
    version: 4,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Especificações Técnicas Oficiais',
        blocks: [
          {
            id: 'block-tbl-1',
            type: 'table',
            title: 'Tabela de Exatidão e Faixas',
            tableColumns: [
              { key: 'model', label: 'Modelo', visible: true, isCustom: false },
              { key: 'range', label: 'Faixa Operacional', visible: true, isCustom: false },
              { key: 'accuracy', label: 'Exatidão', visible: true, isCustom: false }
            ],
            tableRows: [
              {
                id: 'row-1',
                productRefId: 'PCON-Y18-STD',
                localOverrides: { accuracy: '0.01% FE' },
                order: 0
              }
            ],
            customData: {
              showLegend: true,
              legendTitle: 'LEGENDA METROLÓGICA:',
              legendLabels: {
                filled_square: 'Padrão rastreado RBC',
                empty_square: 'Opcional calibrado'
              }
            }
          },
          {
            id: 'block-custom-tbl-1',
            type: 'custom_table',
            title: 'Tabela Dimensional Customizada',
            tableColumns: [
              { key: 'col1', label: 'Dimensão', visible: true },
              { key: 'col2', label: 'Milímetros', visible: true }
            ],
            tableRows: [
              { id: 'crow-1', localOverrides: { col1: 'Altura', col2: '133 mm' }, order: 0 }
            ]
          },
          {
            id: 'block-txt-1',
            type: 'text',
            textContent: '# Título Editorial\nTexto informativo do instrumento calibrador.'
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useCatalogStore.setState({
      currentCatalog: sampleCatalog,
      selectedBlockId: 'block-tbl-1',
      isDirty: false,
      syncStatus: 'synced'
    });
    useLibraryStore.setState({
      products: [
        {
          id: 'PCON-Y18-STD',
          code: 'PCON-Y18-STD',
          model: 'PCON-Y18',
          family: 'PCON',
          description: 'Calibrador de Pressão PCON-Y18',
          version: 1,
          specs: {
            range: '0 a 70 bar',
            accuracy: '0.015% FE',
            unit: 'bar',
            output: '4-20mA',
            powerSupply: '24Vdc',
            processConnection: '1/2 NPT',
            protectionDegree: 'IP67',
            customSpecs: {}
          },
          imageUrl: '',
          createdAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z'
        }
      ]
    });
  });

  // =========================================================================
  // PDF-1: Zero Botões de Edição na Renderização Limpa
  // =========================================================================
  it('PDF-1: CleanA4Document NÃO renderiza botões de adicionar coluna, produto ou linha', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: sampleCatalog }));
    });

    // 1. Zero elementos <button>
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);

    // 2. Zero textos de ação de editor
    expect(container.textContent).not.toContain('+ Coluna');
    expect(container.textContent).not.toContain('+ Adicionar Produto da Biblioteca');
    expect(container.textContent).not.toContain('+ Inserir Linha');
    expect(container.textContent).not.toContain('Ocultar Legenda');
    expect(container.textContent).not.toContain('Exibir Legenda');

    await act(async () => root.unmount());
  });

  // =========================================================================
  // PDF-2: Zero Anéis de Seleção, Outlines ou Classes de Foco
  // =========================================================================
  it('PDF-2: CleanA4Document NÃO renderiza classes de anel de seleção do editor', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: sampleCatalog }));
    });

    const ringElements = container.querySelectorAll('[class*="ring-2"], [class*="ring-blue-600"]');
    expect(ringElements.length).toBe(0);

    await act(async () => root.unmount());
  });

  // =========================================================================
  // PDF-3: Conteúdo Editorial e Legenda São Integralmente Preservados
  // =========================================================================
  it('PDF-3: Legenda e conteúdo da tabela são renderizados fielmente como editorial', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: sampleCatalog }));
    });

    // Título da Tabela
    expect(container.textContent).toContain('Tabela de Exatidão e Faixas');
    // Célula com override
    expect(container.textContent).toContain('0.01% FE');
    // Legenda Metrológica presente como texto editorial
    expect(container.textContent).toContain('LEGENDA METROLÓGICA:');
    expect(container.textContent).toContain('Padrão rastreado RBC');
    // Rodapé técnico A4
    expect(container.textContent).toMatch(/(Page|Página)\s*1/);

    await act(async () => root.unmount());
  });

  // =========================================================================
  // PDF-4: Dimensões Físicas Estritas para A4 (794px / 210mm)
  // =========================================================================
  it('PDF-4: Cada folha A4 possui dimensões e quebra de página de impressão estritas', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: sampleCatalog }));
    });

    const pages = container.querySelectorAll('.clean-export-page');
    expect(pages.length).toBe(1);

    const firstPage = pages[0] as HTMLElement;
    expect(firstPage.style.width).toBe('794px');
    expect(firstPage.style.height).toBe('1123px');
    expect(firstPage.style.breakAfter).toBe('page');

    await act(async () => root.unmount());
  });
});
