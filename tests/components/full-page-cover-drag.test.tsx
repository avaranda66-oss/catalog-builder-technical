// tests/components/full-page-cover-drag.test.tsx
// Testes de Drag & Drop da Capa A4 Página Inteira (CORE.E4).
// Valida eliminação completa do save-storm (preview transiente local),
// zero mutação quando não há deslocamento (COVER-DRAG-NOMOVE-1),
// e cancelamento seguro via Escape ou pointercancel.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { FullPageCoverBlock } from '../../src/components/editor/blocks/FullPageCoverBlock';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

describe('FullPageCoverBlock Drag & Drop (CORE.E4)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  const sampleLegacyBlock: ContentBlock = {
    id: 'block-cover-drag',
    type: 'full_page_cover',
    title: 'PCON-Y18-LP / CALIBRADOR',
    subtitle: 'Calibrador Automático',
    badgeText: 'CALIBRAÇÃO RBC',
    customData: {
      brandName: 'PRESYS'
    }
  };

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    vi.clearAllMocks();

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
    Element.prototype.setPointerCapture = vi.fn(function (this: Element, _pointerId: number) {});
    Element.prototype.releasePointerCapture = vi.fn(function (this: Element, _pointerId: number) {});

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useCatalogStore.setState({
      updateBlock: vi.fn(),
      setSelectedBlockId: vi.fn()
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
  });

  const renderCover = (block: ContentBlock = sampleLegacyBlock, isSelected = true) => {
    act(() => {
      root!.render(
        <FullPageCoverBlock block={block} pageId="page-1" isSelected={isSelected} />
      );
    });
  };

  // ==========================================================================
  // 1. COVER-DRAG-NOMOVE-1: CLIQUE/TOQUE SEM MOVIMENTO = ZERO MUTAÇÃO
  // ==========================================================================
  it('COVER-DRAG-NOMOVE-1: pointerdown e pointerup sem deslocamento gera ZERO mutação e ZERO materialização', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderCover();

    // Encontra a alça de drag da primeira camada (layer-logo)
    const dragHandles = container.querySelectorAll('[data-editor-action="true"]');
    const logoHandle = Array.from(dragHandles).find((el) => el.textContent?.includes('Logotipo / Marca'));
    expect(logoHandle).toBeDefined();

    act(() => {
      // Simula pointerdown
      logoHandle!.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
          pointerId: 1
        })
      );
      // Simula pointerup no mesmo local (sem movimento)
      logoHandle!.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
          pointerId: 1
        })
      );
    });

    // Zero chamadas para updateBlock! Não materializa nem altera revisão.
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  // ==========================================================================
  // 2. COVER-DRAG-1: MÚLTIPLOS MOVES = ZERO SAVE-STORM; POINTERUP = 1 COMMIT
  // ==========================================================================
  it('COVER-DRAG-1: múltiplos pointermove geram ZERO updateBlock; pointerup comita exatamente UMA vez', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderCover();

    const dragHandles = container.querySelectorAll('[data-editor-action="true"]');
    const titleHandle = Array.from(dragHandles).find((el) => el.textContent?.includes('Título Comercial'));
    expect(titleHandle).toBeDefined();

    // Mock do getBoundingClientRect do container (794 x 1123)
    const coverContainer = container.firstElementChild as HTMLElement;
    vi.spyOn(coverContainer, 'getBoundingClientRect').mockReturnValue({
      width: 794,
      height: 1123,
      top: 0,
      left: 0,
      bottom: 1123,
      right: 794,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    act(() => {
      titleHandle!.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
          pointerId: 1
        })
      );
    });

    // Simula 10 eventos rápidos de pointermove (arrasto contínuo)
    act(() => {
      for (let i = 1; i <= 10; i++) {
        titleHandle!.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: 100 + i * 10,
            clientY: 100 + i * 10,
            pointerId: 1
          })
        );
      }
    });

    // ZERO save-storm durante o arrasto!
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);

    // Finaliza o arrasto no pointerup
    act(() => {
      titleHandle!.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 200,
          clientY: 200,
          pointerId: 1
        })
      );
    });

    // Exatamente UMA mutação documental persistida
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [pageId, blockId, patch] = updateBlockSpy.mock.calls[0];
    expect(pageId).toBe('page-1');
    expect(blockId).toBe('block-cover-drag');
    expect(patch.customData?.canvasLayers).toBeDefined();

    const updatedTitle = patch.customData.canvasLayers.find((l: any) => l.id === 'layer-title');
    expect(updatedTitle).toBeDefined();
    // A posição inicial era x: 5, y: 22. Com delta de 100px em 794 (12.6%), x deve ser maior que 5
    expect(updatedTitle.x).toBeGreaterThan(5);
  });

  // ==========================================================================
  // 3. COVER-DRAG-CANCEL-1: CANCELAMENTO VIA ESCAPE = ZERO MUTAÇÃO
  // ==========================================================================
  it('COVER-DRAG-CANCEL-1: tecla Escape durante arrasto descarta preview com ZERO mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderCover();

    const dragHandles = container.querySelectorAll('[data-editor-action="true"]');
    const badgeHandle = Array.from(dragHandles).find((el) => el.textContent?.includes('Selo Metrológico'));
    expect(badgeHandle).toBeDefined();

    act(() => {
      badgeHandle!.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
          pointerId: 1
        })
      );
      badgeHandle!.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 180,
          clientY: 180,
          pointerId: 1
        })
      );
    });

    // Pressiona Escape
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    // PointerUp subsequente não deve mais comitar nada
    act(() => {
      badgeHandle!.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 180,
          clientY: 180,
          pointerId: 1
        })
      );
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  // ==========================================================================
  // 4. COVER-DRAG-POINTERCANCEL-1: POINTERCANCEL = ZERO MUTAÇÃO
  // ==========================================================================
  it('COVER-DRAG-POINTERCANCEL-1: pointercancel limpa estado transiente sem mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderCover();

    const dragHandles = container.querySelectorAll('[data-editor-action="true"]');
    const lineHandle = Array.from(dragHandles).find((el) => el.textContent?.includes('Linha de Destaque'));
    expect(lineHandle).toBeDefined();

    act(() => {
      lineHandle!.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
          pointerId: 1
        })
      );
      lineHandle!.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 150,
          clientY: 150,
          pointerId: 1
        })
      );
      lineHandle!.dispatchEvent(
        new PointerEvent('pointercancel', {
          bubbles: true,
          pointerId: 1
        })
      );
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });
});
