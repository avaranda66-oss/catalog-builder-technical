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

  // Highlights & Notas técnicas adicionais em customData
  if (block.customData?.highlights && Array.isArray(block.customData.highlights)) {
    block.customData.highlights.forEach((hl: string, idx: number) => {
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

  return nodes;
}
