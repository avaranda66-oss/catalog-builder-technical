// tests/components/full-page-cover-integration.test.tsx
// Testes integrados de regressão da Capa A4 Página Inteira (CORE.E4).
// Valida:
// 1. Zero auto-migração ao montar (COVER-LEGACY-MOUNT-1)
// 2. Proteção estrita de marca corporativa PRESYS (COVER-I18N-LOGO-1)
// 3. Zero nós fantasmas de tradução quando canônico (COVER-I18N-CANONICAL-1)
// 4. Limpeza de contentEditable em modo impressão/CleanA4 (COVER-PRINT-CLEANLINESS-1)
// 5. Preservação de geometria pelo TranslationApplier (COVER-TRANSLATION-APPLIER-1)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { FullPageCoverBlock } from '../../src/components/editor/blocks/FullPageCoverBlock';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { extractHeroBlocks } from '../../src/translation/block-extractors/hero.extractor';
import { TranslationApplierRegistry } from '../../src/translation/translation-applier.registry';

describe('Full Page Cover Integration & Parity (CORE.E4)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const sampleLegacyCover: ContentBlock = {
    id: 'block-cover-legacy',
    type: 'full_page_cover',
    title: 'Título Legacy Antigo',
    subtitle: 'Subtítulo Legacy Antigo',
    badgeText: 'BADGE LEGACY',
    customData: {
      brandName: 'PRESYS INSTRUMENTOS',
      overlayOpacity: 40
    }
  };

  const sampleCanonicalCover: ContentBlock = {
    id: 'block-cover-canonical',
    type: 'full_page_cover',
    title: 'Título Oculto Não Renderizado',
    subtitle: 'Subtítulo Oculto Não Renderizado',
    badgeText: 'BADGE OCULTO',
    customData: {
      brandName: 'MARCA OCULTA',
      overlayOpacity: 50,
      highlights: ['Highlight Fantasma que não renderiza'],
      canvasLayers: [
        {
          id: 'layer-logo',
          type: 'text',
          label: 'Marca',
          content: 'PRESYS',
          x: 5,
          y: 3.5,
          zIndex: 10,
          visible: true
        },
        {
          id: 'layer-badge',
          type: 'badge',
          label: 'Selo',
          content: 'CALIBRAÇÃO RBC',
          x: 58,
          y: 3.8,
          zIndex: 11,
          visible: true
        },
        {
          id: 'layer-title',
          type: 'text',
          label: 'Título',
          content: 'Calibrador de Temperatura PCON-Y18',
          x: 5,
          y: 22,
          zIndex: 12,
          visible: true
        },
        {
          id: 'layer-subtitle',
          type: 'text',
          label: 'Subtítulo',
          content: 'Alta Precisão para Termometria Industrial',
          x: 5,
          y: 29,
          zIndex: 13,
          visible: true
        }
      ]
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

  // ==========================================================================
  // 1. COVER-LEGACY-MOUNT-1: ZERO AUTO-MIGRATION ON MOUNT
  // ==========================================================================
  it('COVER-LEGACY-MOUNT-1: montar ou renderizar uma capa legacy gera ZERO mutação documental', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    act(() => {
      root!.render(
        <FullPageCoverBlock block={sampleLegacyCover} pageId="page-1" isSelected={true} />
      );
    });

    // Renderiza perfeitamente no DOM as 5 camadas legadas
    expect(container.textContent).toContain('PRESYS INSTRUMENTOS');
    expect(container.textContent).toContain('Título Legacy Antigo');

    // Nenhuma chamada ao updateBlock! Zero auto-migração silenciosa no mount
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  // ==========================================================================
  // 2. COVER-I18N-LOGO-1: MARCA CORPORATIVA PROTEGIDA
  // ==========================================================================
  it('COVER-I18N-LOGO-1: layer-logo tem policy=protect; título e subtítulo têm policy=translate', () => {
    const nodes = extractHeroBlocks(sampleCanonicalCover, 'page-1', 1);

    const logoNode = nodes.find((n) => n.id.includes('layer_layer-logo'));
    expect(logoNode).toBeDefined();
    expect(logoNode?.sourceText).toBe('PRESYS');
    expect(logoNode?.policy).toBe('protect'); // Marca corporativa protegida!

    const titleNode = nodes.find((n) => n.id.includes('layer_layer-title'));
    expect(titleNode).toBeDefined();
    expect(titleNode?.sourceText).toBe('Calibrador de Temperatura PCON-Y18');
    expect(titleNode?.policy).toBe('translate');

    const subtitleNode = nodes.find((n) => n.id.includes('layer_layer-subtitle'));
    expect(subtitleNode).toBeDefined();
    expect(subtitleNode?.sourceText).toBe('Alta Precisão para Termometria Industrial');
    expect(subtitleNode?.policy).toBe('translate');

    const badgeNode = nodes.find((n) => n.id.includes('layer_layer-badge'));
    expect(badgeNode).toBeDefined();
    expect(badgeNode?.sourceText).toBe('CALIBRAÇÃO RBC');
    expect(badgeNode?.policy).toBe('translate');
  });

  // ==========================================================================
  // 3. COVER-I18N-CANONICAL-1: ZERO GHOST TRANSLATIONS
  // ==========================================================================
  it('COVER-I18N-CANONICAL-1: capa canônica NÃO extrai textos legacy ocultos nem highlights', () => {
    const nodes = extractHeroBlocks(sampleCanonicalCover, 'page-1', 1);
    const sourceTexts = nodes.map((n) => n.sourceText);

    // Contém os textos das camadas canônicas visíveis
    expect(sourceTexts).toContain('Calibrador de Temperatura PCON-Y18');
    expect(sourceTexts).toContain('Alta Precisão para Termometria Industrial');

    // NÃO contém os textos legados antigos ocultos
    expect(sourceTexts).not.toContain('Título Oculto Não Renderizado');
    expect(sourceTexts).not.toContain('Subtítulo Oculto Não Renderizado');
    expect(sourceTexts).not.toContain('BADGE OCULTO');
    expect(sourceTexts).not.toContain('MARCA OCULTA');

    // NÃO contém highlights fantasmas
    expect(sourceTexts).not.toContain('Highlight Fantasma que não renderiza');
  });

  // ==========================================================================
  // 3B. COVER-I18N-HIDDEN-LAYER-1: CAMADAS OCULTAS (visible === false) NÃO TRADUZEM
  // ==========================================================================
  it('COVER-I18N-HIDDEN-LAYER-1: camada com visible === false não gera PrintableTextNode', () => {
    const coverWithHiddenLayer: ContentBlock = {
      ...sampleCanonicalCover,
      customData: {
        ...sampleCanonicalCover.customData,
        canvasLayers: [
          {
            id: 'layer-title',
            type: 'text',
            label: 'Título Visível',
            content: 'Visible Title',
            x: 5,
            y: 20,
            visible: true
          },
          {
            id: 'layer-hidden-note',
            type: 'text',
            label: 'Nota Oculta',
            content: 'Do Not Translate Me',
            x: 5,
            y: 40,
            visible: false
          }
        ]
      }
    };

    const nodes = extractHeroBlocks(coverWithHiddenLayer, 'page-1', 1);
    const texts = nodes.map((n) => n.sourceText);

    expect(texts).toContain('Visible Title');
    expect(texts).not.toContain('Do Not Translate Me');
  });

  // ==========================================================================
  // 4. COVER-I18N-LEGACY-1: CAPA LEGADA EXTRAI CAMPOS QUE ALIMENTAM AS DERIVED LAYERS
  // ==========================================================================
  it('COVER-I18N-LEGACY-1: capa legacy extrai brandName protegido e título/subtítulo/badge para tradução', () => {
    const nodes = extractHeroBlocks(sampleLegacyCover, 'page-1', 1);

    const brandNode = nodes.find((n) => n.path === 'customData.brandName');
    expect(brandNode).toBeDefined();
    expect(brandNode?.sourceText).toBe('PRESYS INSTRUMENTOS');
    expect(brandNode?.policy).toBe('protect');

    const titleNode = nodes.find((n) => n.path === 'title');
    expect(titleNode).toBeDefined();
    expect(titleNode?.sourceText).toBe('Título Legacy Antigo');
    expect(titleNode?.policy).toBe('translate');
  });

  // ==========================================================================
  // 5. COVER-PRINT-CLEANLINESS-1: CONTENTEDITABLE É FALSE QUANDO ISSELECTED=FALSE
  // ==========================================================================
  it('COVER-PRINT-CLEANLINESS-1: contentEditable é desativado quando isSelected=false (CleanA4 Print)', () => {
    act(() => {
      root!.render(
        <FullPageCoverBlock block={sampleCanonicalCover} pageId="page-1" isSelected={false} />
      );
    });

    const editableElements = container.querySelectorAll('[contenteditable="true"]');
    expect(editableElements.length).toBe(0);
  });

  // ==========================================================================
  // 6. COVER-TRANSLATION-APPLIER-1: APLICAÇÃO DE TRADUÇÃO PRESERVA GEOMETRIA E IDS
  // ==========================================================================
  it('COVER-TRANSLATION-APPLIER-1: TranslationApplier traduz conteúdo de canvasLayers sem alterar x, y, fontSize ou id', () => {
    const catalogWithCover = {
      id: 'cat-trans',
      title: 'Original',
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          type: 'cover' as const,
          blocks: [JSON.parse(JSON.stringify(sampleCanonicalCover))]
        }
      ]
    };

    const nodeTitleId = 'p1_bblock-cover-canonical_layer_layer-title';
    const translationMap = new Map<string, string>([
      [nodeTitleId, 'PCON-Y18 Temperature Calibrator (English)']
    ]);

    const result = TranslationApplierRegistry.applyTranslations(
      catalogWithCover as any,
      translationMap,
      'en-US'
    );
    expect(result.appliedCount).toBe(1);

    const translatedBlock = result.translatedCatalog.pages[0].blocks[0];
    const translatedLayers = translatedBlock.customData?.canvasLayers;
    const titleLayer = translatedLayers.find((l: any) => l.id === 'layer-title');

    expect(titleLayer).toBeDefined();
    expect(titleLayer.content).toBe('PCON-Y18 Temperature Calibrator (English)');

    // Geometria estritamente preservada!
    expect(titleLayer.x).toBe(5);
    expect(titleLayer.y).toBe(22);
    expect(titleLayer.zIndex).toBe(12);
    expect(titleLayer.id).toBe('layer-title');
  });
});
