// tests/components/composite-blocks-parity.test.tsx
// Suíte de Paridade, Anti-Ghost, Zero Mutation e Contratos Canônicos (CORE.E6B).
// Utiliza act() e createRoot() nativos do React para máxima velocidade e zero dependências externas.

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentBlock, Catalog } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

import { FeaturesListBlock } from '../../src/components/editor/blocks/FeaturesListBlock';
import { MultiModeCalibratorBlock } from '../../src/components/editor/blocks/MultiModeCalibratorBlock';
import { SoftwareConnectivityBlock } from '../../src/components/editor/blocks/SoftwareConnectivityBlock';
import { ImageGalleryBlock } from '../../src/components/editor/blocks/ImageGalleryBlock';

import { FeaturesListInspector } from '../../src/components/editor/inspector/FeaturesListInspector';
import { MultiModeCalibratorInspector } from '../../src/components/editor/inspector/MultiModeCalibratorInspector';
import { SoftwareConnectivityInspector } from '../../src/components/editor/inspector/SoftwareConnectivityInspector';
import { ImageGalleryInspector } from '../../src/components/editor/inspector/ImageGalleryInspector';

import { extractFeaturesBlocks } from '../../src/translation/block-extractors/features.extractor';
import { extractGalleryBlocks } from '../../src/translation/block-extractors/gallery.extractor';
import { TranslationApplierRegistry } from '../../src/translation/translation-applier.registry';
import {
  ElementCapabilityRegistry,
  ELEMENT_CAPABILITY_REGISTRY_VERSION
} from '../../src/domain/capabilities/element-capability.registry';
import { CAPABILITY_IDS } from '../../src/domain/capabilities/capability.ids';
import { SIDEBAR_BLOCK_ITEMS } from '../../src/components/editor/SidebarBlockLibrary';

describe('CORE.E6B — Composite Blocks Parity & Contracts', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container.remove();
  });

  const renderIntoDOM = (element: React.ReactElement) => {
    act(() => {
      root!.render(element);
    });
  };

  // =========================================================================
  // GHOST DATA CHECKS: COMPOSITE-GHOST-1 to 4
  // =========================================================================

  it('COMPOSITE-GHOST-1: features_list without features renders ZERO fake features', () => {
    const block: ContentBlock = {
      id: 'feat-1',
      type: 'features_list',
      title: 'Recursos Metrológicos'
    };

    renderIntoDOM(
      <FeaturesListBlock block={block} pageId="p1" isSelected={false} isExport={true} />
    );

    expect(container.textContent).toContain('Recursos Metrológicos');
    expect(container.querySelectorAll('[data-printable-field^="feat_"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('Alta Exatidão');
    expect(container.textContent).not.toContain('Destaques e Recursos');
  });

  it('COMPOSITE-GHOST-2: multi_mode_calibrator without modes renders ZERO fake modes', () => {
    const block: ContentBlock = {
      id: 'mm-1',
      type: 'multi_mode_calibrator',
      title: 'Modos Operacionais',
      badgeText: 'Series PCON'
    };

    renderIntoDOM(
      <MultiModeCalibratorBlock block={block} pageId="p1" isSelected={false} isExport={true} />
    );

    expect(container.textContent).toContain('Modos Operacionais');
    expect(container.textContent).toContain('Series PCON');
    expect(container.querySelectorAll('[data-printable-field^="mode_"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('Dry Block');
    expect(container.textContent).not.toContain('Banho de Óleo');
  });

  it('COMPOSITE-GHOST-3: software_connectivity without items renders ZERO fake items', () => {
    const block: ContentBlock = {
      id: 'soft-1',
      type: 'software_connectivity',
      title: 'Conectividade Digital'
    };

    renderIntoDOM(
      <SoftwareConnectivityBlock block={block} pageId="p1" isSelected={false} isExport={true} />
    );

    expect(container.textContent).toContain('Conectividade Digital');
    expect(container.querySelectorAll('[data-printable-field^="item_"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('Software ISOPLAN');
    expect(container.textContent).not.toContain('Comunicação HART');
  });

  it('COMPOSITE-GHOST-4: image_gallery without images renders ZERO fake demo photos', () => {
    const block: ContentBlock = {
      id: 'gal-1',
      type: 'image_gallery',
      title: 'Galeria Industrial'
    };

    renderIntoDOM(
      <ImageGalleryBlock block={block} pageId="p1" isSelected={false} isExport={true} />
    );

    expect(container.textContent).toContain('Galeria Industrial');
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.innerHTML).not.toContain('unsplash.com');
  });

  // =========================================================================
  // ZERO MUTATION ON MOUNT: COMPOSITE-MOUNT-ZERO-1
  // =========================================================================

  it('COMPOSITE-MOUNT-ZERO-1: inspector mounting produces ZERO mutations', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy } as any);

    const blocks: ContentBlock[] = [
      { id: 'b1', type: 'features_list', title: 'F' },
      { id: 'b2', type: 'multi_mode_calibrator', title: 'M' },
      { id: 'b3', type: 'software_connectivity', title: 'S' },
      { id: 'b4', type: 'image_gallery', title: 'G' }
    ];

    renderIntoDOM(
      <div>
        <FeaturesListInspector block={blocks[0]} pageId="p1" />
        <MultiModeCalibratorInspector block={blocks[1]} pageId="p1" />
        <SoftwareConnectivityInspector block={blocks[2]} pageId="p1" />
        <ImageGalleryInspector block={blocks[3]} pageId="p1" />
      </div>
    );

    expect(updateBlockSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // DELETE LAST ITEM ALLOWED: FEATURES, MULTIMODE, SOFTWARE, GALLERY
  // =========================================================================

  it('FEATURES-DELETE-LAST-1: deleting the last feature yields features: []', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy } as any);

    const block: ContentBlock = {
      id: 'b1',
      type: 'features_list',
      features: [{ id: 'f1', title: 'Only Feature', description: 'Desc' }]
    };

    renderIntoDOM(<FeaturesListInspector block={block} pageId="p1" />);

    const deleteBtn = container.querySelector('button[title="Excluir este destaque"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();

    act(() => {
      deleteBtn.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('p1', 'b1', { features: [] });
  });

  it('MULTIMODE-DELETE-LAST-1: deleting the last mode yields modes: []', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy } as any);

    const block: ContentBlock = {
      id: 'b1',
      type: 'multi_mode_calibrator',
      customData: {
        otherProp: 42,
        modes: [{ id: 'm1', badge: '01', title: 'Only Mode', desc: 'Desc' }]
      }
    };

    renderIntoDOM(<MultiModeCalibratorInspector block={block} pageId="p1" />);

    const deleteBtn = container.querySelector('button[title="Excluir este modo"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();

    act(() => {
      deleteBtn.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('p1', 'b1', {
      customData: {
        otherProp: 42,
        modes: []
      }
    });
  });

  it('SOFTWARE-DELETE-LAST-1: deleting the last software item yields items: []', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy } as any);

    const block: ContentBlock = {
      id: 'b1',
      type: 'software_connectivity',
      customData: {
        items: [{ badge: 'B', title: 'Only Item', desc: 'Desc' }]
      }
    };

    renderIntoDOM(<SoftwareConnectivityInspector block={block} pageId="p1" />);

    const deleteBtn = container.querySelector('button[title="Excluir este recurso"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();

    act(() => {
      deleteBtn.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('p1', 'b1', {
      customData: {
        items: []
      }
    });
  });

  it('GALLERY-DELETE-LAST-1: deleting the last gallery item yields images: []', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy } as any);

    const block: ContentBlock = {
      id: 'b1',
      type: 'image_gallery',
      images: [{ url: 'https://example.com/test.jpg', caption: 'Only Photo' }]
    };

    renderIntoDOM(<ImageGalleryInspector block={block} pageId="p1" />);

    const deleteBtn = container.querySelector('button[title="Excluir este item da galeria"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();

    act(() => {
      deleteBtn.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('p1', 'b1', { images: [] });
  });

  // =========================================================================
  // TRANSLATION CONTRACTS: STABLE IDS, LEGACY FALLBACK, NOSOURCE FILTER
  // =========================================================================

  it('MULTIMODE-I18N-ID-1: extractor emits stable mode.id and applier translates with stable ID', () => {
    const block: ContentBlock = {
      id: 'blk-mm',
      type: 'multi_mode_calibrator',
      title: 'Sistema',
      badgeText: 'Series',
      customData: {
        modes: [
          { id: 'uuid-101', badge: '01', title: 'Bloco Seco', desc: 'Calibração rápida' }
        ]
      }
    };

    const nodes = extractFeaturesBlocks(block, 'p1', 1);
    const titleNode = nodes.find((n) => n.id === 'p1_bblk-mm_mode_uuid-101_title');
    expect(titleNode).toBeDefined();
    expect(titleNode?.sourceText).toBe('Bloco Seco');

    const catalog: Catalog = {
      id: 'cat-1',
      title: 'Cat',
      themeId: 'default',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [JSON.parse(JSON.stringify(block))]
        }
      ]
    };

    const translations = [
      { id: 'p1_bblk-mm_mode_uuid-101_title', text: 'Dry Block' },
      { id: 'p1_bblk-mm_mode_uuid-101_desc', text: 'Fast calibration' }
    ];

    const res = TranslationApplierRegistry.apply(catalog, translations, 'en');
    expect(res.appliedCount).toBe(2);

    const translatedBlock = res.translatedCatalog.pages[0].blocks[0];
    expect(translatedBlock.customData.modes[0].title).toBe('Dry Block');
    expect(translatedBlock.customData.modes[0].desc).toBe('Fast calibration');
    expect(translatedBlock.customData.modes[0].id).toBe('uuid-101'); // Preserves ID
  });

  it('MULTIMODE-I18N-LEGACY-ID-1: applier falls back gracefully to legacy index ID', () => {
    const block: ContentBlock = {
      id: 'blk-mm',
      type: 'multi_mode_calibrator',
      customData: {
        modes: [
          { id: 'uuid-202', badge: '02', title: 'Banho Termostático', desc: 'Uniformidade' }
        ]
      }
    };

    const catalog: Catalog = {
      id: 'cat-1',
      title: 'Cat',
      themeId: 'default',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [JSON.parse(JSON.stringify(block))]
        }
      ]
    };

    // Tradução passada com chave antiga baseada em índice
    const translations = [
      { id: 'p1_bblk-mm_mode_0_title', text: 'Thermostatic Bath' },
      { id: 'p1_bblk-mm_mode_0_desc', text: 'Thermal uniformity' }
    ];

    const res = TranslationApplierRegistry.apply(catalog, translations, 'en');
    expect(res.appliedCount).toBe(2);

    const translatedBlock = res.translatedCatalog.pages[0].blocks[0];
    expect(translatedBlock.customData.modes[0].title).toBe('Thermostatic Bath');
    expect(translatedBlock.customData.modes[0].desc).toBe('Thermal uniformity');
  });

  it('GALLERY-I18N-NOSOURCE-1: gallery caption is NOT extracted if item has no valid image source', () => {
    const block: ContentBlock = {
      id: 'blk-gal',
      type: 'image_gallery',
      title: 'Galeria',
      images: [
        { url: '', caption: 'Caption Without Image' },
        { url: 'https://example.com/photo.jpg', caption: 'Caption With Image' }
      ]
    };

    const nodes = extractGalleryBlocks(block, 'p1', 1);

    // O item 0 não tem fonte, logo caption NÃO deve ser extraído (CORE.E6B Req 27)
    const caption0 = nodes.find((n) => n.id === 'p1_bblk-gal_img_0_caption');
    expect(caption0).toBeUndefined();

    // O item 1 tem fonte válida, logo caption DEVE ser extraído
    const caption1 = nodes.find((n) => n.id === 'p1_bblk-gal_img_1_caption');
    expect(caption1).toBeDefined();
    expect(caption1?.sourceText).toBe('Caption With Image');
  });

  // =========================================================================
  // CUSTOM DATA PRESERVATION: COMPOSITE-CUSTOMDATA-PRESERVE-1
  // =========================================================================

  it('COMPOSITE-CUSTOMDATA-PRESERVE-1: inspector edits preserve unrelated customData', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy } as any);

    const block: ContentBlock = {
      id: 'blk-soft',
      type: 'software_connectivity',
      customData: {
        importantFlag: 'preserved',
        nestedSetting: { key: 99 },
        items: [{ badge: 'Old', title: 'Old Title', desc: 'Old Desc' }]
      }
    };

    renderIntoDOM(<SoftwareConnectivityInspector block={block} pageId="p1" />);

    const titleInput = container.querySelector('#software-item-0-title') as HTMLInputElement;
    expect(titleInput).not.toBeNull();

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(titleInput, 'New Software Title');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateBlockSpy).toHaveBeenCalled();
    const lastCallArg = updateBlockSpy.mock.calls[updateBlockSpy.mock.calls.length - 1][2];

    expect(lastCallArg.customData.importantFlag).toBe('preserved');
    expect(lastCallArg.customData.nestedSetting).toEqual({ key: 99 });
    expect(lastCallArg.customData.items[0].title).toBe('New Software Title');
  });

  // =========================================================================
  // EXPORT CLICK IS NO-OP: COMPOSITE-EXPORT-CLICK-1
  // =========================================================================

  it('COMPOSITE-EXPORT-CLICK-1: isExport=true prevents setSelectedBlockId on click', () => {
    const setSelectedBlockIdSpy = vi.fn();
    useCatalogStore.setState({ setSelectedBlockId: setSelectedBlockIdSpy } as any);

    const fBlock: ContentBlock = { id: 'f1', type: 'features_list', title: 'F' };
    const mBlock: ContentBlock = { id: 'm1', type: 'multi_mode_calibrator', title: 'M' };
    const sBlock: ContentBlock = { id: 's1', type: 'software_connectivity', title: 'S' };
    const gBlock: ContentBlock = { id: 'g1', type: 'image_gallery', title: 'G' };

    renderIntoDOM(
      <div>
        <FeaturesListBlock block={fBlock} pageId="p1" isSelected={false} isExport={true} />
        <MultiModeCalibratorBlock block={mBlock} pageId="p1" isSelected={false} isExport={true} />
        <SoftwareConnectivityBlock block={sBlock} pageId="p1" isSelected={false} isExport={true} />
        <ImageGalleryBlock block={gBlock} pageId="p1" isSelected={false} isExport={true} />
      </div>
    );

    const blocks = container.querySelectorAll('.relative');
    expect(blocks.length).toBe(4);

    blocks.forEach((el) => {
      act(() => {
        (el as HTMLElement).click();
      });
    });

    expect(setSelectedBlockIdSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CAPABILITY REGISTRY CROSS-CONTRACT WITH PRESETS: COMPOSITE-CAP-DEFAULT-1 to 4
  // =========================================================================

  it('COMPOSITE-CAP-DEFAULT-1: features_list registry matches Sidebar preset blockData truth', () => {
    expect(ELEMENT_CAPABILITY_REGISTRY_VERSION).toBe(6);

    const option = SIDEBAR_BLOCK_ITEMS.find((it) => it.blockData?.type === 'features_list');
    expect(option).toBeDefined();

    const def = ElementCapabilityRegistry.features_list;
    const titleCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_TITLE);
    const itemsCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_ITEMS);

    // Sidebar blockData materializa apenas title
    expect(option?.blockData?.title).toBeDefined();
    expect((option?.blockData as any)?.features).toBeUndefined();

    // Registry reflete exatamente esta verdade
    expect(titleCap?.defaultSource).toBe('preset');
    expect(itemsCap?.defaultSource).toBe('none');
  });

  it('COMPOSITE-CAP-DEFAULT-2: multi_mode_calibrator registry matches Sidebar preset blockData truth', () => {
    const option = SIDEBAR_BLOCK_ITEMS.find((it) => it.blockData?.type === 'multi_mode_calibrator');
    expect(option).toBeDefined();

    const def = ElementCapabilityRegistry.multi_mode_calibrator;
    const titleCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_TITLE);
    const badgeCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_BADGE);
    const modesCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_MODES);

    // Sidebar blockData materializa title e badgeText
    expect(option?.blockData?.title).toBeDefined();
    expect(option?.blockData?.badgeText).toBeDefined();
    expect(option?.blockData?.customData?.modes).toBeUndefined();

    // Registry reflete exatamente esta verdade
    expect(titleCap?.defaultSource).toBe('preset');
    expect(badgeCap?.defaultSource).toBe('preset');
    expect(modesCap?.defaultSource).toBe('none');
  });

  it('COMPOSITE-CAP-DEFAULT-3: software_connectivity registry matches Sidebar preset blockData truth', () => {
    const option = SIDEBAR_BLOCK_ITEMS.find((it) => it.blockData?.type === 'software_connectivity');
    expect(option).toBeDefined();

    const def = ElementCapabilityRegistry.software_connectivity;
    const titleCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_TITLE);
    const badgeCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_BADGE);
    const itemsCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_ITEMS);

    // Sidebar blockData materializa title apenas, zero badgeText, zero customData.items
    expect(option?.blockData?.title).toBeDefined();
    expect(option?.blockData?.badgeText).toBeUndefined();
    expect(option?.blockData?.customData?.items).toBeUndefined();

    // Registry reflete exatamente esta verdade
    expect(titleCap?.defaultSource).toBe('preset');
    expect(badgeCap?.defaultSource).toBe('none');
    expect(itemsCap?.defaultSource).toBe('none');
  });

  it('COMPOSITE-CAP-DEFAULT-4: image_gallery registry matches Sidebar preset blockData truth', () => {
    const option = SIDEBAR_BLOCK_ITEMS.find((it) => it.blockData?.type === 'image_gallery');
    expect(option).toBeDefined();

    const def = ElementCapabilityRegistry.image_gallery;
    const titleCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.CONTENT_TITLE);
    const itemsCap = def.capabilities.find((c) => c.id === CAPABILITY_IDS.MEDIA_GALLERY_ITEMS);

    // Sidebar blockData materializa title apenas, zero images
    expect(option?.blockData?.title).toBeDefined();
    expect(option?.blockData?.images).toBeUndefined();

    // Registry reflete exatamente esta verdade
    expect(titleCap?.defaultSource).toBe('preset');
    expect(itemsCap?.defaultSource).toBe('none');
  });
});
