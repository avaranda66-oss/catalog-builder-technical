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
});
