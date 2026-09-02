// src/translation/block-extractors/structural.extractor.ts
// Extrator de Texto Imprimível para Seções Estruturais (Fase 3A.1)
// Garante identidades 100% estáveis desacopladas de páginas e de índices numéricos de array.

import { ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractStructuralBlocks(
  block: ContentBlock,
  pageId: string,
  _pageNumber: number
): PrintableTextNode[] {
  const nodes: PrintableTextNode[] = [];

  if (block.type !== 'structural_section') {
    return nodes;
  }

  // 1. Título da Seção (Reutiliza ContentBlock.title)
  if (typeof block.title === 'string' && block.title.trim()) {
    nodes.push({
      id: `b${block.id}_sec_title`,
      pageId,
      blockId: block.id,
      path: 'title',
      sourceText: block.title.trim(),
      kind: 'heading',
      policy: 'translate',
      source: { blockType: block.type, field: 'title' }
    });
  }

  // 2. Subtítulo da Seção (Reutiliza ContentBlock.subtitle)
  if (typeof block.subtitle === 'string' && block.subtitle.trim()) {
    nodes.push({
      id: `b${block.id}_sec_subtitle`,
      pageId,
      blockId: block.id,
      path: 'subtitle',
      sourceText: block.subtitle.trim(),
      kind: 'body',
      policy: 'translate',
      source: { blockType: block.type, field: 'subtitle' }
    });
  }

  // 3. Badge da Seção (Reutiliza ContentBlock.badgeText)
  if (typeof block.badgeText === 'string' && block.badgeText.trim()) {
    nodes.push({
      id: `b${block.id}_sec_badge`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: block.badgeText.trim(),
      kind: 'badge',
      policy: 'translate',
      source: { blockType: block.type, field: 'badgeText' }
    });
  }

  // 4. Cards Filhos com IDs Estáveis (Desacoplados do Índice)
  const children = block.structuralData?.children;
  if (Array.isArray(children)) {
    children.forEach((child, idx) => {
      if (!child || typeof child !== 'object' || !child.id) return;

      // Badge do Card (se houver)
      if (typeof child.badge === 'string' && child.badge.trim()) {
        nodes.push({
          id: `b${block.id}_card_${child.id}_badge`,
          pageId,
          blockId: block.id,
          path: `structuralData.children[${idx}].badge`,
          sourceText: child.badge.trim(),
          kind: 'badge',
          policy: 'translate',
          source: { blockType: block.type, field: `children[${idx}].badge` }
        });
      }

      // Título do Card
      if (typeof child.title === 'string' && child.title.trim()) {
        nodes.push({
          id: `b${block.id}_card_${child.id}_title`,
          pageId,
          blockId: block.id,
          path: `structuralData.children[${idx}].title`,
          sourceText: child.title.trim(),
          kind: 'heading',
          policy: 'translate',
          source: { blockType: block.type, field: `children[${idx}].title` }
        });
      }

      // Corpo / Descrição do Card
      if (typeof child.body === 'string' && child.body.trim()) {
        nodes.push({
          id: `b${block.id}_card_${child.id}_body`,
          pageId,
          blockId: block.id,
          path: `structuralData.children[${idx}].body`,
          sourceText: child.body.trim(),
          kind: 'body',
          policy: 'translate',
          source: { blockType: block.type, field: `children[${idx}].body` }
        });
      }
    });
  }

  return nodes;
}
