import { ContentBlock, FeatureItem } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractFeaturesBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
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

  if (block.features && Array.isArray(block.features)) {
    block.features.forEach((feat: FeatureItem, idx: number) => {
      if (feat.title && feat.title.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_feat_${feat.id || idx}_title`,
          pageId,
          blockId: block.id,
          path: `features[${idx}].title`,
          sourceText: feat.title.trim(),
          kind: 'heading',
          policy: 'translate',
          source: { blockType: block.type, field: `features[${idx}].title` }
        });
      }

      if (feat.description && feat.description.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_feat_${feat.id || idx}_desc`,
          pageId,
          blockId: block.id,
          path: `features[${idx}].description`,
          sourceText: feat.description.trim(),
          kind: 'body',
          policy: 'translate',
          source: { blockType: block.type, field: `features[${idx}].description` }
        });
      }
    });
  }

  // Inserts Visual: Legendas e Descrições de Blocos de Inserção
  if (block.type === 'inserts_visual' && block.customData?.inserts && Array.isArray(block.customData.inserts)) {
    block.customData.inserts.forEach((ins: any, idx: number) => {
      if (ins.label && String(ins.label).trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_insert_${idx}_label`,
          pageId,
          blockId: block.id,
          path: `customData.inserts[${idx}].label`,
          sourceText: String(ins.label).trim(),
          kind: 'legend',
          policy: 'translate',
          source: { blockType: block.type, field: `inserts[${idx}].label` }
        });
      }
      if (ins.description && String(ins.description).trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_insert_${idx}_desc`,
          pageId,
          blockId: block.id,
          path: `customData.inserts[${idx}].description`,
          sourceText: String(ins.description).trim(),
          kind: 'body',
          policy: 'translate',
          source: { blockType: block.type, field: `inserts[${idx}].description` }
        });
      }
    });
  }

  // Multi Mode Calibrator: Títulos e descrições dos modos operacionais
  if (block.type === 'multi_mode_calibrator' && block.customData?.modes && Array.isArray(block.customData.modes)) {
    block.customData.modes.forEach((mode: any, idx: number) => {
      if (mode.title && String(mode.title).trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_mode_${idx}_title`,
          pageId,
          blockId: block.id,
          path: `customData.modes[${idx}].title`,
          sourceText: String(mode.title).trim(),
          kind: 'heading',
          policy: 'translate',
          source: { blockType: block.type, field: `modes[${idx}].title` }
        });
      }
      if (mode.description && String(mode.description).trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_mode_${idx}_desc`,
          pageId,
          blockId: block.id,
          path: `customData.modes[${idx}].description`,
          sourceText: String(mode.description).trim(),
          kind: 'body',
          policy: 'translate',
          source: { blockType: block.type, field: `modes[${idx}].description` }
        });
      }
    });
  }

  return nodes;
}
