// src/translation/block-extractors/hero.extractor.ts
// Extrator resiliente e protegido contra formatos legados ou malformados para blocos Hero, Headers e Capa A4.

import { ContentBlock, CanvasLayer } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractHeroBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
  const nodes: PrintableTextNode[] = [];
  if (!block || typeof block !== 'object') return nodes;

  const isCanonicalCover =
    block.type === 'full_page_cover' &&
    Array.isArray(block.customData?.canvasLayers);

  // Se for capa canônica (canvasLayers é array, inclusive []), NÃO extrai campos legados
  // (badgeText, title, subtitle, brandName), pois eles não aparecem no PDF.
  // Regra: traduzir tudo que aparece no PDF e SOMENTE o que aparece no PDF.
  if (!isCanonicalCover) {
    const isCover = block.type === 'full_page_cover';
    const isBadgeVisible = !isCover || block.customData?.badgeConfig?.visible !== false;
    const isTitleVisible = !isCover || block.customData?.titleConfig?.visible !== false;
    const isSubtitleVisible = !isCover || block.customData?.subtitleConfig?.visible !== false;
    const isLogoVisible = !isCover || block.customData?.logoConfig?.visible !== false;

    if (isBadgeVisible && typeof block.badgeText === 'string' && block.badgeText.trim()) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_badgeText`,
        pageId,
        blockId: block.id,
        path: 'badgeText',
        sourceText: block.badgeText.trim(),
        kind: 'badge',
        policy: 'translate',
        renderExpectation: 'required',
        source: { blockType: block.type, field: 'badgeText' }
      });
    }

    if (isTitleVisible && typeof block.title === 'string' && block.title.trim()) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_title`,
        pageId,
        blockId: block.id,
        path: 'title',
        sourceText: block.title.trim(),
        kind: 'heading',
        policy: 'translate',
        renderExpectation: 'required',
        source: { blockType: block.type, field: 'title' }
      });
    }

    if (isSubtitleVisible && typeof block.subtitle === 'string' && block.subtitle.trim()) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_subtitle`,
        pageId,
        blockId: block.id,
        path: 'subtitle',
        sourceText: block.subtitle.trim(),
        kind: 'body',
        policy: 'translate',
        renderExpectation: 'required',
        source: { blockType: block.type, field: 'subtitle' }
      });
    }

    // Marca legacy na cover (aparece na layer-logo derivada na impressão apenas se logoConfig.visible !== false)
    if (isCover && isLogoVisible) {
      const brand =
        typeof block.customData?.brandName === 'string' && block.customData.brandName.trim()
          ? block.customData.brandName.trim()
          : 'PRESYS';
      nodes.push({
        id: `p${pageNumber}_b${block.id}_brandName`,
        pageId,
        blockId: block.id,
        path: 'customData.brandName',
        sourceText: brand,
        kind: 'heading',
        policy: 'protect',
        renderExpectation: 'required',
        source: { blockType: block.type, field: 'brandName' }
      });
    }
  }

  if (typeof block.imageCaption === 'string' && block.imageCaption.trim()) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_imageCaption`,
      pageId,
      blockId: block.id,
      path: 'imageCaption',
      sourceText: block.imageCaption.trim(),
      kind: 'caption',
      policy: 'translate',
      source: { blockType: block.type, field: 'imageCaption' }
    });
  }

  // Full Page Cover: Canvas Layers de Texto e Badges
  if (block.type === 'full_page_cover' && Array.isArray(block.customData?.canvasLayers)) {
    block.customData.canvasLayers.forEach((layer: CanvasLayer, idx: number) => {
      if (
        layer &&
        typeof layer === 'object' &&
        layer.visible !== false &&
        (layer.type === 'text' || layer.type === 'badge') &&
        typeof layer.content === 'string' &&
        layer.content.trim()
      ) {
        // Marca institucional (layer-logo) é explicitamente protegida contra tradução
        const isBrandLogo = layer.id === 'layer-logo';
        nodes.push({
          id: `p${pageNumber}_b${block.id}_layer_${layer.id || idx}`,
          pageId,
          blockId: block.id,
          path: `customData.canvasLayers[${idx}].content`,
          sourceText: layer.content.trim(),
          kind: layer.type === 'badge' ? 'badge' : 'heading',
          policy: isBrandLogo ? 'protect' : 'translate',
          renderExpectation: 'required',
          source: { blockType: block.type, field: `canvasLayers[${idx}].content` }
        });
      }
    });
  }

  // Description em customData (apenas para blocos que a exibem visualmente)
  if (
    (block.type === 'hero_banner' || block.type === 'fluke_header') &&
    typeof block.customData?.description === 'string' &&
    block.customData.description.trim()
  ) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_description`,
      pageId,
      blockId: block.id,
      path: 'customData.description',
      sourceText: block.customData.description.trim(),
      kind: 'body',
      policy: 'translate',
      source: { blockType: block.type, field: 'description' }
    });
  }

  // Highlights & Notas técnicas adicionais em customData
  // full_page_cover NÃO renderiza highlights visualmente: não extrai nós de tradução
  // Elimina fallbacks fantasmas: apenas itens reais existentes e não vazios são extraídos
  const rawHighlights = block.type === 'full_page_cover' ? [] : block.customData?.highlights;
  const highlights: string[] = Array.isArray(rawHighlights) ? rawHighlights : [];

  highlights.forEach((hl: string, idx: number) => {
    if (typeof hl === 'string' && hl.trim()) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_hl_${idx}`,
        pageId,
        blockId: block.id,
        path: `customData.highlights[${idx}]`,
        sourceText: hl.trim(),
        kind: 'body',
        policy: 'translate',
        source: { blockType: block.type, field: `highlights[${idx}]` }
      });
    }
  });

  // Fluke Header: Badge Secundário real
  if (block.type === 'fluke_header') {
    if (
      typeof block.customData?.badgeSecondary === 'string' &&
      block.customData.badgeSecondary.trim()
    ) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_badgeSecondary`,
        pageId,
        blockId: block.id,
        path: 'customData.badgeSecondary',
        sourceText: block.customData.badgeSecondary.trim(),
        kind: 'badge',
        policy: 'translate',
        source: { blockType: block.type, field: 'badgeSecondary' }
      });
    }
  }

  // Additel Two Col: Overview, Badge Subtitle e Bullets reais
  if ((block.type as string) === 'additel_two_col' || block.type === 'additel_two_col_hero') {
    if (typeof block.customData?.overview === 'string' && block.customData.overview.trim()) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_overview`,
        pageId,
        blockId: block.id,
        path: 'customData.overview',
        sourceText: block.customData.overview.trim(),
        kind: 'body',
        policy: 'translate',
        source: { blockType: block.type, field: 'overview' }
      });
    }

    if (
      typeof block.customData?.badgeSubtitle === 'string' &&
      block.customData.badgeSubtitle.trim()
    ) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_badgeSubtitle`,
        pageId,
        blockId: block.id,
        path: 'customData.badgeSubtitle',
        sourceText: block.customData.badgeSubtitle.trim(),
        kind: 'badge',
        policy: 'translate',
        source: { blockType: block.type, field: 'badgeSubtitle' }
      });
    }

    // Autoridade de bullets: customData.bullets canônico > fallback bulletList legado > []
    const customData = block.customData;
    const isCanonicalBullets = Array.isArray(customData?.bullets);
    const rawBullets: string[] = isCanonicalBullets
      ? (customData!.bullets as string[])
      : Array.isArray(customData?.bulletList)
      ? (customData!.bulletList as string[])
      : [];
    const basePath = isCanonicalBullets ? 'customData.bullets' : 'customData.bulletList';

    rawBullets.forEach((b: string, idx: number) => {
      if (typeof b === 'string' && b.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_bullet_${idx}`,
          pageId,
          blockId: block.id,
          path: `${basePath}[${idx}]`,
          sourceText: b.trim(),
          kind: 'body',
          policy: 'translate',
          source: { blockType: block.type, field: `bullets[${idx}]` }
        });
      }
    });
  }

  return nodes;
}
