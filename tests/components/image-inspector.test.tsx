// tests/components/image-inspector.test.tsx
// Testes unitários e de integração para ImageInspector e ImageBlock (CORE.E5A).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useMediaStore } from '../../src/stores/useMediaStore';
import { ImageInspector } from '../../src/components/editor/inspector/ImageInspector';
import { ImageBlock } from '../../src/components/editor/blocks/ImageBlock';
import { PropertiesPanel } from '../../src/components/editor/PropertiesPanel';

describe('ImageInspector & ImageBlock (CORE.E5A)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const sampleImageBlock: ContentBlock = {
    id: 'block-img-1',
    type: 'image',
    assetId: 'asset-calibrator-001',
    imageUrl: 'https://exemplo.com/foto.png',
    legacyUrl: 'https://legado.com/foto.png',
    imageCaption: 'Figura 1 — Calibrador de Pressão PCON'
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useCatalogStore.setState({
      currentCatalog: {
        id: 'cat-test',
        title: 'Catálogo de Teste',
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            title: 'Página 1',
            blocks: [sampleImageBlock]
          }
        ]
      } as any,
      activePageIndex: 0,
      selectedBlockId: 'block-img-1'
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container.remove();
  });

  const renderComponent = (block: ContentBlock = sampleImageBlock) => {
    act(() => {
      root!.render(<ImageInspector block={block} pageId="page-1" />);
    });
  };

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // ==========================================================================
  // 1. IMAGE-INSPECTOR-MOUNT: PROPERTIESPANEL MONTA IMAGEINSPECTOR
  // ==========================================================================
  it('IMAGE-INSPECTOR-MOUNT: PropertiesPanel monta ImageInspector ao selecionar bloco tipo image', () => {
    act(() => {
      root!.render(<PropertiesPanel />);
    });

    const section = container.querySelector('#inspector-image-section-media');
    expect(section).not.toBeNull();
    expect(container.textContent).toContain('Mídia da Imagem');
  });

  // ==========================================================================
  // 2. IMAGE-INSPECTOR-1: ACERVO ASSET -> ASSET AUTHORITY
  // ==========================================================================
  it('IMAGE-INSPECTOR-1: selecionar asset no acervo comita assetId e limpa URLs externas e legadas', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const openGalleryMock = vi.fn((callback) => {
      callback({ assetId: 'asset-novo-999' });
    });
    useMediaStore.setState({ openGallery: openGalleryMock });

    renderComponent();

    const buttons = Array.from(container.querySelectorAll('button'));
    const openGalleryBtn = buttons.find((b) => b.textContent?.includes('Abrir Acervo'));
    expect(openGalleryBtn).toBeDefined();

    act(() => {
      openGalleryBtn!.click();
    });

    expect(openGalleryMock).toHaveBeenCalledTimes(1);
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    expect(patch.assetId).toBe('asset-novo-999');
    expect(patch.imageUrl).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
  });

  // ==========================================================================
  // 3. IMAGE-INSPECTOR-2: URL EXTERNA -> IMAGEURL AUTHORITY
  // ==========================================================================
  it('IMAGE-INSPECTOR-2: colar URL externa direta limpa assetId e legacyUrl', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const urlInput = container.querySelector('#image-field-url') as HTMLInputElement;
    expect(urlInput).not.toBeNull();

    act(() => {
      setInputValue(urlInput, 'https://novo-site.com/produto-alta-res.jpg');
      urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    expect(patch.imageUrl).toBe('https://novo-site.com/produto-alta-res.jpg');
    expect(patch.assetId).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
  });

  // ==========================================================================
  // 4. IMAGE-INSPECTOR-3: ENTER + BLUR SEM RERENDER -> EXATAMENTE 1 MUTAÇÃO
  // ==========================================================================
  it('IMAGE-INSPECTOR-3: Enter seguido de blur sem rerender gera exatamente 1 mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const urlInput = container.querySelector('#image-field-url') as HTMLInputElement;

    act(() => {
      setInputValue(urlInput, 'https://fornecedor.com/foto-teste.png');
      urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);

    // Blur subsequente sem re-render do parent block
    act(() => {
      urlInput.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // 5. IMAGE-INSPECTOR-4: REMOVE -> NONE E NENHUM FALLBACK LEGADO REAPARECE
  // ==========================================================================
  it('IMAGE-INSPECTOR-4: botão Remover Imagem limpa assetId, imageUrl e legacyUrl', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const buttons = Array.from(container.querySelectorAll('button'));
    const removeBtn = buttons.find((b) => b.textContent?.includes('Remover Imagem'));
    expect(removeBtn).toBeDefined();

    act(() => {
      removeBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    expect(patch.assetId).toBeUndefined();
    expect(patch.imageUrl).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
  });

  // ==========================================================================
  // 6. IMAGE-INSPECTOR-5: LEGENDA ESCREVE APENAS IMAGECAPTION
  // ==========================================================================
  it('IMAGE-INSPECTOR-5: editar legenda altera exclusivamente imageCaption', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const captionInput = container.querySelector('#image-field-caption') as HTMLInputElement;
    expect(captionInput).not.toBeNull();
    expect(captionInput.value).toBe('Figura 1 — Calibrador de Pressão PCON');

    act(() => {
      setInputValue(captionInput, 'Figura 1 — Vista em corte do sensor de pressão');
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-img-1', {
      imageCaption: 'Figura 1 — Vista em corte do sensor de pressão'
    });
  });

  // ==========================================================================
  // 7. IMAGE-INSPECTOR-NOOP-1: ZERO CONTROLES ASPIRACIONAIS
  // ==========================================================================
  it('IMAGE-INSPECTOR-NOOP-1: não aparecem controles aspiracionais não declarados no Registry', () => {
    renderComponent();

    const text = container.textContent || '';
    expect(text).not.toContain('Corte / Recorte');
    expect(text).not.toContain('Ponto Focal');
    expect(text).not.toContain('Opacidade');
    expect(text).not.toContain('Raio da Borda');
    expect(text).not.toContain('Largura da Imagem');
    expect(text).not.toContain('Altura da Imagem');
  });

  // ==========================================================================
  // 8. IMAGE-PARITY-1: EDITOR VS EXPORT MODE CHROME ABSENCE
  // ==========================================================================
  it('IMAGE-PARITY-1: modo export não registra cliques no editor e não exibe chrome de seleção', () => {
    const setSelectedBlockIdSpy = vi.fn();
    useCatalogStore.setState({ setSelectedBlockId: setSelectedBlockIdSpy });

    // 1. Modo Editor
    act(() => {
      root!.render(<ImageBlock block={sampleImageBlock} isSelected={false} isExport={false} />);
    });
    const blockEl = container.firstElementChild as HTMLElement;
    expect(blockEl.className).toContain('cursor-pointer');

    act(() => {
      blockEl.click();
    });
    expect(setSelectedBlockIdSpy).toHaveBeenCalledWith('block-img-1');

    // 2. Modo Export
    setSelectedBlockIdSpy.mockClear();
    act(() => {
      root!.render(<ImageBlock block={sampleImageBlock} isSelected={false} isExport={true} />);
    });
    const exportBlockEl = container.firstElementChild as HTMLElement;
    expect(exportBlockEl.className).not.toContain('cursor-pointer');
    expect(exportBlockEl.className).toContain('shadow-none');

    act(() => {
      exportBlockEl.click();
    });
    expect(setSelectedBlockIdSpy).not.toHaveBeenCalled();
  });
});
