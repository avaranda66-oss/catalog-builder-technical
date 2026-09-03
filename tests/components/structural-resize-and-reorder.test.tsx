// tests/components/structural-resize-and-reorder.test.tsx
// Suíte de Testes Automatizados — Fase 3A.5B Structural Resize + Logical Reorder + Interaction Isolation
// Valida:
// - Cálculo puro de resize snapped (0.5mm) com compensação de escala real
// - Interaction Frame com zero vazamento para o CleanA4 (renderer compartilhado puro)
// - Cancelamento seguro (Escape, pointercancel, remote divergence)
// - Prevenção de save storm (100 pointermove = 0 mutações, 1 pointerup = 1 mutação)
// - Reordenação lógica fail-closed de seções e cards por Stable IDs
// - Reset explícito de largura ("Restaurar padrão" e "Usar largura máxima")
// - Preservação estrita de PrintableTextNode IDs e paridade do CleanA4

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Catalog, ContentBlock } from '../../src/domain/catalog.schema';
import {
  calculateSnappedResizeWidthMm,
  moveStructuralChildToIndex
} from '../../src/domain/structural-interaction';
import { getPageContentBox } from '../../src/domain/page-geometry';
import { mmToPx } from '../../src/domain/physical-units';
import { createStructuralSectionFromPreset } from '../../src/domain/structural-presets';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { StructuralSectionInteractionFrame } from '../../src/components/editor/frames/StructuralSectionInteractionFrame';
import { StructuralSectionInspector } from '../../src/components/editor/inspector/StructuralSectionInspector';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { extractStructuralBlocks } from '../../src/translation/block-extractors/structural.extractor';

describe('Fase 3A.5B — Structural Resize & Reorder Suite', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  // Polyfills para JSDOM
  beforeEach(() => {
    class MockPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, params: any = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 1;
      }
    }
    if (typeof (globalThis as any).PointerEvent === 'undefined') {
      (globalThis as any).PointerEvent = MockPointerEvent;
    }
    if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
      (globalThis as any).IntersectionObserver = class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      };
    }
    Element.prototype.setPointerCapture = vi.fn(function (this: Element, _pointerId: number) {});
    Element.prototype.releasePointerCapture = vi.fn(function (this: Element, _pointerId: number) {});
  });

  const contentBox = getPageContentBox();
  const availableWidthMm = contentBox.availableWidthMm; // 193.0666

  const sampleSectionBlock: ContentBlock = {
    ...createStructuralSectionFromPreset('structural-feature-grid', 'pt-BR'),
    id: 'block-sec-test-5b'
  };

  const initialCatalog: Catalog = {
    id: 'catalog-test-5b',
    title: 'Catálogo de Teste Fase 3A.5B',
    version: 1,
    themeId: 'presys-default',
    locale: 'pt-BR',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        blocks: [sampleSectionBlock]
      }
    ]
  };

  beforeEach(() => {
    useCatalogStore.setState({
      currentCatalog: JSON.parse(JSON.stringify(initialCatalog)),
      activePageIndex: 0,
      selectedBlockId: sampleSectionBlock.id,
      selectedChildId: null,
      localRevision: 0,
      isDirty: false
    });
  });

  // ==========================================================================
  // GRUPO 1: Matemática Pura de Resize & Snap 0.5 mm
  // ==========================================================================

  it('WIDTH-6: Escalas reais do DOM (50%, 75%, 100%, 125%) produzem o mesmo resultado físico em milímetros', () => {
    const initialWidthMm = 150;
    const baseDeltaScreenPx = mmToPx(10, 96); // 10 mm em pixels a 100%

    const scales = [0.5, 0.75, 1.0, 1.25];
    for (const scale of scales) {
      // O delta de pixels medido na tela é proporcional à escala renderizada
      const screenDeltaPx = baseDeltaScreenPx * scale;
      const result = calculateSnappedResizeWidthMm({
        initialWidthMm,
        deltaXPixels: screenDeltaPx,
        actualScale: scale,
        anchor: 'left',
        handleSide: 'right',
        availableWidthMm
      });
      // 150 + 10 = 160 mm exatamente
      expect(result).toBe(160);
    }
  });

  it('WIDTH-9: Snap manual restrito a steps de 0.5 mm e clamp no limite útil da página', () => {
    // Teste 1: Movimento de 1.2 mm a partir de 150 mm -> snap para 151 mm
    const delta1 = mmToPx(1.2, 96);
    const result1 = calculateSnappedResizeWidthMm({
      initialWidthMm: 150,
      deltaXPixels: delta1,
      actualScale: 1,
      anchor: 'left',
      handleSide: 'right',
      availableWidthMm
    });
    expect(result1).toBe(151);

    // Teste 2: Movimento de 1.4 mm a partir de 150 mm -> snap para 151.5 mm
    const delta2 = mmToPx(1.4, 96);
    const result2 = calculateSnappedResizeWidthMm({
      initialWidthMm: 150,
      deltaXPixels: delta2,
      actualScale: 1,
      anchor: 'left',
      handleSide: 'right',
      availableWidthMm
    });
    expect(result2).toBe(151.5);

    // Teste 3: Clamp superior em availableWidthMm (193.0666 mm)
    const largeDelta = mmToPx(100, 96);
    const resultClamped = calculateSnappedResizeWidthMm({
      initialWidthMm: 150,
      deltaXPixels: largeDelta,
      actualScale: 1,
      anchor: 'left',
      handleSide: 'right',
      availableWidthMm
    });
    expect(resultClamped).toBe(availableWidthMm);

    // Teste 4: Clamp inferior no menor step positivo (0.5 mm)
    const negativeDelta = mmToPx(-200, 96);
    const resultMin = calculateSnappedResizeWidthMm({
      initialWidthMm: 150,
      deltaXPixels: negativeDelta,
      actualScale: 1,
      anchor: 'left',
      handleSide: 'right',
      availableWidthMm
    });
    expect(resultMin).toBe(0.5);
  });

  it('WIDTH-ANCHOR-CENTER: Âncora central varia largura simetricamente mantendo o centro', () => {
    const initialWidthMm = 120;
    const delta = mmToPx(5, 96); // Arrastar 5 mm para a direita
    const result = calculateSnappedResizeWidthMm({
      initialWidthMm,
      deltaXPixels: delta,
      actualScale: 1,
      anchor: 'center',
      handleSide: 'right',
      availableWidthMm
    });
    // Varia 2 * 5 mm = 10 mm -> 130 mm
    expect(result).toBe(130);
  });

  // ==========================================================================
  // GRUPO 2: Ciclo de Vida do Pointer, Cancelamentos e Prevenção de Save Storm
  // ==========================================================================

  it('WIDTH-8 & SAVE-INTERACTION-1: 100 pointermoves não geram mutações; pointerup gera exatamente uma mutação', () => {
    // Configura bloco em fixed 150mm
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: fixedBlock.id
    });

    const initialRevision = useCatalogStore.getState().localRevision;

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          pageIndex={0}
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;
    expect(rightHandle).not.toBeNull();

    // Inicia resize via PointerDown
    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 100,
          pointerId: 1
        })
      );
    });

    // 100 pointermove consecutivos
    for (let i = 1; i <= 100; i++) {
      act(() => {
        rightHandle.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: 100 + i * 0.5,
            pointerId: 1
          })
        );
      });
      // Zero mutações durante todo o drag
      expect(useCatalogStore.getState().localRevision).toBe(initialRevision);
    }

    // PointerUp final com movimento consolidado
    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 150,
          pointerId: 1
        })
      );
    });

    // Exatamente UMA mutação comitada no final
    expect(useCatalogStore.getState().localRevision).toBe(initialRevision + 1);
    const updatedLayout = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0].structuralData?.layout;
    expect(updatedLayout?.widthMode).toBe('fixed');
    expect(updatedLayout?.fixedWidthMm).toBeGreaterThan(150);

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-7: Pressionar Escape durante o resize cancela o preview e não altera o store', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: fixedBlock.id
    });

    const initialRevision = useCatalogStore.getState().localRevision;

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          pageIndex={0}
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;

    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 100,
          pointerId: 1
        })
      );
    });

    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 180,
          pointerId: 1
        })
      );
    });

    // Pressiona Escape
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    // Em seguida pointerup
    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 180,
          pointerId: 1
        })
      );
    });

    // Zero mutação no store
    expect(useCatalogStore.getState().localRevision).toBe(initialRevision);
    const layout = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0].structuralData?.layout;
    expect(layout?.fixedWidthMm).toBe(150);

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-10: Pointerdown seguido de Pointerup sem alteração efetiva de largura resulta em zero mutação', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: fixedBlock.id
    });

    const initialRevision = useCatalogStore.getState().localRevision;

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          pageIndex={0}
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;

    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 100,
          pointerId: 1
        })
      );
    });

    // Pointerup nas mesmas coordenadas
    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 100,
          pointerId: 1
        })
      );
    });

    expect(useCatalogStore.getState().localRevision).toBe(initialRevision);

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-11: Se o bloco for removido da página durante a interação, o commit é cancelado (fail-closed)', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: fixedBlock.id
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          pageIndex={0}
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;

    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 100,
          pointerId: 1
        })
      );
    });

    // Remove o bloco do Store durante o drag
    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [] }]
      }
    });

    const revBeforeUp = useCatalogStore.getState().localRevision;

    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 150,
          pointerId: 1
        })
      );
    });

    // Zero nova mutação
    expect(useCatalogStore.getState().localRevision).toBe(revBeforeUp);

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-12: Divergência externa da largura durante o resize cancela a mutação local (fail-closed conservador)', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: fixedBlock.id
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          pageIndex={0}
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;

    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 100,
          pointerId: 1
        })
      );
    });

    // Simula alteração externa no Store
    useCatalogStore.setState((state) => ({
      currentCatalog: {
        ...state.currentCatalog!,
        pages: [
          {
            ...state.currentCatalog!.pages[0],
            blocks: [
              {
                ...fixedBlock,
                structuralData: {
                  ...fixedBlock.structuralData!,
                  layout: {
                    ...fixedBlock.structuralData!.layout,
                    fixedWidthMm: 170 // alterado remotamente
                  }
                }
              }
            ]
          }
        ]
      }
    }));

    const revBeforeUp = useCatalogStore.getState().localRevision;

    act(() => {
      rightHandle.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 150,
          pointerId: 1
        })
      );
    });

    // O commit local foi abortado para não sobrescrever a alteração externa
    expect(useCatalogStore.getState().localRevision).toBe(revBeforeUp);
    const layout = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0].structuralData?.layout;
    expect(layout?.fixedWidthMm).toBe(170);

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // GRUPO 3: Ações de Reset no Inspector ("Restaurar padrão" e "Usar largura máxima")
  // ==========================================================================

  it('WIDTH-RESET-1: "Restaurar padrão" redefine para Fill e remove fixedWidthMm', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      }
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={fixedBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      const header = container.querySelector<HTMLButtonElement>('#inspector-section-layout-header');
      if (header?.getAttribute('aria-expanded') !== 'true') {
        header?.click();
      }
    });

    // Localiza botão "Restaurar padrão"
    const buttons = Array.from(container.querySelectorAll('button'));
    const resetBtn = buttons.find((b) => b.textContent?.includes('Restaurar padrão'));
    expect(resetBtn).toBeDefined();

    act(() => {
      resetBtn!.click();
    });

    const state = useCatalogStore.getState();
    const updatedBlock = state.currentCatalog?.pages[0].blocks[0];
    expect(updatedBlock?.structuralData?.layout.widthMode).toBe('fill');
    expect(updatedBlock?.structuralData?.layout.fixedWidthMm).toBeUndefined();
    // JSON não contém fixedWidthMm
    expect('fixedWidthMm' in (updatedBlock?.structuralData?.layout || {})).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-RESET-2: "Usar largura máxima" redefine para largura canônica de 193.0666 mm em modo Fixed', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      }
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={fixedBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      const header = container.querySelector<HTMLButtonElement>('#inspector-section-layout-header');
      if (header?.getAttribute('aria-expanded') !== 'true') {
        header?.click();
      }
    });

    // Localiza botão "Usar largura máxima"
    const buttons = Array.from(container.querySelectorAll('button'));
    const maxBtn = buttons.find((b) => b.textContent?.includes('Usar largura máxima'));
    expect(maxBtn).toBeDefined();

    act(() => {
      maxBtn!.click();
    });

    const state = useCatalogStore.getState();
    const updatedBlock = state.currentCatalog?.pages[0].blocks[0];
    expect(updatedBlock?.structuralData?.layout.widthMode).toBe('fixed');
    expect(updatedBlock?.structuralData?.layout.fixedWidthMm).toBe(availableWidthMm);

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // GRUPO 4: Reordenação Lógica de Seções e Blocos
  // ==========================================================================

  it('REORDER-SECTION-1: Reordenação de seções preserva Stable IDs e integridade do catálogo', () => {
    const sec1: ContentBlock = { ...sampleSectionBlock, id: 'sec-1', title: 'Seção 1' };
    const sec2: ContentBlock = { ...sampleSectionBlock, id: 'sec-2', title: 'Seção 2' };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [sec1, sec2] }]
      }
    });

    // Move sec-1 para baixo
    act(() => {
      useCatalogStore.getState().moveStructuralSectionOnPage('page-1', 'sec-1', 'down');
    });

    const blocks = useCatalogStore.getState().currentCatalog?.pages[0].blocks || [];
    expect(blocks.map((b) => b.id)).toEqual(['sec-2', 'sec-1']);
    expect(blocks[0].title).toBe('Seção 2');
    expect(blocks[1].title).toBe('Seção 1');
  });

  it('REORDER-SECTION-2: Seção pode atravessar bloco legado mantendo dados legados 100% intactos', () => {
    const legacyBlock: ContentBlock = {
      id: 'legacy-table-1',
      type: 'matrix_spec_table',
      title: 'Tabela Legada Intacta',
      tableRows: [{ id: 'r1', productRefId: 'PCON-Y18', localOverrides: { col1: 'Val 1' } }]
    };
    const sec: ContentBlock = { ...sampleSectionBlock, id: 'sec-1' };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [legacyBlock, sec] }]
      }
    });

    // Move sec-1 para cima (índice 0) atravessando o bloco legado
    act(() => {
      useCatalogStore.getState().moveStructuralSectionOnPage('page-1', 'sec-1', 'up');
    });

    const blocks = useCatalogStore.getState().currentCatalog?.pages[0].blocks || [];
    expect(blocks.map((b) => b.id)).toEqual(['sec-1', 'legacy-table-1']);
    // Dados legados perfeitamente intactos
    expect(blocks[1].type).toBe('matrix_spec_table');
    expect(blocks[1].title).toBe('Tabela Legada Intacta');
    expect(blocks[1].tableRows?.[0].productRefId).toBe('PCON-Y18');
  });

  it('REORDER-SECTION-3: Seleção do bloco permanece selecionada após reordenação', () => {
    const sec1: ContentBlock = { ...sampleSectionBlock, id: 'sec-1' };
    const sec2: ContentBlock = { ...sampleSectionBlock, id: 'sec-2' };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [sec1, sec2] }]
      },
      selectedBlockId: 'sec-1'
    });

    act(() => {
      useCatalogStore.getState().reorderStructuralSectionOnPage('page-1', 'sec-1', 1);
    });

    expect(useCatalogStore.getState().selectedBlockId).toBe('sec-1');
  });

  it('REORDER-LEGACY-1: Tentativa de mover bloco legado via actions estruturais resulta em fail-closed (zero mutation)', () => {
    const legacyBlock: ContentBlock = {
      id: 'legacy-table-1',
      type: 'matrix_spec_table',
      title: 'Tabela Legada'
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [legacyBlock] }]
      }
    });

    const initialRev = useCatalogStore.getState().localRevision;

    act(() => {
      useCatalogStore.getState().moveStructuralSectionOnPage('page-1', 'legacy-table-1', 'down');
    });

    expect(useCatalogStore.getState().localRevision).toBe(initialRev);
  });

  it('REORDER-SECTION-FAIL-1: Índices fora do limite ou mesmo índice não disparam mutações', () => {
    const sec1: ContentBlock = { ...sampleSectionBlock, id: 'sec-1' };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [sec1] }]
      }
    });

    const initialRev = useCatalogStore.getState().localRevision;

    // Tentativa com índice negativo
    act(() => {
      useCatalogStore.getState().reorderStructuralSectionOnPage('page-1', 'sec-1', -1);
    });
    expect(useCatalogStore.getState().localRevision).toBe(initialRev);

    // Tentativa com índice >= length
    act(() => {
      useCatalogStore.getState().reorderStructuralSectionOnPage('page-1', 'sec-1', 5);
    });
    expect(useCatalogStore.getState().localRevision).toBe(initialRev);

    // Tentativa com mesmo índice
    act(() => {
      useCatalogStore.getState().reorderStructuralSectionOnPage('page-1', 'sec-1', 0);
    });
    expect(useCatalogStore.getState().localRevision).toBe(initialRev);
  });

  // ==========================================================================
  // GRUPO 5: Reordenação Lógica de Cards Filhos
  // ==========================================================================

  it('REORDER-CARD-1 & REORDER-CARD-2: Reordenação de cards por targetIndex preserva Stable IDs e validação Zod', () => {
    const section = sampleSectionBlock;
    const children = section.structuralData!.children;
    const [c0, c1, c2, c3] = children.map((c) => c.id);

    const result = moveStructuralChildToIndex(section.structuralData!, c0, 1);
    expect(result.found).toBe(true);
    expect(result.moved).toBe(true);
    expect(result.data.children.map((c) => c.id)).toEqual([c1, c0, c2, c3]);
  });

  it('REORDER-CARD-3: Seleção do card filho (selectedChildId) é preservada durante reordenação', () => {
    const section = sampleSectionBlock;
    const cardIdToSelect = section.structuralData!.children[1].id;

    useCatalogStore.setState({
      selectedBlockId: section.id,
      selectedChildId: cardIdToSelect
    });

    act(() => {
      useCatalogStore.getState().reorderStructuralChild('page-1', section.id, cardIdToSelect, 0);
    });

    // selectedChildId continua o mesmo ID
    expect(useCatalogStore.getState().selectedChildId).toBe(cardIdToSelect);
  });

  it('REORDER-CARD-4: Controles acessíveis existentes (ArrowUp / ArrowDown) continuam operacionais', () => {
    const section = sampleSectionBlock;
    const card0 = section.structuralData!.children[0].id;
    const card1 = section.structuralData!.children[1].id;

    // Move card1 para cima
    act(() => {
      useCatalogStore.getState().moveStructuralChild('page-1', section.id, card1, 'up');
    });

    const currentChildren = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0].structuralData?.children;
    expect(currentChildren?.[0].id).toBe(card1);
    expect(currentChildren?.[1].id).toBe(card0);
  });

  it('REORDER-FAIL-1: Seção ou card inexistente resulta em no-op fail-closed', () => {
    const initialRev = useCatalogStore.getState().localRevision;

    act(() => {
      useCatalogStore.getState().reorderStructuralChild('page-1', 'non-existent-sec', 'card-1', 0);
    });
    expect(useCatalogStore.getState().localRevision).toBe(initialRev);

    act(() => {
      useCatalogStore.getState().reorderStructuralChild('page-1', sampleSectionBlock.id, 'non-existent-card', 0);
    });
    expect(useCatalogStore.getState().localRevision).toBe(initialRev);
  });

  // ==========================================================================
  // GRUPO 6: Paridade com CleanA4 e Preservação I18N
  // ==========================================================================

  it('PARITY-A4-B1: CleanA4 mantém renderer puro com zero vazamento de handles, drag UI ou editor chrome', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150
        }
      }
    };

    const catalog: Catalog = {
      ...initialCatalog,
      pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<CleanA4Document document={catalog} />);
    });

    // Zero interação ou frames no PDF
    expect(container.querySelector('[data-interaction-frame="structural_section"]')).toBeNull();
    expect(container.querySelector('[data-testid="resize-handle-right"]')).toBeNull();
    expect(container.querySelector('[data-testid="resize-handle-left"]')).toBeNull();
    expect(container.querySelector('[data-testid="structural-section-toolbar"]')).toBeNull();
    expect(container.querySelectorAll('.editor-only').length).toBe(0);

    // Bloco renderiza com a largura física correta
    const blockEl = container.querySelector('.structural-section-block') as HTMLElement;
    expect(blockEl).not.toBeNull();
    expect(blockEl.style.width).toBe('150mm');

    act(() => {
      root.unmount();
    });
  });

  it('I18N-A4-1: Operações de resize, reorder e reset preservam rigorosamente os PrintableTextNode IDs', () => {
    const blockBefore = sampleSectionBlock;
    const nodesBefore = extractStructuralBlocks(blockBefore, 'page-1', 1);

    // 1. Resize
    act(() => {
      useCatalogStore.getState().setStructuralSectionFixedWidth('page-1', blockBefore.id, 160);
    });
    const blockAfterResize = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0]!;
    const nodesAfterResize = extractStructuralBlocks(blockAfterResize, 'page-1', 1);
    expect(nodesAfterResize.map((n) => n.id)).toEqual(nodesBefore.map((n) => n.id));

    // 2. Reorder card
    act(() => {
      const card0 = blockAfterResize.structuralData!.children[0].id;
      useCatalogStore.getState().reorderStructuralChild('page-1', blockBefore.id, card0, 1);
    });
    const blockAfterReorder = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0]!;
    const nodesAfterReorder = extractStructuralBlocks(blockAfterReorder, 'page-1', 1);
    // Todos os IDs originais continuam presentes sem criação de novos IDs
    const idsBefore = new Set(nodesBefore.map((n) => n.id));
    for (const node of nodesAfterReorder) {
      expect(idsBefore.has(node.id)).toBe(true);
    }

    // 3. Reset to default
    act(() => {
      useCatalogStore.getState().updateBlock('page-1', blockBefore.id, {
        structuralData: {
          ...blockAfterReorder.structuralData!,
          layout: {
            ...blockAfterReorder.structuralData!.layout,
            widthMode: 'fill'
          }
        }
      });
    });
    const blockAfterReset = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0]!;
    const nodesAfterReset = extractStructuralBlocks(blockAfterReset, 'page-1', 1);
    for (const node of nodesAfterReset) {
      expect(idsBefore.has(node.id)).toBe(true);
    }
  });

  // ==========================================================================
  // FASE 3A.5B.1: RESIZE SHELL GEOMETRY & POINTER FINALIZATION HARDENING
  // ==========================================================================

  it('WIDTH-HANDLE-GEO-1: fixed=150 align=left -> ResizeShell width=150mm, mr-auto, right handle pertence ao ResizeShell', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-left',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'left'
        }
      }
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const outerFrame = container.querySelector('[data-interaction-frame="structural_section"]') as HTMLElement;
    expect(outerFrame.classList.contains('w-full')).toBe(true);

    const resizeShell = container.querySelector('[data-testid="resize-shell"]') as HTMLElement;
    expect(resizeShell).not.toBeNull();
    expect(resizeShell.style.width).toBe('150mm');
    expect(resizeShell.classList.contains('mr-auto')).toBe(true);

    // O right handle é filho do resizeShell, NÃO do outerFrame diretamente
    const rightHandle = resizeShell.querySelector('[data-testid="resize-handle-right"]');
    expect(rightHandle).not.toBeNull();
    expect(outerFrame.children[outerFrame.children.length - 1]).not.toBe(rightHandle);

    act(() => root.unmount());
  });

  it('WIDTH-HANDLE-GEO-2: fixed=150 align=right -> ResizeShell width=150mm, ml-auto, left handle pertence ao ResizeShell', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-right',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'right'
        }
      }
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const resizeShell = container.querySelector('[data-testid="resize-shell"]') as HTMLElement;
    expect(resizeShell).not.toBeNull();
    expect(resizeShell.style.width).toBe('150mm');
    expect(resizeShell.classList.contains('ml-auto')).toBe(true);

    const leftHandle = resizeShell.querySelector('[data-testid="resize-handle-left"]');
    expect(leftHandle).not.toBeNull();

    act(() => root.unmount());
  });

  it('WIDTH-HANDLE-GEO-3: fixed=150 align=center -> ResizeShell width=150mm, mx-auto, ambos handles pertencem ao ResizeShell', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-center',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'center'
        }
      }
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const resizeShell = container.querySelector('[data-testid="resize-shell"]') as HTMLElement;
    expect(resizeShell).not.toBeNull();
    expect(resizeShell.style.width).toBe('150mm');
    expect(resizeShell.classList.contains('mx-auto')).toBe(true);

    const leftHandle = resizeShell.querySelector('[data-testid="resize-handle-left"]');
    const rightHandle = resizeShell.querySelector('[data-testid="resize-handle-right"]');
    expect(leftHandle).not.toBeNull();
    expect(rightHandle).not.toBeNull();

    act(() => root.unmount());
  });

  it('WIDTH-HANDLE-GEO-4: preview during drag = 160mm -> ResizeShell e StructuralSectionBlock refletem o mesmo 160mm transient', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-geo-4',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'left'
        }
      }
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;
    act(() => {
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointerdown', { bubbles: true, clientX: 100, button: 0 }));
    });

    // 10mm delta px = ~37.795px
    const delta10mmPx = mmToPx(10);
    act(() => {
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointermove', { bubbles: true, clientX: 100 + delta10mmPx }));
    });

    const resizeShell = container.querySelector('[data-testid="resize-shell"]') as HTMLElement;
    const blockEl = container.querySelector('.structural-section-block') as HTMLElement;
    expect(resizeShell.style.width).toBe('160mm');
    expect(blockEl.style.width).toBe('160mm');

    act(() => {
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointercancel', { bubbles: true }));
      root.unmount();
    });
  });

  it('WIDTH-POINTER-FINAL-1: rapid move -> pointerup comita valor calculado imediatamente sem depender de rerender manual', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-rapid',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'left'
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: 'sec-rapid'
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;

    // PointerDown -> PointerMove -> PointerUp sequencial síncrono
    const delta10mmPx = mmToPx(10);
    act(() => {
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointerdown', { bubbles: true, clientX: 100, button: 0 }));
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointermove', { bubbles: true, clientX: 100 + delta10mmPx }));
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointerup', { bubbles: true, clientX: 100 + delta10mmPx }));
    });

    const updatedBlock = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0]!;
    expect(updatedBlock.structuralData?.layout.fixedWidthMm).toBe(160);

    act(() => root.unmount());
  });

  it('WIDTH-CAPTURE-1: normal pointerup + release capture -> exatamente uma mutation', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-cap-1',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'left'
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: 'sec-cap-1'
    });

    const initialRevision = useCatalogStore.getState().localRevision;
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;
    const delta5mmPx = mmToPx(5);
    act(() => {
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointerdown', { bubbles: true, clientX: 100, button: 0 }));
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointermove', { bubbles: true, clientX: 100 + delta5mmPx }));
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointerup', { bubbles: true, clientX: 100 + delta5mmPx }));
    });

    expect(Element.prototype.releasePointerCapture).toHaveBeenCalled();
    expect(useCatalogStore.getState().localRevision).toBe(initialRevision + 1);

    act(() => root.unmount());
  });

  it('WIDTH-CAPTURE-2: lostpointercapture ANTES de pointerup -> zero mutation', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-cap-2',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'left'
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: 'sec-cap-2'
    });

    const initialRevision = useCatalogStore.getState().localRevision;
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;
    const delta5mmPx = mmToPx(5);
    act(() => {
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointerdown', { bubbles: true, clientX: 100, button: 0 }));
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointermove', { bubbles: true, clientX: 100 + delta5mmPx }));
      // Perda inesperada de captura antes do pointerup
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('lostpointercapture', { bubbles: true }));
    });

    // Zero mutation
    expect(useCatalogStore.getState().localRevision).toBe(initialRevision);
    const block = useCatalogStore.getState().currentCatalog?.pages[0].blocks[0]!;
    expect(block.structuralData?.layout.fixedWidthMm).toBe(150);

    act(() => root.unmount());
  });

  it('WIDTH-CAPTURE-3: Escape libera pointer capture e causa zero mutation', () => {
    const fixedBlock: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-cap-3',
      structuralData: {
        ...sampleSectionBlock.structuralData!,
        layout: {
          ...sampleSectionBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          align: 'left'
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [fixedBlock] }]
      },
      selectedBlockId: 'sec-cap-3'
    });

    const initialRevision = useCatalogStore.getState().localRevision;
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInteractionFrame
          block={fixedBlock}
          pageId="page-1"
          blockIndex={0}
          totalBlocks={1}
          isSelected={true}
        />
      );
    });

    const rightHandle = container.querySelector('[data-testid="resize-handle-right"]') as HTMLElement;
    const delta5mmPx = mmToPx(5);
    act(() => {
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointerdown', { bubbles: true, clientX: 100, button: 0 }));
      rightHandle.dispatchEvent(new (globalThis as any).PointerEvent('pointermove', { bubbles: true, clientX: 100 + delta5mmPx }));
    });

    // Pressiona Escape no window
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(Element.prototype.releasePointerCapture).toHaveBeenCalled();
    expect(useCatalogStore.getState().localRevision).toBe(initialRevision);

    act(() => root.unmount());
  });

  it('REORDER-SECTION-DRAG-1: drag S para slot antes de legacy A -> S, legacy A, legacy B (legacy intacto)', () => {
    const legacyA: ContentBlock = {
      id: 'legacy-a',
      type: 'matrix_spec_table',
      title: 'Tabela Legada A',
      tableRows: [{ id: 'r1', productRefId: 'PCON-Y18' }]
    };
    const secS: ContentBlock = { ...sampleSectionBlock, id: 'sec-s' };
    const legacyB: ContentBlock = {
      id: 'legacy-b',
      type: 'matrix_spec_table',
      title: 'Tabela Legada B'
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [legacyA, secS, legacyB] }]
      }
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });

    // Drop slot 0 no topo da lista de blocos
    const topSlot = container.querySelector('[data-testid="block-flow-drop-slot-0"]') as HTMLElement;
    expect(topSlot).not.toBeNull();

    act(() => {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(dropEvent, {
        dataTransfer: {
          getData: (format: string) =>
            format === 'application/json'
              ? JSON.stringify({ type: 'structural_section', pageId: 'page-1', sectionId: 'sec-s' })
              : ''
        },
        preventDefault: () => {}
      });
      topSlot.dispatchEvent(dropEvent);
    });

    const blocks = useCatalogStore.getState().currentCatalog?.pages[0].blocks || [];
    expect(blocks.map((b) => b.id)).toEqual(['sec-s', 'legacy-a', 'legacy-b']);
    expect(blocks[1].title).toBe('Tabela Legada A');
    expect(blocks[1].tableRows?.[0].productRefId).toBe('PCON-Y18');

    act(() => root.unmount());
  });

  it('REORDER-SECTION-DRAG-2: drag S para slot depois de B -> legacy A, legacy B, S (stable ID preservado)', () => {
    const legacyA: ContentBlock = {
      id: 'legacy-a',
      type: 'matrix_spec_table',
      title: 'Tabela Legada A'
    };
    const secS: ContentBlock = { ...sampleSectionBlock, id: 'sec-s' };
    const legacyB: ContentBlock = {
      id: 'legacy-b',
      type: 'matrix_spec_table',
      title: 'Tabela Legada B'
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [legacyA, secS, legacyB] }]
      }
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<A4Canvas />);
    });

    // Drop slot final
    const endSlot = container.querySelector('[data-testid="block-flow-drop-slot-end"]') as HTMLElement;
    expect(endSlot).not.toBeNull();

    act(() => {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(dropEvent, {
        dataTransfer: {
          getData: (format: string) =>
            format === 'application/json'
              ? JSON.stringify({ type: 'structural_section', pageId: 'page-1', sectionId: 'sec-s' })
              : ''
        },
        preventDefault: () => {}
      });
      endSlot.dispatchEvent(dropEvent);
    });

    const blocks = useCatalogStore.getState().currentCatalog?.pages[0].blocks || [];
    expect(blocks.map((b) => b.id)).toEqual(['legacy-a', 'legacy-b', 'sec-s']);
    expect(blocks[2].id).toBe('sec-s');

    act(() => root.unmount());
  });

  it('REORDER-CARD-SCOPE-1: payload card de section A drop em section B -> zero mutation', () => {
    const secA: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-a'
    };
    const secB: ContentBlock = {
      ...sampleSectionBlock,
      id: 'sec-b'
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...initialCatalog,
        pages: [{ ...initialCatalog.pages[0], blocks: [secA, secB] }]
      },
      selectedBlockId: 'sec-b'
    });

    const initialRevision = useCatalogStore.getState().localRevision;
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <StructuralSectionInspector
          pageId="page-1"
          sectionBlock={secB}
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      const header = container.querySelector<HTMLButtonElement>('#inspector-section-children-header');
      if (header?.getAttribute('aria-expanded') !== 'true') {
        header?.click();
      }
    });

    const cardB0 = secB.structuralData!.children[0].id;
    const cardEl = container.querySelector(`[data-card-id="${cardB0}"]`) as HTMLElement;
    expect(cardEl).not.toBeNull();

    // Drop com payload originário da seção A
    act(() => {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(dropEvent, {
        dataTransfer: {
          getData: (format: string) =>
            format === 'application/json'
              ? JSON.stringify({
                  type: 'structural_card',
                  pageId: 'page-1',
                  sectionId: 'sec-a', // Seção diferente!
                  childId: secA.structuralData!.children[0].id,
                  fromIndex: 0
                })
              : ''
        },
        preventDefault: () => {}
      });
      cardEl.dispatchEvent(dropEvent);
    });

    // Zero mutation
    expect(useCatalogStore.getState().localRevision).toBe(initialRevision);

    act(() => root.unmount());
  });
});
