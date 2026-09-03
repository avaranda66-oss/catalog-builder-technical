// tests/components/specs-table-parity.test.tsx
// Suíte de testes de Paridade e Renderização para specs_table (Fase CORE.E2.2).
// Comprova que specs_table renderiza perfeitamente no Editor (A4Canvas) e no PDF (CleanA4Document)
// eliminando o drift histórico onde specs_table era omitido do Editor.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { Catalog, ContentBlock } from '../../src/domain/catalog.schema';

describe('specs_table Parity and Interaction (CORE.E2.2)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  let activeResizeObservers: any[] = [];

  const specsBlock: ContentBlock = {
    id: 'block-specs-parity-1',
    type: 'specs_table',
    title: 'Especificações Técnicas de Pressão',
    tableColumns: [
      { key: 'parametro', label: 'Parâmetro' },
      { key: 'faixa', label: 'Faixa de Medição' },
      { key: 'exatidao', label: 'Exatidão' }
    ],
    tableRows: [
      {
        id: 'row-1',
        productRefId: 'prod-1',
        localOverrides: {
          parametro: 'Pressão Positiva',
          faixa: '0 a 70 bar',
          exatidao: '± 0.02% FS'
        }
      },
      {
        id: 'row-2',
        productRefId: 'prod-2',
        localOverrides: {
          parametro: 'Vácuo',
          faixa: '-0.95 a 0 bar',
          exatidao: '± 0.05% FS'
        }
      }
    ]
  };

  const sampleCatalog: Catalog = {
    id: 'catalog-specs-test',
    title: 'Catálogo de Teste de Specs Table',
    description: 'Teste de Paridade Editor vs Print',
    status: 'draft',
    version: 1,
    themeId: 'default',
    locale: 'pt-BR',
    pages: [
      {
        id: 'page-specs-1',
        pageNumber: 1,
        title: 'Página de Especificações',
        blocks: [specsBlock]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock ResizeObserver
    activeResizeObservers = [];
    class MockResizeObserver {
      callback: (entries: any[]) => void;
      constructor(callback: (entries: any[]) => void) {
        this.callback = callback;
        activeResizeObservers.push(this);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as any).ResizeObserver = MockResizeObserver;

    // Mock IntersectionObserver
    if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
      (globalThis as any).IntersectionObserver = class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      };
    }

    // Reset store state
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
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SPECS-EDITOR-1: specs_table renderiza no A4Canvas (Editor)
  // ==========================================================================
  it('SPECS-EDITOR-1: specs_table renderiza com sucesso no A4Canvas do Editor', () => {
    root = createRoot(container);
    act(() => {
      root?.render(<A4Canvas />);
    });

    // Encontra o bloco pelo ID
    const blockEl = container.querySelector('[data-block-id="block-specs-parity-1"]');
    expect(blockEl).not.toBeNull();

    // Verifica que o título da tabela de especificações foi renderizado
    expect(container.textContent).toContain('Especificações Técnicas de Pressão');

    // Verifica que as colunas foram renderizadas
    expect(container.textContent).toContain('Parâmetro');
    expect(container.textContent).toContain('Faixa de Medição');
    expect(container.textContent).toContain('Exatidão');

    // Verifica que as linhas foram renderizadas
    expect(container.textContent).toContain('Pressão Positiva');
    expect(container.textContent).toContain('0 a 70 bar');
    expect(container.textContent).toContain('± 0.02% FS');
  });

  // ==========================================================================
  // SPECS-PRINT-1: specs_table renderiza no CleanA4Document (Print/PDF)
  // ==========================================================================
  it('SPECS-PRINT-1: specs_table renderiza com sucesso no CleanA4Document para exportação PDF', () => {
    root = createRoot(container);
    act(() => {
      root?.render(<CleanA4Document document={sampleCatalog} />);
    });

    // Verifica que o título da tabela de especificações foi renderizado no documento limpo
    expect(container.textContent).toContain('Especificações Técnicas de Pressão');

    // Verifica colunas e dados
    expect(container.textContent).toContain('Parâmetro');
    expect(container.textContent).toContain('Faixa de Medição');
    expect(container.textContent).toContain('Pressão Positiva');
    expect(container.textContent).toContain('± 0.02% FS');
  });

  // ==========================================================================
  // SPECS-PARITY-1: Ambos os renderers produzem os mesmos dados tabulares
  // ==========================================================================
  it('SPECS-PARITY-1: Editor e CleanA4Document possuem estrita paridade de dados para specs_table', () => {
    // 1. Renderiza no Editor
    root = createRoot(container);
    act(() => {
      root?.render(<A4Canvas />);
    });
    const editorText = container.textContent || '';
    act(() => {
      root?.unmount();
    });

    // 2. Renderiza no CleanA4
    const printContainer = document.createElement('div');
    document.body.appendChild(printContainer);
    const printRoot = createRoot(printContainer);
    act(() => {
      printRoot.render(<CleanA4Document document={sampleCatalog} />);
    });
    const printText = printContainer.textContent || '';
    act(() => {
      printRoot.unmount();
    });
    printContainer.parentNode?.removeChild(printContainer);

    // Ambos contêm os elementos chave
    const keyContents = [
      'Especificações Técnicas de Pressão',
      'Parâmetro',
      'Faixa de Medição',
      'Exatidão',
      'Pressão Positiva',
      '0 a 70 bar',
      '± 0.02% FS',
      'Vácuo',
      '-0.95 a 0 bar',
      '± 0.05% FS'
    ];

    for (const key of keyContents) {
      expect(editorText).toContain(key);
      expect(printText).toContain(key);
    }
  });

  // ==========================================================================
  // SPECS-SELECT-1: Interação de seleção no A4Canvas seleciona o specs_table
  // ==========================================================================
  it('SPECS-SELECT-1: Clicar no specs_table no A4Canvas ativa a seleção no store', () => {
    root = createRoot(container);
    act(() => {
      root?.render(<A4Canvas />);
    });

    const blockWrapper = container.querySelector('[data-block-id="block-specs-parity-1"]');
    expect(blockWrapper).not.toBeNull();

    // Simula clique no bloco
    act(() => {
      blockWrapper?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Store agora tem o bloco selecionado
    expect(useCatalogStore.getState().selectedBlockId).toBe('block-specs-parity-1');
  });
});
