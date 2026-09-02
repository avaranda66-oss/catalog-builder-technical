import { ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractContactBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
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

  if (block.contactInfo?.companyName && block.contactInfo.companyName.trim()) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_contact_company`,
      pageId,
      blockId: block.id,
      path: 'contactInfo.companyName',
      sourceText: block.contactInfo.companyName.trim(),
      kind: 'contact',
      policy: 'translate',
      source: { blockType: block.type, field: 'contactInfo.companyName' }
    });
  }

  if (block.contactInfo?.address && block.contactInfo.address.trim()) {
    nodes.push({
      id: `p${pageNumber}_b${block.id}_contact_address`,
      pageId,
      blockId: block.id,
      path: 'contactInfo.address',
      sourceText: block.contactInfo.address.trim(),
      kind: 'contact',
      policy: 'translate',
      source: { blockType: block.type, field: 'contactInfo.address' }
    });
  }

  return nodes;
}
