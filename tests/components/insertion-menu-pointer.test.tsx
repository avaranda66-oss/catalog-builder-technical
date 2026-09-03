// tests/components/insertion-menu-pointer.test.tsx
// Validação canônica de pointer-events, stacking context e ausência de interceptação
// nos menus superiores de inserção (+ Capas & Headers, + Tabelas, + Estruturas) sobre páginas vazias e populadas.
// Fase CORE.H1 — Hotfix de Interação e Stacking.

import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { Catalog } from '../../src/domain/catalog.schema';

describe('CORE.H1 — Insertion Menu Pointer & Stacking Contracts', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let originalFonts: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Polyfill de IntersectionObserver para A4Canvas
    if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
      (globalThis as any).IntersectionObserver = class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      };
    }

    originalFonts = (document as any).fonts;
    (document as any).fonts = {
      ready: Promise.resolve()
    };
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
    (document as any).fonts = originalFonts;
    vi.restoreAllMocks();
  });

  function createCatalogWithEmptyPage(pageCount = 1): Catalog {
    return {
      id: 'cat-test-h1',
      title: 'Catálogo de Teste H1',
      themeId: 'default',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      version: 1,
      pages: Array.from({ length: pageCount }, (_, i) => ({
        id: `page-${i + 1}`,
        pageNumber: i + 1,
        title: `Página ${i + 1}`,
        blocks: []
      }))
    };
  }

  // =========================================================================
  // INSERTION-MENU-EMPTY-PAGE-1: Página vazia + menu Tabelas aberto -> option interativa
  // =========================================================================
  it('INSERTION-MENU-EMPTY-PAGE-1: página vazia com menu Tabelas aberto mantém opções interativas e sem interceptação', () => {
    const catalog = createCatalogWithEmptyPage(1);
    act(() => {
      useCatalogStore.setState({
        currentCatalog: catalog,
        activePageIndex: 0,
        selectedBlockId: null,
        selectedChildId: null
      });
    });

    act(() => {
      root?.render(<A4Canvas />);
    });

    // 1. Drop slot 0 NÃO deve existir em página vazia
    const dropSlot0 = container.querySelector('[data-testid="block-flow-drop-slot-0"]');
    expect(dropSlot0).toBeNull();

    // 2. Encontrar o botão "+ Tabelas" na barra técnica
    const buttons = Array.from(container.querySelectorAll('button'));
    const tablesButton = buttons.find((btn) => btn.textContent?.includes('+ Tabelas'));
    expect(tablesButton).toBeDefined();

    // 3. Clicar no botão "+ Tabelas" para abrir o dropdown
    act(() => {
      tablesButton?.click();
    });

    // 4. Dropdown deve estar aberto com as opções de tabelas
    const dropdown = container.querySelector('.animate-in');
    expect(dropdown).not.toBeNull();
    expect(dropdown?.textContent).toContain('Tabelas Metrológicas');

    // 5. Verificar que as opções de tabelas estão presentes e são clicáveis
    const options = Array.from(dropdown?.querySelectorAll('.cursor-pointer') || []);
    expect(options.length).toBeGreaterThanOrEqual(4);

    const productsOption = options.find((opt) => opt.textContent?.includes('Tabela de Produtos Presys Oficial'));
    expect(productsOption).toBeDefined();

    // 6. Testar hover no item (dispara mouseEnter para o tooltip preview)
    act(() => {
      productsOption?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });

    // 7. O placeholder da página vazia deve ter pointer-events-none para não roubar hover/pointer
    const placeholder = container.querySelector('[data-testid="empty-page-placeholder"]') as HTMLElement;
    expect(placeholder).not.toBeNull();
    expect(placeholder.className).toContain('pointer-events-none');
    expect(placeholder.className).not.toContain('pointer-events-auto');
  });

  // =========================================================================
  // INSERTION-MENU-CLICK-1: Click em option gera exatamente uma mutação de inserção
  // =========================================================================
  it('INSERTION-MENU-CLICK-1: clique em opção do menu insere exatamente um bloco sem duplicação e fecha o menu', () => {
    const catalog = createCatalogWithEmptyPage(1);
    act(() => {
      useCatalogStore.setState({
        currentCatalog: catalog,
        activePageIndex: 0,
        selectedBlockId: null,
        selectedChildId: null
      });
    });

    act(() => {
      root?.render(<A4Canvas />);
    });

    // Página inicialmente tem 0 blocos
    expect(useCatalogStore.getState().currentCatalog?.pages[0].blocks.length).toBe(0);

    // Abrir menu "+ Tabelas"
    const buttons = Array.from(container.querySelectorAll('button'));
    const tablesButton = buttons.find((btn) => btn.textContent?.includes('+ Tabelas'));
    act(() => {
      tablesButton?.click();
    });

    // Clicar na opção "Tabela de Produtos Presys Oficial"
    const dropdown = container.querySelector('.animate-in');
    const options = Array.from(dropdown?.querySelectorAll('.cursor-pointer') || []);
    const productsOption = options.find((opt) => opt.textContent?.includes('Tabela de Produtos Presys Oficial')) as HTMLElement;
    expect(productsOption).toBeDefined();

    act(() => {
      productsOption.click();
    });

    // Inserção deve ter ocorrido exatamente uma vez com o tipo specs_table (Table Core V2)
    const updatedBlocks = useCatalogStore.getState().currentCatalog?.pages[0].blocks || [];
    expect(updatedBlocks.length).toBe(1);
    expect(updatedBlocks[0].type).toBe('specs_table');
    expect(updatedBlocks[0].title).toBe('Tabela de Especificações Técnicas de Instrumentação');

    // Menu dropdown deve ter fechado automaticamente após o clique
    const closedDropdown = container.querySelector('.animate-in');
    expect(closedDropdown).toBeNull();
  });

  // =========================================================================
  // INSERTION-MENU-PAGE-POINTER-1: Contratos de stacking e pointer-events
  // =========================================================================
  it('INSERTION-MENU-PAGE-POINTER-1: empty placeholder e drop slots respeitam os contratos de layering e pointer-events', () => {
    const catalog = createCatalogWithEmptyPage(1);
    act(() => {
      useCatalogStore.setState({
        currentCatalog: catalog,
        activePageIndex: 0,
        selectedBlockId: null,
        selectedChildId: null
      });
    });

    act(() => {
      root?.render(<A4Canvas />);
    });

    // 1. Com menu FECHADO:
    // - empty-page-placeholder tem pointer-events-auto e cursor-pointer
    const placeholderBefore = container.querySelector('[data-testid="empty-page-placeholder"]') as HTMLElement;
    expect(placeholderBefore.className).toContain('pointer-events-auto');
    expect(placeholderBefore.className).toContain('cursor-pointer');
    expect(placeholderBefore.className).not.toContain('pointer-events-none');
    expect(placeholderBefore.className).toContain('z-0');

    // - a4-page-container tem isolamento de stacking context
    const a4Container = container.querySelector('.a4-page-container') as HTMLElement;
    expect(a4Container).not.toBeNull();
    expect(a4Container.className).toContain('isolate');

    // - barra técnica tem z-10
    const toolbarBefore = container.querySelector('.rounded-t.border') as HTMLElement;
    expect(toolbarBefore.className).toContain('z-10');
    expect(toolbarBefore.className).not.toContain('z-40');

    // 2. ABRIR menu "+ Estruturas":
    const buttons = Array.from(container.querySelectorAll('button'));
    const structuresButton = buttons.find((btn) => btn.textContent?.includes('+ Estruturas'));
    act(() => {
      structuresButton?.click();
    });

    // 3. Com menu ABERTO:
    // - barra técnica é elevada para z-40
    const toolbarAfter = container.querySelector('.rounded-t.border') as HTMLElement;
    expect(toolbarAfter.className).toContain('z-40');

    // - wrapper da página é elevado para z-30
    const pageWrapper = container.querySelector('#page-container-page-1') as HTMLElement;
    expect(pageWrapper.className).toContain('z-30');

    // - empty-page-placeholder recebe pointer-events-none para não interceptar o menu
    const placeholderAfter = container.querySelector('[data-testid="empty-page-placeholder"]') as HTMLElement;
    expect(placeholderAfter.className).toContain('pointer-events-none');
    expect(placeholderAfter.className).not.toContain('pointer-events-auto');

    // 4. Inserir um bloco para testar o comportamento em página populada
    const dropdown = container.querySelector('.animate-in');
    const options = Array.from(dropdown?.querySelectorAll('.cursor-pointer') || []);
    const featuresOption = options.find((opt) => opt.textContent?.includes('Recursos Técnicos')) as HTMLElement;
    expect(featuresOption).toBeDefined();

    act(() => {
      featuresOption.click();
    });

    // Agora a página tem 1 bloco
    expect(useCatalogStore.getState().currentCatalog?.pages[0].blocks.length).toBe(1);

    // 5. Em página populada, o drop slot 0 agora existe:
    const dropSlot0 = container.querySelector('[data-testid="block-flow-drop-slot-0"]') as HTMLElement;
    expect(dropSlot0).not.toBeNull();
    expect(dropSlot0.className).toContain('z-10');
    expect(dropSlot0.className).toContain('pointer-events-auto');

    // 6. Abrir menu "+ Capas & Headers" na página populada:
    const headersButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent?.includes('+ Capas & Headers'));
    act(() => {
      headersButton?.click();
    });

    // 7. Drop slots devem receber pointer-events-none enquanto o menu estiver aberto
    const dropSlot0WhileMenu = container.querySelector('[data-testid="block-flow-drop-slot-0"]') as HTMLElement;
    expect(dropSlot0WhileMenu.className).toContain('pointer-events-none');
    expect(dropSlot0WhileMenu.className).not.toContain('pointer-events-auto');

    const dropSlotEndWhileMenu = container.querySelector('[data-testid="block-flow-drop-slot-end"]') as HTMLElement;
    expect(dropSlotEndWhileMenu.className).toContain('pointer-events-none');
    expect(dropSlotEndWhileMenu.className).not.toContain('pointer-events-auto');
  });
});
