import { ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractGalleryBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
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

  if (block.images && Array.isArray(block.images)) {
    block.images.forEach((img, idx) => {
      if (img.caption && img.caption.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_img_${idx}_caption`,
          pageId,
          blockId: block.id,
          path: `images[${idx}].caption`,
          sourceText: img.caption.trim(),
          kind: 'caption',
          policy: 'translate',
          source: { blockType: block.type, field: `images[${idx}].caption` }
        });
      }
    });
  }

  return nodes;
}
