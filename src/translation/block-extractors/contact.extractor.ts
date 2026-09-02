// src/translation/block-extractors/contact.extractor.ts
// Extrator resiliente e protegido contra formatos legados ou malformados para blocos de Contato / Rodapé.

import { ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractContactBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
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

  const company = typeof block.contactInfo?.companyName === 'string' && block.contactInfo.companyName.trim()
    ? block.contactInfo.companyName.trim()
    : 'PRESYS INSTRUMENTOS DE CONTROLE';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_company`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.companyName',
    sourceText: company,
    kind: 'contact',
    policy: 'translate',
    source: { blockType: block.type, field: 'contactInfo.companyName' }
  });

  const address = typeof block.contactInfo?.address === 'string' && block.contactInfo.address.trim()
    ? block.contactInfo.address.trim()
    : 'São Paulo - SP · Brasil';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_address`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.address',
    sourceText: address,
    kind: 'contact',
    policy: 'translate',
    source: { blockType: block.type, field: 'contactInfo.address' }
  });

  const phone = typeof block.contactInfo?.phone === 'string' && block.contactInfo.phone.trim()
    ? block.contactInfo.phone.trim()
    : '+55 (11) 3038-1300';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_phone`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.phone',
    sourceText: phone,
    kind: 'contact',
    policy: 'protect',
    source: { blockType: block.type, field: 'contactInfo.phone' }
  });

  const email = typeof block.contactInfo?.email === 'string' && block.contactInfo.email.trim()
    ? block.contactInfo.email.trim()
    : 'vendas@presys.com.br';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_email`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.email',
    sourceText: email,
    kind: 'contact',
    policy: 'protect',
    source: { blockType: block.type, field: 'contactInfo.email' }
  });

  const website = typeof block.contactInfo?.website === 'string' && block.contactInfo.website.trim()
    ? block.contactInfo.website.trim()
    : 'www.presys.com.br';
  nodes.push({
    id: `p${pageNumber}_b${block.id}_contact_website`,
    pageId,
    blockId: block.id,
    path: 'contactInfo.website',
    sourceText: website,
    kind: 'contact',
    policy: 'protect',
    source: { blockType: block.type, field: 'contactInfo.website' }
  });

  return nodes;
}
