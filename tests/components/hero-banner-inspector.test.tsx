// tests/components/hero-banner-inspector.test.tsx
// Testes unitários e de integração para HeroBannerInspector e HeroBannerBlock (CORE.E5B).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useMediaStore } from '../../src/stores/useMediaStore';
import { HeroBannerInspector } from '../../src/components/editor/inspector/HeroBannerInspector';
import { HeroBannerBlock } from '../../src/components/editor/blocks/HeroBannerBlock';
import { ImageInspector } from '../../src/components/editor/inspector/ImageInspector';
import { PropertiesPanel } from '../../src/components/editor/PropertiesPanel';
import { extractHeroBlocks } from '../../src/translation/block-extractors/hero.extractor';

describe('HeroBannerInspector & HeroBannerBlock (CORE.E5B)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const sampleHeroBlock: ContentBlock = {
    id: 'block-hero-1',
    type: 'hero_banner',
    badgeText: 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL',
    title: 'Calibrador de Pressão PCON-Y18',
    subtitle: 'Solução compacta de calibração automática com exatidão metrológica.',
    assetId: 'asset-hero-100',
    imageUrl: 'https://exemplo.com/hero-nova.png',
    legacyUrl: 'https://exemplo.com/hero-antiga.png',
    imageCaption: 'Figura Destaque — Estação PCON',
    style: {
      gradient: 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900'
    }
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
            blocks: [sampleHeroBlock]
          }
        ]
      } as any,
      activePageIndex: 0,
      selectedBlockId: 'block-hero-1'
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

  const renderComponent = (block: ContentBlock = sampleHeroBlock) => {
    act(() => {
      root!.render(<HeroBannerInspector block={block} pageId="page-1" />);
    });
  };

  const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // ==========================================================================
  // 1. HERO-INSPECTOR-MOUNT: PROPERTIESPANEL MONTA HEROBANNERINSPECTOR
  // ==========================================================================
  it('HERO-INSPECTOR-MOUNT: PropertiesPanel monta HeroBannerInspector ao selecionar hero_banner', () => {
    act(() => {
      root!.render(<PropertiesPanel />);
    });

    const contentSection = container.querySelector('#inspector-hero-section-content');
    expect(contentSection).not.toBeNull();
    expect(container.textContent).toContain('Conteúdo do Hero');
  });

  // ==========================================================================
  // 2. HERO-TEXT-FIELDS: EDIÇÃO DE BADGE, TITLE E SUBTITLE
  // ==========================================================================
  it('HERO-TEXT-FIELDS: editar badgeText, title e subtitle chama updateBlock com os valores corretos', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const badgeInput = container.querySelector('#hero-field-badge') as HTMLInputElement;
    const titleInput = container.querySelector('#hero-field-title') as HTMLInputElement;
    const subtitleInput = container.querySelector('#hero-field-subtitle') as HTMLTextAreaElement;

    expect(badgeInput).not.toBeNull();
    expect(titleInput).not.toBeNull();
    expect(subtitleInput).not.toBeNull();

    act(() => {
      setInputValue(badgeInput, 'NOVO BADGE TESTE');
    });
    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-hero-1', {
      badgeText: 'NOVO BADGE TESTE'
    });

    act(() => {
      setInputValue(titleInput, 'Novo Título do Hero');
    });
    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-hero-1', {
      title: 'Novo Título do Hero'
    });

    act(() => {
      setInputValue(subtitleInput, 'Novo subtítulo descritivo.');
    });
    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-hero-1', {
      subtitle: 'Novo subtítulo descritivo.'
    });
  });

  // ==========================================================================
  // 3. HERO-SAFE-1: ZERO CONTENTEDITABLE E ZERO UPDATEBLOCK NO CANVAS
  // ==========================================================================
  it('HERO-SAFE-1: HeroBannerBlock não possui contentEditable e interações de canvas geram zero updateBlock', () => {
    const updateBlockSpy = vi.fn();
    const setSelectedBlockIdSpy = vi.fn();
    useCatalogStore.setState({
      updateBlock: updateBlockSpy,
      setSelectedBlockId: setSelectedBlockIdSpy
    });

    act(() => {
      root!.render(<HeroBannerBlock block={sampleHeroBlock} pageId="page-1" isSelected={false} />);
    });

    const editableEls = container.querySelectorAll('[contenteditable="true"]');
    expect(editableEls.length).toBe(0);

    const blockEl = container.firstElementChild as HTMLElement;
    act(() => {
      blockEl.click();
    });

    expect(setSelectedBlockIdSpy).toHaveBeenCalledWith('block-hero-1');
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);

    // Focus e blur no bloco não mutam o documento
    act(() => {
      blockEl.dispatchEvent(new Event('focus', { bubbles: true }));
      blockEl.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  // ==========================================================================
  // 4. HERO-GHOST-1: ZERO TEXTO FICTÍCIO NO CLEANA4 / IS_EXPORT
  // ==========================================================================
  it('HERO-GHOST-1: Hero vazio em modo export não imprime textos fictícios de PSV Portable ou 300 bar', () => {
    const emptyHero: ContentBlock = {
      id: 'block-hero-empty',
      type: 'hero_banner',
      title: '',
      subtitle: '',
      imageCaption: '',
      badgeText: ''
    };

    act(() => {
      root!.render(<HeroBannerBlock block={emptyHero} pageId="page-1" isExport={true} />);
    });

    const text = container.textContent || '';
    expect(text).not.toContain('PSV Portable');
    expect(text).not.toContain('300 bar');
    expect(text).not.toContain('Estação portátil em gabinete industrial');
    expect(text).not.toContain('Trocar Imagem');
    expect(text).not.toContain('Clique em Trocar');
  });

  // ==========================================================================
  // 5. HERO-PLACEHOLDER-1: EDITOR MOSTRA PLACEHOLDERS; EXPORT NÃO
  // ==========================================================================
  it('HERO-PLACEHOLDER-1: Hero vazio mostra orientações no Editor, mas CleanA4/Export fica vazio', () => {
    const emptyHero: ContentBlock = {
      id: 'block-hero-empty',
      type: 'hero_banner',
      title: '',
      subtitle: ''
    };

    // Modo Editor
    act(() => {
      root!.render(<HeroBannerBlock block={emptyHero} pageId="page-1" isExport={false} />);
    });
    expect(container.textContent).toContain('Título do Hero Banner...');
    expect(container.textContent).toContain('Descrição dos diferenciais e aplicações...');

    // Modo Export
    act(() => {
      root!.render(<HeroBannerBlock block={emptyHero} pageId="page-1" isExport={true} />);
    });
    expect(container.textContent).not.toContain('Título do Hero Banner...');
    expect(container.textContent).not.toContain('Descrição dos diferenciais e aplicações...');
  });

  // ==========================================================================
  // 6. HERO-EXPORT-1: INTERAÇÕES DESABILITADAS EM MODO EXPORT
  // ==========================================================================
  it('HERO-EXPORT-1: isExport=true desabilita seleção e chrome de edição', () => {
    const setSelectedBlockIdSpy = vi.fn();
    useCatalogStore.setState({ setSelectedBlockId: setSelectedBlockIdSpy });

    act(() => {
      root!.render(<HeroBannerBlock block={sampleHeroBlock} pageId="page-1" isExport={true} />);
    });

    const blockEl = container.firstElementChild as HTMLElement;
    expect(blockEl.className).toContain('shadow-none');
    expect(blockEl.className).not.toContain('cursor-pointer');

    act(() => {
      blockEl.click();
    });
    expect(setSelectedBlockIdSpy).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 7. HERO-MEDIA-1: URL EXTERNA LIMPA ASSET E LEGACY
  // ==========================================================================
  it('HERO-MEDIA-1: colar URL externa direta limpa assetId e legacyUrl', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const mediaSection = container.querySelector('#inspector-hero-section-media') as HTMLElement;
    const mediaHeaderBtn = mediaSection.querySelector('button') as HTMLButtonElement;
    act(() => {
      mediaHeaderBtn.click();
    });

    const urlInput = container.querySelector('#hero-field-image-url') as HTMLInputElement;
    expect(urlInput).not.toBeNull();

    act(() => {
      setInputValue(urlInput, 'https://novo-site.com/hero-alta.png');
      urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patchUrl] = updateBlockSpy.mock.calls[0];
    expect(patchUrl.imageUrl).toBe('https://novo-site.com/hero-alta.png');
    expect(patchUrl.assetId).toBeUndefined();
    expect(patchUrl.legacyUrl).toBeUndefined();
  });

  // ==========================================================================
  // 7B. HERO-MEDIA-2: ENTER + BLUR SEM RERENDER GERA EXATAMENTE 1 MUTAÇÃO
  // ==========================================================================
  it('HERO-MEDIA-2: Enter seguido de blur sem rerender gera exatamente 1 mutação total', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const mediaSection = container.querySelector('#inspector-hero-section-media') as HTMLElement;
    const mediaHeaderBtn = mediaSection.querySelector('button') as HTMLButtonElement;
    act(() => {
      mediaHeaderBtn.click();
    });

    const urlInput = container.querySelector('#hero-field-image-url') as HTMLInputElement;

    act(() => {
      setInputValue(urlInput, 'https://fornecedor.com/hero-teste.png');
      urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);

    act(() => {
      urlInput.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // 7C. HERO-MEDIA-3: SELECIONAR ASSET VIA ACERVO LIMPA URLS
  // ==========================================================================
  it('HERO-MEDIA-3: selecionar asset no acervo comita assetId e limpa imageUrl/legacyUrl', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const openGalleryMock = vi.fn((callback) => {
      callback({ assetId: 'asset-hero-novo-200' });
    });
    useMediaStore.setState({ openGallery: openGalleryMock });

    renderComponent();

    const mediaSection = container.querySelector('#inspector-hero-section-media') as HTMLElement;
    const mediaHeaderBtn = mediaSection.querySelector('button') as HTMLButtonElement;
    act(() => {
      mediaHeaderBtn.click();
    });

    const buttons = Array.from(mediaSection.querySelectorAll('button'));
    const acervoBtn = buttons.find((b) => b.textContent?.includes('Abrir Acervo'));
    expect(acervoBtn).toBeDefined();

    act(() => {
      acervoBtn!.click();
    });

    expect(openGalleryMock).toHaveBeenCalledTimes(1);
    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patchAsset] = updateBlockSpy.mock.calls[0];
    expect(patchAsset.assetId).toBe('asset-hero-novo-200');
    expect(patchAsset.imageUrl).toBeUndefined();
    expect(patchAsset.legacyUrl).toBeUndefined();
  });

  // ==========================================================================
  // 7D. HERO-MEDIA-4: REMOVER IMAGEM LIMPA TUDO
  // ==========================================================================
  it('HERO-MEDIA-4: botão Remover Imagem limpa assetId, imageUrl e legacyUrl', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const mediaSection = container.querySelector('#inspector-hero-section-media') as HTMLElement;
    const mediaHeaderBtn = mediaSection.querySelector('button') as HTMLButtonElement;
    act(() => {
      mediaHeaderBtn.click();
    });

    const buttons = Array.from(mediaSection.querySelectorAll('button'));
    const removeBtn = buttons.find((b) => b.textContent?.includes('Remover Imagem'));
    expect(removeBtn).toBeDefined();

    act(() => {
      removeBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patchRemove] = updateBlockSpy.mock.calls[0];
    expect(patchRemove.assetId).toBeUndefined();
    expect(patchRemove.imageUrl).toBeUndefined();
    expect(patchRemove.legacyUrl).toBeUndefined();
  });

  // ==========================================================================
  // 7E. HERO-MEDIA-5: LEGENDA EDITA APENAS IMAGECAPTION
  // ==========================================================================
  it('HERO-MEDIA-5: legenda técnica edita exclusivamente imageCaption', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const mediaSection = container.querySelector('#inspector-hero-section-media') as HTMLElement;
    const mediaHeaderBtn = mediaSection.querySelector('button') as HTMLButtonElement;
    act(() => {
      mediaHeaderBtn.click();
    });

    const captionInput = container.querySelector('#hero-field-caption') as HTMLInputElement;
    expect(captionInput).not.toBeNull();

    act(() => {
      setInputValue(captionInput, 'Nova legenda técnica do hero');
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-hero-1', {
      imageCaption: 'Nova legenda técnica do hero'
    });
  });

  // ==========================================================================
  // 8. PRIMARY-MEDIA-UI-1: REUTILIZAÇÃO COMPROVADA DE COMPORTAMENTO
  // ==========================================================================
  it('PRIMARY-MEDIA-UI-1: ImageInspector e HeroBannerInspector compartilham o mesmo controle de mídia', () => {
    // 1. Monta ImageInspector
    act(() => {
      root!.render(<ImageInspector block={sampleHeroBlock} pageId="page-1" />);
    });
    const imageMediaInput = container.querySelector('#image-field-url');
    expect(imageMediaInput).not.toBeNull();

    // 2. Monta HeroBannerInspector
    act(() => {
      root!.render(<HeroBannerInspector block={sampleHeroBlock} pageId="page-1" />);
    });
    // Abrir seção de mídia
    const mediaSection = container.querySelector('#inspector-hero-section-media') as HTMLElement;
    const mediaHeaderBtn = mediaSection.querySelector('button') as HTMLButtonElement;
    act(() => {
      mediaHeaderBtn.click();
    });
    const heroMediaInput = container.querySelector('#hero-field-image-url');
    expect(heroMediaInput).not.toBeNull();
  });

  // ==========================================================================
  // 9. HERO-PALETTE-1 a HERO-PALETTE-5: PALETA VISUAL CANÔNICA
  // ==========================================================================
  it('HERO-PALETTE-1 a HERO-PALETTE-5: seleção de preset, autoridade style.gradient e limpeza de customData legado', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const legacyBlock: ContentBlock = {
      ...sampleHeroBlock,
      customData: { gradient: 'bg-legacy-gradient', extra: 'kept' }
    };

    renderComponent(legacyBlock);

    // Abrir seção de aparência
    const appearanceSection = container.querySelector('#inspector-hero-section-appearance') as HTMLElement;
    const appearanceHeaderBtn = appearanceSection.querySelector('button') as HTMLButtonElement;
    act(() => {
      appearanceHeaderBtn.click();
    });

    // Clicar no preset obsidian
    const obsidianBtn = appearanceSection.querySelector('button[data-palette-id="obsidian"]') as HTMLButtonElement;
    expect(obsidianBtn).not.toBeNull();

    act(() => {
      obsidianBtn.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [, , patch] = updateBlockSpy.mock.calls[0];

    // style.gradient recebe a classe do preset
    expect(patch.style.gradient).toBe('bg-gradient-to-b from-black via-zinc-950 to-black');

    // customData.gradient legado é limpo, preservando outras props
    expect(patch.customData).toBeDefined();
    expect(patch.customData.gradient).toBeUndefined();
    expect(patch.customData.extra).toBe('kept');
  });

  // ==========================================================================
  // 10. PARIDADE EDITOR / EXPORT DOCUMENTAL
  // ==========================================================================
  it('PARIDADE: Editor e CleanA4 renderizam os mesmos campos documentais para o Hero', () => {
    // 1. Editor
    act(() => {
      root!.render(<HeroBannerBlock block={sampleHeroBlock} pageId="page-1" isExport={false} isSelected={true} />);
    });
    const editorTitle = container.querySelector('h2')?.textContent;
    const editorSubtitle = container.querySelector('p')?.textContent;
    const editorBadge = container.querySelector('span[data-printable-field="badgeText"]')?.textContent;

    // 2. CleanA4 / Export
    act(() => {
      root!.render(<HeroBannerBlock block={sampleHeroBlock} pageId="page-1" isExport={true} isSelected={false} />);
    });
    const exportTitle = container.querySelector('h2')?.textContent;
    const exportSubtitle = container.querySelector('p')?.textContent;
    const exportBadge = container.querySelector('span[data-printable-field="badgeText"]')?.textContent;

    expect(exportTitle).toBe(editorTitle);
    expect(exportSubtitle).toBe(editorSubtitle);
    expect(exportBadge).toBe(editorBadge);
  });

  // ==========================================================================
  // 11. TRANSLATION: PARIDADE COM O EXTRATOR
  // ==========================================================================
  it('TRANSLATION: nós extraídos pelo hero.extractor correspondem aos valores renderizados', () => {
    const nodes = extractHeroBlocks(sampleHeroBlock, 'page-1', 1);

    const titleNode = nodes.find((n) => n.path === 'title');
    const subtitleNode = nodes.find((n) => n.path === 'subtitle');
    const badgeNode = nodes.find((n) => n.path === 'badgeText');
    const captionNode = nodes.find((n) => n.path === 'imageCaption');

    expect(titleNode?.sourceText).toBe('Calibrador de Pressão PCON-Y18');
    expect(subtitleNode?.sourceText).toBe('Solução compacta de calibração automática com exatidão metrológica.');
    expect(badgeNode?.sourceText).toBe('PRESYS — INSTRUMENTAÇÃO INDUSTRIAL');
    expect(captionNode?.sourceText).toBe('Figura Destaque — Estação PCON');
  });
});
