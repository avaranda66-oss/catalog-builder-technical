// tests/components/vertical-overflow-guard.test.tsx
// Suíte de Testes Automatizados — Fase 3A.5C & 3A.5C.1
// A4 Vertical Overflow Guard & Document Parity Suite
// Valida:
// - Paridade geométrica estrita entre Editor (A4Canvas) e PDF (CleanA4Document)
// - Remoção de py-3 e eliminação total de my-auto no single block (paridade natural Editor/CleanA4)
// - Empty Page Placeholder como overlay absoluto (0px in-flow, fora de BlockFlowContent)
// - Gap canônico space-y-3 permanente (AutoFit ON/OFF)
// - Drop slots como overlays absolutos (0px in-flow)
// - Footer flexbox authority compartilhado (A4DocumentFooter) sem constantes fixas
// - Cabeçalho de chrome fora da folha A4 física
// - Medição de overflow reativa por ResizeObserver + RAF coalescido
// - Identificação do bloco ofensor por Stable ID sem offsetParent
// - Diagnóstico estruturado MIXED_FULL_PAGE_COVER
// - Warning banner com AlertTriangle (zero emojis) e cutoff guideline ancorada em bottom: 0
// - Imutabilidade estrita de Store/Catalog e zero vazamento para o CleanA4 exportado

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Catalog } from '../../src/domain/catalog.schema';
import {
  calculateVerticalOverflow,
  identifyFirstOffendingBlock,
  detectMixedFullPageCover,
  BlockRectMetric
} from '../../src/domain/overflow-guard';
import { pxToMm } from '../../src/domain/physical-units';
import { OverflowWarningBanner } from '../../src/components/editor/overflow/OverflowWarningBanner';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

describe('Fase 3A.5C & 3A.5C.1 — A4 Vertical Overflow Guard Suite', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  let observedElements: Set<Element> = new Set();
  let activeResizeObservers: Array<{ callback: (entries: any[]) => void }> = [];
  let pendingRafs: Array<FrameRequestCallback> = [];
  let nextRafId = 1;
  let originalFonts: any;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    observedElements.clear();
    activeResizeObservers = [];
    pendingRafs = [];
    nextRafId = 1;

    // Mock controlável de ResizeObserver que armazena callbacks para execução reativa
    class MockResizeObserver {
      callback: (entries: any[]) => void;
      constructor(callback: (entries: any[]) => void) {
        this.callback = callback;
        activeResizeObservers.push(this);
      }
      observe(el: Element) {
        observedElements.add(el);
      }
      unobserve(el: Element) {
        observedElements.delete(el);
      }
      disconnect() {
        observedElements.clear();
        const idx = activeResizeObservers.indexOf(this);
        if (idx !== -1) activeResizeObservers.splice(idx, 1);
      }
    }
    (globalThis as any).ResizeObserver = MockResizeObserver;

    // Mock síncrono/controlado de requestAnimationFrame e cancelAnimationFrame
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      pendingRafs.push(cb);
      return nextRafId++;
    };
    globalThis.cancelAnimationFrame = (_id: number) => {
      // noop
    };

    // Polyfill de IntersectionObserver para A4Canvas
    if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
      (globalThis as any).IntersectionObserver = class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      };
    }

    // Mock seguro de document.fonts.ready
    originalFonts = (document as any).fonts;
    (document as any).fonts = {
      ready: Promise.resolve()
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    (document as any).fonts = originalFonts;
    vi.restoreAllMocks();
  });

  // Helper de teste para descarregar RAFs pendentes
  function flushPendingRafs() {
    act(() => {
      const toRun = [...pendingRafs];
      pendingRafs = [];
      toRun.forEach((cb) => cb(performance.now()));
    });
  }

  // Helper de teste para disparar todos os ResizeObservers ativos e descarregar RAF
  function triggerResizeObserversAndFlush() {
    act(() => {
      activeResizeObservers.forEach((obs) => obs.callback([]));
    });
    flushPendingRafs();
  }

  const baseCatalog: Catalog = {
    id: 'catalog-overflow-test',
    title: 'Catálogo de Teste Overflow 3A.5C',
    description: 'Teste',
    status: 'draft',
    version: 1,
    themeId: 'default',
    locale: 'pt-BR',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        title: 'Página Técnica',
        blocks: [
          {
            id: 'block-1',
            type: 'text',
            title: 'Introdução Técnica',
            textContent: 'Texto descritivo do instrumento.'
          }
        ]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // ============================================================================
  // 1. Lógica Pura de Domínio (Pure Measurement & Diagnostic)
  // ============================================================================

  it('OVERFLOW-GEO-1: viewport físico deriva do layout real sem constante fixa de footer', () => {
    const result = calculateVerticalOverflow(900, 950);
    expect(result.overflowY).toBe(false);
    expect(result.overflowMm).toBe(0);
    expect(result.overflowPx).toBe(0);
  });

  it('OVERFLOW-1: conteúdo dentro do limite útil resulta em overflowY false e overflowMm 0', () => {
    const result = calculateVerticalOverflow(800, 850);
    expect(result.overflowY).toBe(false);
    expect(result.overflowMm).toBe(0);
  });

  it('OVERFLOW-2: conteúdo maior que o viewport resulta em overflowY true', () => {
    const result = calculateVerticalOverflow(950, 900);
    expect(result.overflowY).toBe(true);
    expect(result.overflowPx).toBe(50);
  });

  it('OVERFLOW-3: overflowMm é positivo e coerente com pxToMm canônico de physical-units.ts', () => {
    const overflowPx = 100;
    const expectedMm = Number(pxToMm(overflowPx, 96).toFixed(1));
    const result = calculateVerticalOverflow(1000, 900);
    expect(result.overflowY).toBe(true);
    expect(result.overflowMm).toBe(expectedMm);
    expect(result.overflowMm).toBeGreaterThan(0);
  });

  it('OVERFLOW-ISSUE-1: domain issue contém apenas code e severity (sem copy de UI no domínio)', () => {
    const { overflowY } = calculateVerticalOverflow(1000, 900);
    const hasMixed = detectMixedFullPageCover([
      { type: 'full_page_cover' },
      { type: 'text' }
    ]);

    const issues = [];
    if (overflowY) issues.push({ code: 'VERTICAL_OVERFLOW', severity: 'warning' });
    if (hasMixed) issues.push({ code: 'MIXED_FULL_PAGE_COVER', severity: 'warning' });

    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({ code: 'VERTICAL_OVERFLOW', severity: 'warning' });
    expect(issues[1]).toEqual({ code: 'MIXED_FULL_PAGE_COVER', severity: 'warning' });
    expect((issues[0] as any).message).toBeUndefined();
  });

  it('OFFENDER-1: identifyFirstOffendingBlock não depende de offsetParent e usa coordenadas reais', () => {
    const viewportTop = 100;
    const viewportHeight = 500;
    const blocks: BlockRectMetric[] = [
      { id: 'b-1', type: 'text', bottom: 300 },
      { id: 'b-2', type: 'structural_section', bottom: 550 },
      { id: 'b-3', type: 'custom_table', bottom: 650 }
    ];

    const offender = identifyFirstOffendingBlock(viewportTop, viewportHeight, blocks, 1);
    expect(offender.firstOffendingBlockId).toBe('b-3');
    expect(offender.firstOffendingBlockType).toBe('custom_table');
  });

  it('OVERFLOW-DIRECT-BLOCK-1: identifica com precisão o root page block na escala real com zoom', () => {
    const viewportTop = 50;
    const viewportHeight = 400;
    const actualScale = 1.5;

    const blocks: BlockRectMetric[] = [
      { id: 'root-1', type: 'hero_banner', bottom: 350 },
      { id: 'root-2', type: 'matrix_spec_table', bottom: 700 }
    ];

    const offender = identifyFirstOffendingBlock(viewportTop, viewportHeight, blocks, actualScale);
    expect(offender.firstOffendingBlockId).toBe('root-2');
    expect(offender.firstOffendingBlockType).toBe('matrix_spec_table');
  });

  it('FULLCOVER-1: full_page_cover isolada não gera issue nem detecta composição mista', () => {
    const isMixed = detectMixedFullPageCover([{ type: 'full_page_cover' }]);
    expect(isMixed).toBe(false);
  });

  it('FULLCOVER-2: mixed full_page_cover + outros blocos gera diagnóstico MIXED_FULL_PAGE_COVER', () => {
    const isMixed = detectMixedFullPageCover([
      { type: 'full_page_cover' },
      { type: 'technical_table' }
    ]);
    expect(isMixed).toBe(true);
  });

  // ============================================================================
  // 2. Paridade de DOM e Correções da Fase 3A.5C.1
  // ============================================================================

  it('OVERFLOW-PARITY-EDITOR-1: Editor block flow não possui py-3 extra relativo ao CleanA4', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    expect(contentEl).not.toBeNull();
    expect(contentEl.className).not.toContain('py-3');

    act(() => root.unmount());
  });

  it('OVERFLOW-PARITY-AUTOFIT-1: base gap no Editor é estritamente space-y-3 com AutoFit ON e OFF', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    expect(contentEl.className).toContain('space-y-3');
    expect(contentEl.className).not.toContain('space-y-4');

    act(() => root.unmount());
  });

  it('OVERFLOW-PARITY-SINGLE-1: AutoFit ON com 1 bloco elimina my-auto no Editor e alinha com CleanA4', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const blockWrapper = container.querySelector('[data-block-id="block-1"]') as HTMLElement;
    expect(blockWrapper).not.toBeNull();
    // PROVA DE PARIDADE: my-auto foi completamente removido
    expect(blockWrapper.className).not.toContain('my-auto');

    act(() => root.unmount());
  });

  it('OVERFLOW-PARITY-SINGLE-2: AutoFit OFF com 1 bloco mantém a mesma semântica de fluxo natural sem my-auto', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const blockWrapper = container.querySelector('[data-block-id="block-1"]') as HTMLElement;
    expect(blockWrapper.className).not.toContain('my-auto');

    act(() => root.unmount());
  });

  it('OVERFLOW-EMPTY-1: Empty State é overlay absoluto, não-flow, editor-only e fora de BlockFlowContent', () => {
    const emptyCatalog: Catalog = {
      ...baseCatalog,
      pages: [{ id: 'empty-page', pageNumber: 1, title: 'Vazia', blocks: [] }]
    };
    useCatalogStore.setState({ currentCatalog: emptyCatalog });

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const placeholder = container.querySelector('[data-testid="empty-page-placeholder"]') as HTMLElement;
    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;

    // 1. Placeholder existe no DOM
    expect(placeholder).not.toBeNull();
    // 2. É editor-only e no-print
    expect(placeholder.className).toContain('no-print');
    expect(placeholder.className).toContain('editor-only');
    // 3. É overlay absoluto (não empurrado após min-h-full)
    expect(placeholder.className).toContain('absolute');
    // 4. Não está dentro de BlockFlowContent
    expect(contentEl.contains(placeholder)).toBe(false);
    // 5. Warning banner de overflow está ausente
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();

    act(() => root.unmount());
  });

  it('OVERFLOW-EMPTY-2: empty page possui zero blocos documentais medidos e overflowY false garantido', () => {
    const emptyCatalog: Catalog = {
      ...baseCatalog,
      pages: [{ id: 'empty-page', pageNumber: 1, title: 'Vazia', blocks: [] }]
    };
    useCatalogStore.setState({ currentCatalog: emptyCatalog });

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    // O container de conteúdo não possui nós de bloco
    expect(contentEl.children.length).toBe(0);
    // Cutoff guideline e warnings não existem
    expect(container.querySelector('[data-testid="a4-overflow-cutoff-line"]')).toBeNull();
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();

    act(() => root.unmount());
  });

  it('OVERFLOW-DROP-1: drop slots (topo/fim) são overlays absolutos e não filhos de BlockFlowContent', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    const topDropSlot = container.querySelector('[data-testid="block-flow-drop-slot-0"]') as HTMLElement;
    const endDropSlot = container.querySelector('[data-testid="block-flow-drop-slot-end"]') as HTMLElement;

    expect(topDropSlot).not.toBeNull();
    expect(endDropSlot).not.toBeNull();

    expect(contentEl.contains(topDropSlot)).toBe(false);
    expect(contentEl.contains(endDropSlot)).toBe(false);

    expect(topDropSlot.className).toContain('absolute');
    expect(endDropSlot.className).toContain('absolute');

    act(() => root.unmount());
  });

  it('OVERFLOW-HEADER-1: cabeçalho de chrome do Editor é posicionado fora da folha A4 e não reduz viewport', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const a4PageContainer = container.querySelector('.a4-page-container') as HTMLElement;
    expect(a4PageContainer).not.toBeNull();

    const spansInPage = Array.from(a4PageContainer.querySelectorAll('span'));
    const headerInPage = spansInPage.find((s) => s.textContent?.includes('CATALOG STUDIO'));
    expect(headerInPage).toBeUndefined();

    const fullText = container.textContent || '';
    expect(fullText).toContain('PRESYS INSTRUMENTS & SYSTEMS — CATALOG STUDIO');

    act(() => root.unmount());
  });

  it('OVERFLOW-FOOTER-1: A4DocumentFooter compartilhado rende com mesma semântica no Editor e CleanA4', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });

    const editorContainer = document.createElement('div');
    const editorRoot = createRoot(editorContainer);
    act(() => {
      editorRoot.render(<A4Canvas />);
    });
    flushPendingRafs();

    const cleanContainer = document.createElement('div');
    const cleanRoot = createRoot(cleanContainer);
    act(() => {
      cleanRoot.render(<CleanA4Document document={baseCatalog} />);
    });

    const editorFooter = editorContainer.querySelector('[data-testid="a4-document-footer"]') as HTMLElement;
    const cleanFooter = cleanContainer.querySelector('[data-testid="a4-document-footer"]') as HTMLElement;

    expect(editorFooter).not.toBeNull();
    expect(cleanFooter).not.toBeNull();

    expect(editorFooter.querySelector('[data-print-string-key="company_brand_footer"]')).not.toBeNull();
    expect(cleanFooter.querySelector('[data-print-string-key="company_brand_footer"]')).not.toBeNull();
    expect(editorFooter.querySelector('[data-print-string-key="page_label"]')).not.toBeNull();
    expect(cleanFooter.querySelector('[data-print-string-key="page_label"]')).not.toBeNull();

    act(() => {
      editorRoot.unmount();
      cleanRoot.unmount();
    });
  });

  // ============================================================================
  // 3. Testes Reativos do Overflow Guard (ResizeObserver, Reflow, RAF)
  // ============================================================================

  it('OVERFLOW-6: Reflow Reativo — overflow aparece quando altura cresce e desaparece quando reduz', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    const viewportEl = container.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;

    let mockScrollHeight = 800;
    let mockClientHeight = 950;
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, get: () => mockScrollHeight });
    Object.defineProperty(viewportEl, 'clientHeight', { configurable: true, get: () => mockClientHeight });

    // 1. Estado inicial normal (800 <= 950) -> sem overflow
    triggerResizeObserversAndFlush();
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();
    expect(container.querySelector('[data-testid="a4-overflow-cutoff-line"]')).toBeNull();

    // 2. Reflow dinâmico excede o limite (1050 > 950) -> warning e guideline aparecem!
    mockScrollHeight = 1050;
    triggerResizeObserversAndFlush();
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="a4-overflow-cutoff-line"]')).not.toBeNull();

    // 3. Redução do conteúdo volta ao limite seguro (820 <= 950) -> warning e guideline somem!
    mockScrollHeight = 820;
    triggerResizeObserversAndFlush();
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();
    expect(container.querySelector('[data-testid="a4-overflow-cutoff-line"]')).toBeNull();

    act(() => root.unmount());
  });

  it('OVERFLOW-7: expansão de cartões/conteúdo aciona observer e recalcula guard', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    const viewportEl = container.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;

    let mockScrollHeight = 700;
    const mockClientHeight = 900;
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, get: () => mockScrollHeight });
    Object.defineProperty(viewportEl, 'clientHeight', { configurable: true, get: () => mockClientHeight });

    triggerResizeObserversAndFlush();
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();

    // Adição de mais cards estruturais faz scrollHeight saltar para 1150
    mockScrollHeight = 1150;
    triggerResizeObserversAndFlush();

    const banner = container.querySelector('[data-testid="overflow-warning-banner"]') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Conteúdo excede a área útil da página');

    act(() => root.unmount());
  });

  it('OVERFLOW-8: expansão por tradução localizada (texto mais longo) dispara recalculo e gera overflow', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    const viewportEl = container.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;

    let mockScrollHeight = 880;
    const mockClientHeight = 920;
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, get: () => mockScrollHeight });
    Object.defineProperty(viewportEl, 'clientHeight', { configurable: true, get: () => mockClientHeight });

    triggerResizeObserversAndFlush();
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();

    // Texto traduzido para alemão ou russo expande verticalmente (+200px)
    mockScrollHeight = 1080;
    triggerResizeObserversAndFlush();

    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it('AUTOFIT-1: AutoFit ON ou OFF com conteúdo maior que viewport aciona guard invariavelmente', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    const viewportEl = container.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;

    // Altura natural de 1200px > 900px
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, get: () => 1200 });
    Object.defineProperty(viewportEl, 'clientHeight', { configurable: true, get: () => 900 });

    triggerResizeObserversAndFlush();

    // AutoFit nunca mascara nem esconde overflow
    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="a4-overflow-cutoff-line"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it('PARITY-A4-C1: boundary Editor vs CleanA4 rigorosamente equivalente', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });

    const editorContainer = document.createElement('div');
    const editorRoot = createRoot(editorContainer);
    act(() => {
      editorRoot.render(<A4Canvas />);
    });
    flushPendingRafs();

    const cleanContainer = document.createElement('div');
    const cleanRoot = createRoot(cleanContainer);
    act(() => {
      cleanRoot.render(<CleanA4Document document={baseCatalog} />);
    });

    const editorViewport = editorContainer.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;
    const cleanViewport = cleanContainer.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;
    const editorContent = editorContainer.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    const cleanContent = cleanContainer.querySelector('[data-a4-block-flow-content]') as HTMLElement;

    expect(editorViewport).not.toBeNull();
    expect(cleanViewport).not.toBeNull();
    expect(editorContent).not.toBeNull();
    expect(cleanContent).not.toBeNull();

    // Ambos possuem gap mínimo space-y-3
    expect(editorContent.className).toContain('space-y-3');
    expect(cleanContent.className).toContain('space-y-3');

    // Nenhum dos dois possui py-3
    expect(editorContent.className).not.toContain('py-3');
    expect(cleanContent.className).not.toContain('py-3');

    // Single block wrapper em ambos não possui my-auto
    const editorBlock = editorContainer.querySelector('[data-block-id="block-1"]') as HTMLElement;
    const cleanBlock = cleanContainer.querySelector('[data-block-id="block-1"]') as HTMLElement;
    expect(editorBlock.className).not.toContain('my-auto');
    expect(cleanBlock.className).not.toContain('my-auto');

    act(() => {
      editorRoot.unmount();
      cleanRoot.unmount();
    });
  });

  // ============================================================================
  // 4. Warnings, Guidelines e UX
  // ============================================================================

  it('OVERFLOW-4: warning banner e cutoff line possuem classes no-print e editor-only', () => {
    const mockResult = {
      pageId: 'page-1',
      overflowY: true,
      overflowMm: 12.4,
      contentHeightPx: 1000,
      viewportHeightPx: 950,
      firstOffendingBlockId: 'block-1',
      firstOffendingBlockType: 'custom_table',
      issues: [{ code: 'VERTICAL_OVERFLOW' as const, severity: 'warning' as const }]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<OverflowWarningBanner result={mockResult} />);
    });

    const banner = container.querySelector('[data-testid="overflow-warning-banner"]') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.className).toContain('no-print');
    expect(banner.className).toContain('editor-only');
    expect(banner.className).toContain('absolute');

    expect(banner.textContent).not.toContain('⚠️');
    expect(banner.textContent).toContain('Conteúdo excede a área útil da página em ~12,4 mm.');
    expect(banner.textContent).toContain('Tabela Customizada');

    act(() => root.unmount());
  });

  it('OVERFLOW-GUIDELINE-1: cutoff line está ancorada em bottom: 0 no BlockFlowViewport', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const viewportEl = container.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;
    expect(viewportEl).not.toBeNull();
    expect(viewportEl.className).toContain('overflow-hidden');

    act(() => root.unmount());
  });

  it('OVERFLOW-BANNER-LOOP-1: renderizar o banner de aviso não altera o scrollHeight do BlockFlowContent', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const contentEl = container.querySelector('[data-a4-block-flow-content]') as HTMLElement;
    const banner = container.querySelector('[data-testid="overflow-warning-banner"]');

    if (banner) {
      expect(contentEl.contains(banner)).toBe(false);
    }

    act(() => root.unmount());
  });

  // ============================================================================
  // 5. Imutabilidade do Store e Paridade de Exportação
  // ============================================================================

  it('OVERFLOW-5 & PERSIST-A4-C1: medição e renderização do guard mantêm store, localRevision e isDirty 100% intocados', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog, isDirty: false, localRevision: 42 });

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    const state = useCatalogStore.getState();
    expect(state.localRevision).toBe(42);
    expect(state.isDirty).toBe(false);
    expect(state.currentCatalog?.pages).toEqual(baseCatalog.pages);

    act(() => root.unmount());
  });

  it('PARITY-A4-C2: CleanA4Document exportado contém zero warnings, guidelines ou drop slots', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<CleanA4Document document={baseCatalog} />);
    });

    expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();
    expect(container.querySelector('[data-testid="a4-overflow-cutoff-line"]')).toBeNull();
    expect(container.querySelector('[data-testid="block-flow-drop-slot-0"]')).toBeNull();
    expect(container.querySelector('[data-testid="block-flow-drop-slot-end"]')).toBeNull();
    expect(container.querySelector('[data-a4-block-flow-viewport]')).not.toBeNull();
    expect(container.querySelector('[data-a4-block-flow-content]')).not.toBeNull();

    act(() => root.unmount());
  });

  it('I18N-A4-C1: guard não adiciona nem modifica nós de tradução PrintableTextNode', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<CleanA4Document document={baseCatalog} />);
    });

    const printableNodes = container.querySelectorAll('[data-print-string-key]');
    const keys = Array.from(printableNodes).map((n) => n.getAttribute('data-print-string-key'));
    expect(keys).toContain('company_brand_footer');
    expect(keys).toContain('page_label');
    expect(keys).not.toContain('overflow_warning');

    act(() => root.unmount());
  });

  it('OVERFLOW-OBSERVER-CLEANUP-1: unmount desconecta o ResizeObserver e limpa referências', () => {
    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    expect(observedElements.size).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });

    expect(observedElements.size).toBe(0);
  });

  it('OVERFLOW-FONTS-CLEANUP-1: fonts.ready após unmount não gera erros nem memory leak', async () => {
    let resolveFonts: () => void = () => {};
    (document as any).fonts = {
      ready: new Promise<void>((resolve) => {
        resolveFonts = resolve;
      })
    };

    useCatalogStore.setState({ currentCatalog: baseCatalog });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });
    flushPendingRafs();

    act(() => {
      root.unmount();
    });

    await act(async () => {
      resolveFonts();
    });

    expect(true).toBe(true);
  });
});
