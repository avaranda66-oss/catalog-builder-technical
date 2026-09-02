import { ContentBlock, OrderingSegment } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractOrderingBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
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

  if (block.orderingSegments && Array.isArray(block.orderingSegments)) {
    block.orderingSegments.forEach((seg: OrderingSegment, idx: number) => {
      if (seg.name && seg.name.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_seg_${seg.id || idx}_name`,
          pageId,
          blockId: block.id,
          path: `orderingSegments[${idx}].name`,
          sourceText: seg.name.trim(),
          kind: 'ordering_description',
          policy: 'translate',
          source: { blockType: block.type, field: `orderingSegments[${idx}].name` }
        });
      }

      if (seg.options && Array.isArray(seg.options)) {
        seg.options.forEach((opt: string, optIdx: number) => {
          if (typeof opt === 'string' && opt.trim()) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_seg_${seg.id || idx}_opt_${optIdx}`,
              pageId,
              blockId: block.id,
              path: `orderingSegments[${idx}].options[${optIdx}]`,
              sourceText: opt.trim(),
              kind: 'ordering_description',
              policy: 'translate',
              source: { blockType: block.type, field: `orderingSegments[${idx}].options[${optIdx}]` }
            });
          }
        });
      }
    });
  }

  return nodes;
}
