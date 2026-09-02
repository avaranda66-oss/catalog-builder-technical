// src/translation/block-extractors/text.extractor.ts
// Extrator resiliente e protegido contra formatos legados ou malformados para blocos de Texto e Caixa (Box).

import { ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractTextAndBoxBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
  const nodes: PrintableTextNode[] = [];
  if (!block || typeof block !== 'object') return nodes;

  if (typeof block.title === 'string' && block.title.trim()) {
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

  if (typeof block.textContent === 'string' && block.textContent.trim()) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_textContent`,
      pageId,
      blockId: block.id,
      path: 'textContent',
      sourceText: block.textContent.trim(),
      kind: 'body',
      policy: 'translate',
      source: { blockType: block.type, field: 'textContent' }
    });
  }

  return nodes;
}
