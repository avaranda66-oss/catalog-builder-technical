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

  const company = block.contactInfo?.companyName || 'PRESYS INSTRUMENTOS DE CONTROLE';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_company`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.companyName',
    sourceText: company.trim(),
    kind: 'contact',
    policy: 'translate',
    source: { blockType: block.type, field: 'contactInfo.companyName' }
  });

  const address = block.contactInfo?.address || 'São Paulo - SP · Brasil';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_address`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.address',
    sourceText: address.trim(),
    kind: 'contact',
    policy: 'translate',
    source: { blockType: block.type, field: 'contactInfo.address' }
  });

  const phone = block.contactInfo?.phone || '+55 (11) 3038-1300';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_phone`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.phone',
    sourceText: phone.trim(),
    kind: 'contact',
    policy: 'protect',
    source: { blockType: block.type, field: 'contactInfo.phone' }
  });

  const email = block.contactInfo?.email || 'vendas@presys.com.br';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_email`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.email',
    sourceText: email.trim(),
    kind: 'contact',
    policy: 'protect',
    source: { blockType: block.type, field: 'contactInfo.email' }
  });

  const website = block.contactInfo?.website || 'www.presys.com.br';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_website`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.website',
    sourceText: website.trim(),
    kind: 'contact',
    policy: 'protect',
    source: { blockType: block.type, field: 'contactInfo.website' }
  });

  return nodes;
}
