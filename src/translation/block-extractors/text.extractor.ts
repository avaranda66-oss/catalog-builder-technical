import { ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractTextAndBoxBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
  const nodes: PrintableTextNode[] = [];

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

  if (block.textContent && block.textContent.trim()) {
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
