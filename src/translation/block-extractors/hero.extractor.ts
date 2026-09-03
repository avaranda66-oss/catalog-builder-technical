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
    if (typeof block.badgeText === 'string' && block.badgeText.trim()) {
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

    if (typeof block.title === 'string' && block.title.trim()) {
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

    if (typeof block.subtitle === 'string' && block.subtitle.trim()) {
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

    // Marca legacy na cover (aparece na layer-logo derivada na impressão)
    if (block.type === 'full_page_cover') {
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
  if (block.type !== 'full_page_cover' && typeof block.customData?.description === 'string' && block.customData.description.trim()) {
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
  } else if (block.type === 'fluke_header') {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_description`,
      pageId,
      blockId: block.id,
      path: 'customData.description',
      sourceText: 'Os calibradores metrológicos combinam máxima portabilidade e velocidade com estabilidade de laboratório primário. Com compensação de gradiente térmico integrada e canais para medição de Pt100, termopares e loop de 24V.',
      kind: 'body',
      policy: 'translate',
      source: { blockType: block.type, field: 'description' }
    });
  }

  // Highlights & Notas técnicas adicionais em customData
  // full_page_cover NÃO renderiza highlights visualmente: não extrai nós fantasmas de tradução
  const defaultHighlights = [
    'Leve, portátil e de resposta térmica ultrarrápida',
    'Resfria até -25 °C e aquece até 660 °C em poucos minutos',
    'Dois canais de medição para PRT, RTD, termopar e 4-20 mA',
    'Exatidão metrológica com estabilidade térmica de ±0.01 °C',
    'Rotinas automáticas de calibração com emissão de relatórios',
    'Homogeneidade radial e axial certificada conforme normas internacionais'
  ];
  const rawHighlights = block.type === 'full_page_cover' ? [] : block.customData?.highlights;
  const highlights = Array.isArray(rawHighlights)
    ? rawHighlights
    : block.type === 'fluke_header'
    ? defaultHighlights
    : [];

  highlights.forEach((hl: any, idx: number) => {
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

  // Fluke Header: Badge & Subtitle Fallbacks
  if (block.type === 'fluke_header') {
    const badge = typeof block.badgeText === 'string' && block.badgeText.trim() ? block.badgeText.trim() : 'PRESYS';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeText`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: badge,
      kind: 'badge',
      policy: 'protect',
      source: { blockType: block.type, field: 'badgeText' }
    });

    const badgeSecondary = typeof block.customData?.badgeSecondary === 'string' && block.customData.badgeSecondary.trim()
      ? block.customData.badgeSecondary.trim()
      : 'Calibration';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeSecondary`,
      pageId,
      blockId: block.id,
      path: 'customData.badgeSecondary',
      sourceText: badgeSecondary,
      kind: 'badge',
      policy: 'protect',
      source: { blockType: block.type, field: 'badgeSecondary' }
    });
  }

  // Additel Two Col: Overview, Badge Subtitle e Bullets
  if ((block.type as string) === 'additel_two_col' || block.type === 'additel_two_col_hero') {
    const overview = typeof block.customData?.overview === 'string' && block.customData.overview.trim()
      ? block.customData.overview.trim()
      : 'A linha de calibradores automáticos de pressão oferece geração autônoma e medição com exatidão metrológica. Ideal para testes automatizados de transmissores, manômetros e pressostatos em laboratório e campo.';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_overview`,
      pageId,
      blockId: block.id,
      path: 'customData.overview',
      sourceText: overview,
      kind: 'body',
      policy: 'translate',
      source: { blockType: block.type, field: 'overview' }
    });

    const badgeSubtitle = typeof block.customData?.badgeSubtitle === 'string' && block.customData.badgeSubtitle.trim()
      ? block.customData.badgeSubtitle.trim()
      : 'Precision Metrology';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeSubtitle`,
      pageId,
      blockId: block.id,
      path: 'customData.badgeSubtitle',
      sourceText: badgeSubtitle,
      kind: 'badge',
      policy: 'translate',
      source: { blockType: block.type, field: 'badgeSubtitle' }
    });

    const defaultBullets = [
      'Geração de pressão de vácuo a 70 bar com bomba interna',
      'Estabilidade de controle melhor que 0.005% do fundo de escala',
      'Duplo canal de medição de pressão com sensores intercambiáveis'
    ];
    const rawBullets = block.customData?.bulletList || block.customData?.bullets;
    const bulletList = Array.isArray(rawBullets)
      ? rawBullets
      : defaultBullets;

    bulletList.forEach((b: any, idx: number) => {
      if (typeof b === 'string' && b.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_bullet_${idx}`,
          pageId,
          blockId: block.id,
          path: `customData.bulletList[${idx}]`,
          sourceText: b.trim(),
          kind: 'body',
          policy: 'translate',
          source: { blockType: block.type, field: `bulletList[${idx}]` }
        });
      }
    });
  }

  // Contatos em customData (bottom_header)
  if (block.type === 'bottom_header') {
    const badge = typeof block.badgeText === 'string' && block.badgeText.trim() ? block.badgeText.trim() : 'PRESYS METROLOGIA';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeText`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: badge,
      kind: 'badge',
      policy: 'translate',
      source: { blockType: block.type, field: 'badgeText' }
    });
    const phone = typeof block.customData?.phone === 'string' && block.customData.phone.trim() ? block.customData.phone.trim() : '+55 (11) 3038-1300';
    const email = typeof block.customData?.email === 'string' && block.customData.email.trim() ? block.customData.email.trim() : 'vendas@presys.com.br';
    const website = typeof block.customData?.website === 'string' && block.customData.website.trim() ? block.customData.website.trim() : 'www.presys.com.br';

    nodes.push({
      id: `p${pageNumber}_b${block.id}_phone`,
      pageId,
      blockId: block.id,
      path: 'customData.phone',
      sourceText: phone,
      kind: 'contact',
      policy: 'protect',
      source: { blockType: block.type, field: 'phone' }
    });
    nodes.push({
      id: `p${pageNumber}_b${block.id}_email`,
      pageId,
      blockId: block.id,
      path: 'customData.email',
      sourceText: email,
      kind: 'contact',
      policy: 'protect',
      source: { blockType: block.type, field: 'email' }
    });
    nodes.push({
      id: `p${pageNumber}_b${block.id}_website`,
      pageId,
      blockId: block.id,
      path: 'customData.website',
      sourceText: website,
      kind: 'contact',
      policy: 'protect',
      source: { blockType: block.type, field: 'website' }
    });
  }

  return nodes;
}
