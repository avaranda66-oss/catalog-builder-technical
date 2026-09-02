import { ContentBlock, CanvasLayer } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractHeroBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
  const nodes: PrintableTextNode[] = [];

  if (block.badgeText && block.badgeText.trim()) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeText`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: block.badgeText.trim(),
      kind: 'badge',
      policy: 'translate',
      source: { blockType: block.type, field: 'badgeText' }
    });
  }

  if (block.title && block.title.trim()) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_title`,
      pageId,
      blockId: block.id,
      path: 'title',
      sourceText: block.title.trim(),
      kind: 'heading',
      policy: 'translate',
      source: { blockType: block.type, field: 'title' }
    });
  }

  if (block.subtitle && block.subtitle.trim()) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_subtitle`,
      pageId,
      blockId: block.id,
      path: 'subtitle',
      sourceText: block.subtitle.trim(),
      kind: 'body',
      policy: 'translate',
      source: { blockType: block.type, field: 'subtitle' }
    });
  }

  if (block.imageCaption && block.imageCaption.trim()) {
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
  if (block.type === 'full_page_cover' && block.customData?.canvasLayers && Array.isArray(block.customData.canvasLayers)) {
    block.customData.canvasLayers.forEach((layer: CanvasLayer, idx: number) => {
      if ((layer.type === 'text' || layer.type === 'badge') && layer.content && layer.content.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_layer_${layer.id || idx}`,
          pageId,
          blockId: block.id,
          path: `customData.canvasLayers[${idx}].content`,
          sourceText: layer.content.trim(),
          kind: layer.type === 'badge' ? 'badge' : 'heading',
          policy: 'translate',
          source: { blockType: block.type, field: `canvasLayers[${idx}].content` }
        });
      }
    });
  }

  // Description em customData
  if (block.customData?.description && typeof block.customData.description === 'string' && block.customData.description.trim()) {
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
  const defaultHighlights = [
    'Leve, portátil e de resposta térmica ultrarrápida',
    'Resfria até -25 °C e aquece até 660 °C em poucos minutos',
    'Dois canais de medição para PRT, RTD, termopar e 4-20 mA',
    'Exatidão metrológica com estabilidade térmica de ±0.01 °C',
    'Rotinas automáticas de calibração com emissão de relatórios',
    'Homogeneidade radial e axial certificada conforme normas internacionais'
  ];
  const highlights = block.customData?.highlights || (block.type === 'fluke_header' ? defaultHighlights : undefined);
  if (highlights && Array.isArray(highlights)) {
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
  }

  // Fluke Header: Badge & Subtitle Fallbacks
  if (block.type === 'fluke_header') {
    const badge = block.badgeText || 'PRESYS';
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

    const badgeSecondary = block.customData?.badgeSecondary || 'Calibration';
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
    const overview = block.customData?.overview || 'A linha de calibradores automáticos de pressão oferece geração autônoma e medição com exatidão metrológica. Ideal para testes automatizados de transmissores, manômetros e pressostatos em laboratório e campo.';
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

    const badgeSubtitle = block.customData?.badgeSubtitle || 'Precision Metrology';
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
    const bulletList = block.customData?.bulletList || block.customData?.bullets || defaultBullets;
    bulletList.forEach((b: string, idx: number) => {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_bullet_${idx}`,
        pageId,
        blockId: block.id,
        path: `customData.bulletList[${idx}]`,
        sourceText: b,
        kind: 'body',
        policy: 'translate',
        source: { blockType: block.type, field: `bulletList[${idx}]` }
      });
    });
  }

  // Contatos em customData (bottom_header)
  if (block.type === 'bottom_header') {
    const badge = block.badgeText || 'PRESYS METROLOGIA';
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
    const phone = block.customData?.phone || '+55 (11) 3038-1300';
    const email = block.customData?.email || 'vendas@presys.com.br';
    const website = block.customData?.website || 'www.presys.com.br';

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
