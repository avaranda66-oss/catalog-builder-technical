// tests/components/full-page-cover-inspector.test.tsx
// Testes do novo Inspector Canônico da Capa A4 Página Inteira (CORE.E4).
// Valida eliminação de dead controls, binds semânticos, upload preservado,
// image layer funcional e proteção contra double commit de overlay.
// Usa createRoot e act do React DOM (padrão do codebase).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { FullPageCoverInspector } from '../../src/components/editor/inspector/FullPageCoverInspector';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useMediaStore } from '../../src/stores/useMediaStore';
import { useAssetStore } from '../../src/stores/useAssetStore';

describe('FullPageCoverInspector (CORE.E4)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  const sampleBlock: ContentBlock = {
    id: 'block-cover-1',
    type: 'full_page_cover',
    title: 'PCON-Y18-LP / CALIBRADOR',
    subtitle: 'Calibrador Automático de Pressão de Alta Estabilidade',
    badgeText: 'CALIBRAÇÃO RBC · ISO/IEC 17025',
    customData: {
      brandName: 'PRESYS INSTRUMENTOS',
      overlayOpacity: 45
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useCatalogStore.setState({
      updateBlock: vi.fn(),
      currentCatalog: {
        id: 'cat-test',
        title: 'Catálogo Teste',
        pages: [{ id: 'page-1', pageNumber: 1, type: 'cover', blocks: [sampleBlock] }]
      } as any,
      activePageIndex: 0
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

  const renderComponent = (block: ContentBlock = sampleBlock) => {
    act(() => {
      root!.render(<FullPageCoverInspector block={block} pageId="page-1" />);
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
  // 1. COVER-INSPECTOR-NOOP-1: ELIMINAÇÃO TOTAL DE DEAD CONTROLS
  // ==========================================================================
  it('COVER-INSPECTOR-NOOP-1: nenhum controle morto (coverStyle, textAlign, highlights, footers, slogan) é renderizado', () => {
    renderComponent();

    const text = container.textContent || '';
    // Verifica ausência de coverStyle (Foto Inteira vs Editorial)
    expect(text).not.toContain('Foto Inteira (Full-Bleed)');
    expect(text).not.toContain('Editorial c/ Destaques');
    expect(text).not.toContain('Layout Visual da Capa');

    // Verifica ausência de textAlign
    expect(text).not.toContain('Alinhamento do Título');

    // Verifica ausência de highlights (Cards de Performance)
    expect(text).not.toContain('Cards de Performance');
    expect(text).not.toContain('+ Destaque');

    // Verifica ausência de footers institucionais NO-OP
    expect(text).not.toContain('Rodapé Esquerdo');
    expect(text).not.toContain('Rodapé Direito');

    // Verifica ausência de slogan / sub-marca
    expect(text).not.toContain('Slogan / Sub-marca');
  });

  // ==========================================================================
  // 2. CONTEÚDO SEMÂNTICO (Materialização Segura)
  // ==========================================================================
  it('COVER-CONTENT-1: edição de título principal comita patch com layers materializadas e valor atualizado', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const titleInput = container.querySelector('#cover-field-title') as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    expect(titleInput.value).toBe('PCON-Y18-LP / CALIBRADOR');

    act(() => {
      setInputValue(titleInput, 'NOVO CALIBRADOR ULTRA');
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [pageId, blockId, patch] = updateBlockSpy.mock.calls[0];
    expect(pageId).toBe('page-1');
    expect(blockId).toBe('block-cover-1');
    expect(patch.customData?.canvasLayers).toBeDefined();
    expect(patch.customData.canvasLayers.length).toBe(5);

    const titleLayer = patch.customData.canvasLayers.find((l: any) => l.id === 'layer-title');
    expect(titleLayer?.content).toBe('NOVO CALIBRADOR ULTRA');
  });

  it('COVER-CONTENT-2: edição de marca atualiza layer-logo sem perder as outras layers', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const brandInput = container.querySelector('#cover-field-brand') as HTMLInputElement;
    expect(brandInput).not.toBeNull();
    expect(brandInput.value).toBe('PRESYS INSTRUMENTOS');

    act(() => {
      setInputValue(brandInput, 'PRESYS CALIBRATION');
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    const logoLayer = patch.customData.canvasLayers.find((l: any) => l.id === 'layer-logo');
    expect(logoLayer?.content).toBe('PRESYS CALIBRATION');
  });

  // ==========================================================================
  // 3. SEÇÃO MÍDIA: ACERVO, UPLOAD PRESERVADO E REMOÇÃO TOTAL
  // ==========================================================================
  it('COVER-MEDIA-1: selecionar asset da galeria grava assetId e limpa URLs externas', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const openGalleryMock = vi.fn((callback) => {
      callback({ assetId: 'asset-hero-999' });
    });
    useMediaStore.setState({ openGallery: openGalleryMock });

    renderComponent();

    // Abre a seção Mídia
    const mediaTrigger = container.querySelector('#inspector-cover-section-media-header') as HTMLButtonElement;
    expect(mediaTrigger).not.toBeNull();
    act(() => {
      mediaTrigger.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const openGalleryBtn = buttons.find((b) => b.textContent?.includes('Abrir Acervo'));
    expect(openGalleryBtn).toBeDefined();

    act(() => {
      openGalleryBtn!.click();
    });

    expect(openGalleryMock).toHaveBeenCalledTimes(1);
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    expect(patch.assetId).toBe('asset-hero-999');
    expect(patch.imageUrl).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
    expect(patch.customData?.backgroundImageUrl).toBeUndefined();
  });

  it('COVER-UPLOAD-1: upload do computador persiste assetId autoritativo e limpa fontes externas', async () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const uploadAndLinkAssetMock = vi.fn().mockResolvedValue({
      success: true,
      assetId: 'asset-uploaded-777',
      name: 'foto-teste.jpg'
    });
    useAssetStore.setState({ uploadAndLinkAsset: uploadAndLinkAssetMock });

    renderComponent();

    // Abre seção Mídia
    const mediaTrigger = container.querySelector('#inspector-cover-section-media-header') as HTMLButtonElement;
    act(() => {
      mediaTrigger.click();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const fakeFile = new File(['fake-bytes'], 'foto-teste.jpg', { type: 'image/jpeg' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [fakeFile],
        configurable: true
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(uploadAndLinkAssetMock).toHaveBeenCalledWith(fakeFile);
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    expect(patch.assetId).toBe('asset-uploaded-777');
    expect(patch.imageUrl).toBeUndefined();
  });

  it('COVER-MEDIA-3: remover fotografia limpa todas as fontes de background', () => {
    const blockWithBg: ContentBlock = {
      ...sampleBlock,
      imageUrl: 'https://exemplo.com/antiga.jpg'
    };
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent(blockWithBg);

    // Abre seção Mídia
    const mediaTrigger = container.querySelector('#inspector-cover-section-media-header') as HTMLButtonElement;
    act(() => {
      mediaTrigger.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const removeBtn = buttons.find((b) => b.textContent?.includes('Remover Fotografia de Fundo'));
    expect(removeBtn).toBeDefined();

    act(() => {
      removeBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    expect(patch.assetId).toBeUndefined();
    expect(patch.imageUrl).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
    expect(patch.customData?.backgroundImageUrl).toBeUndefined();
  });

  // ==========================================================================
  // 4. OVERLAY: TRANSIENTE E IDEMPOTÊNCIA DE COMMIT (Zero Save-Storm + No Double Commit)
  // ==========================================================================
  it('COVER-OVERLAY-COMMIT-1: slider onChange é transiente; pointerup comita e blur subsequente não duplica commit', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    // Abre seção Aparência
    const appearanceTrigger = container.querySelector('#inspector-cover-section-appearance-header') as HTMLButtonElement;
    act(() => {
      appearanceTrigger.click();
    });

    const slider = container.querySelector('#cover-overlay-slider') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(slider.value).toBe('45');

    // Múltiplos eventos de onChange (arrasto de slider) NÃO chamam updateBlock
    act(() => {
      slider.value = '50';
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      slider.value = '60';
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      slider.value = '70';
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);

    // pointerUp comita UMA vez
    act(() => {
      slider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-cover-1', {
      customData: { ...sampleBlock.customData, overlayOpacity: 70 }
    });

    // Blur imediato com mesmo valor é IDEMPOTENTE: não comita novamente
    act(() => {
      slider.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1); // Continua exatamente 1
  });

  // ==========================================================================
  // 5. IMAGE LAYER FUNCIONAL (COVER-IMAGE-LAYER-1)
  // ==========================================================================
  it('COVER-IMAGE-LAYER-1: botão "+ Foto / Logo" cria camada de imagem e expõe opções de Acervo e Upload', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    // Abre seção Camadas
    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const addImageBtn = buttons.find((b) => b.textContent?.includes('+ Foto / Logo'));
    expect(addImageBtn).toBeDefined();

    act(() => {
      addImageBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    const createdLayer = patch.customData.canvasLayers[patch.customData.canvasLayers.length - 1];
    expect(createdLayer.type).toBe('image');
    expect(createdLayer.label).toMatch(/Imagem \/ Logo/i);
  });

  // ==========================================================================
  // 6. CORE.E4.1 REFINAMENTOS: CANONICAL SOURCE OF TRUTH & NESTED SCROLL
  // ==========================================================================
  it('COVER-CANONICAL-MISSING-SEMANTIC-INSPECTOR: se capa canônica não possui layer-title, campo Título fica vazio no Inspector', () => {
    const canonicalWithoutTitle: ContentBlock = {
      ...sampleBlock,
      title: 'Título Antigo Legacy Que Não Deve Aparecer',
      customData: {
        canvasLayers: [
          {
            id: 'layer-logo',
            type: 'text',
            label: 'Marca',
            content: 'PRESYS',
            x: 5,
            y: 3.5,
            visible: true
          }
        ]
      }
    };

    renderComponent(canonicalWithoutTitle);

    const titleInput = container.querySelector('#cover-field-title') as HTMLInputElement;
    expect(titleInput.value).toBe(''); // ZERO fallback para block.title!
  });

  it('COVER-NO-NESTED-SCROLL-1: seção Camadas NÃO possui container com max-h-96 overflow-y-auto', () => {
    renderComponent();

    // Abre seção Camadas
    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    const nestedScrollContainer = container.querySelector('.max-h-96');
    expect(nestedScrollContainer).toBeNull(); // Zero nested scroll!
  });

  it('COVER-LAYER-SELECTION-AND-DETAILS-1: clicar em uma camada da lista exibe os detalhes da camada selecionada', () => {
    renderComponent();

    // Abre seção Camadas
    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    // Clica na linha da camada Título Comercial
    const layerRows = container.querySelectorAll('[data-cover-layer-id]');
    expect(layerRows.length).toBeGreaterThan(0);

    const titleRow = Array.from(layerRows).find((el) => el.textContent?.includes('Título Comercial'));
    expect(titleRow).toBeDefined();

    act(() => {
      (titleRow as HTMLElement).click();
    });

    // Painel de detalhes é renderizado
    expect(container.textContent).toContain('Detalhes: Título Comercial');
    const fontSizeSlider = container.querySelector('#selected-layer-fontsize-slider');
    expect(fontSizeSlider).not.toBeNull();
  });

  it('COVER-LAYER-GEOMETRY-1 & 2: slider X de camada é transiente; pointerup comita e blur subsequente não duplica', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    // Abre seção Camadas e seleciona a primeira camada
    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    const firstRow = container.querySelector('[data-cover-layer-id]') as HTMLElement;
    act(() => {
      firstRow.click();
    });

    const xSlider = container.querySelector('#selected-layer-x-slider') as HTMLInputElement;
    expect(xSlider).not.toBeNull();

    // Múltiplos eventos onChange NÃO comitam
    act(() => {
      xSlider.value = '10';
      xSlider.dispatchEvent(new Event('change', { bubbles: true }));
      xSlider.value = '20';
      xSlider.dispatchEvent(new Event('change', { bubbles: true }));
      xSlider.value = '30';
      xSlider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);

    // pointerUp comita exatamente UMA vez
    act(() => {
      xSlider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);

    // blur subsequente com mesmo valor é idempotente (COVER-LAYER-GEOMETRY-2)
    act(() => {
      xSlider.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1); // Continua 1
  });

  it('COVER-LAYER-GEOMETRY-3: pointerup sem alteração de valor gera ZERO mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    const firstRow = container.querySelector('[data-cover-layer-id]') as HTMLElement;
    act(() => {
      firstRow.click();
    });

    const xSlider = container.querySelector('#selected-layer-x-slider') as HTMLInputElement;

    // pointerup direto sem alterar o valor
    act(() => {
      xSlider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  it('COVER-IMAGE-REMOVE-1: botão "Remover Imagem da Camada" limpa todas as fontes da layer sem apagar a camada', () => {
    const blockWithImageLayer: ContentBlock = {
      ...sampleBlock,
      customData: {
        canvasLayers: [
          {
            id: 'layer-img-test',
            type: 'image',
            label: 'Foto do Produto',
            assetId: 'asset-old-123',
            imageUrl: 'https://velha.com/foto.jpg',
            legacyUrl: 'https://legado.com/foto.jpg',
            x: 10,
            y: 10,
            visible: true
          }
        ]
      }
    };

    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent(blockWithImageLayer);

    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    const imgRow = container.querySelector('[data-cover-layer-id="layer-img-test"]') as HTMLElement;
    act(() => {
      imgRow.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const removeImgBtn = buttons.find((b) => b.textContent?.includes('Remover Imagem da Camada'));
    expect(removeImgBtn).toBeDefined();

    act(() => {
      removeImgBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];
    const updatedLayer = patch.customData.canvasLayers.find((l: any) => l.id === 'layer-img-test');
    expect(updatedLayer.assetId).toBeUndefined();
    expect(updatedLayer.imageUrl).toBeUndefined();
    expect(updatedLayer.legacyUrl).toBeUndefined();
  });

  // ==========================================================================
  // 7. IDEMPOTÊNCIA SEM DEPENDÊNCIA DE RERENDER (CORE.E4.2)
  // ==========================================================================
  it('COVER-OVERLAY-IDEMPOTENCE-2: pointerup seguido de múltiplos blurs sem rerender do parent block gera exatamente 1 mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const appearanceTrigger = container.querySelector('#inspector-cover-section-appearance-header') as HTMLButtonElement;
    act(() => {
      appearanceTrigger.click();
    });

    const slider = container.querySelector('#cover-overlay-slider') as HTMLInputElement;

    act(() => {
      slider.value = '80';
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      slider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);

    // Múltiplos blurs sem rerender do parent block
    act(() => {
      slider.dispatchEvent(new Event('blur', { bubbles: true }));
      slider.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
  });

  it('COVER-GEOMETRY-IDEMPOTENCE-2: pointerup seguido de múltiplos blurs sem rerender gera exatamente 1 mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    const firstRow = container.querySelector('[data-cover-layer-id]') as HTMLElement;
    act(() => {
      firstRow.click();
    });

    const xSlider = container.querySelector('#selected-layer-x-slider') as HTMLInputElement;

    act(() => {
      xSlider.value = '55';
      xSlider.dispatchEvent(new Event('change', { bubbles: true }));
      xSlider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);

    // Múltiplos blurs sem rerender
    act(() => {
      xSlider.dispatchEvent(new Event('blur', { bubbles: true }));
      xSlider.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
  });

  it('COVER-BG-URL-IDEMPOTENCE-1: Enter seguido de blur no campo de URL de background gera exatamente 1 mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const mediaTrigger = container.querySelector('#inspector-cover-section-media-header') as HTMLButtonElement;
    act(() => {
      mediaTrigger.click();
    });

    const bgUrlInput = container.querySelector('#cover-field-bg-url') as HTMLInputElement;
    expect(bgUrlInput).not.toBeNull();

    act(() => {
      setInputValue(bgUrlInput, 'https://imagem-externa.com/hero.png');
      bgUrlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);

    // Blur subsequente SEM rerender intermediário do parent block:
    act(() => {
      bgUrlInput.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1); // Permanece exatamente 1
  });

  it('COVER-IMAGE-URL-IDEMPOTENCE-1: Enter seguido de blur no campo de URL da imagem da camada gera exatamente 1 mutação', () => {
    const blockWithImageLayer: ContentBlock = {
      ...sampleBlock,
      customData: {
        canvasLayers: [
          {
            id: 'layer-img-test',
            type: 'image',
            label: 'Foto do Produto',
            x: 10,
            y: 10,
            visible: true
          }
        ]
      }
    };

    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent(blockWithImageLayer);

    const layersTrigger = container.querySelector('#inspector-cover-section-layers-header') as HTMLButtonElement;
    act(() => {
      layersTrigger.click();
    });

    const imgRow = container.querySelector('[data-cover-layer-id="layer-img-test"]') as HTMLElement;
    act(() => {
      imgRow.click();
    });

    const imgUrlInput = container.querySelector('#selected-layer-image-url-input') as HTMLInputElement;
    expect(imgUrlInput).not.toBeNull();

    act(() => {
      setInputValue(imgUrlInput, 'https://produtos.com/calibrador-novo.png');
      imgUrlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);

    // Blur subsequente SEM rerender intermediário:
    act(() => {
      imgUrlInput.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1); // Permanece exatamente 1
  });
});
