// src/translation/block-extractors/gallery.extractor.ts
// Extrator resiliente e protegido contra formatos legados ou malformados para blocos de Imagem e Galeria.

import { ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractGalleryBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
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

  if (Array.isArray(block.images)) {
    block.images.forEach((img: any, idx: number) => {
      if (img && typeof img === 'object' && typeof img.caption === 'string' && img.caption.trim()) {
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
