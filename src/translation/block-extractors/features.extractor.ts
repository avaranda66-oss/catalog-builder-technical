// src/translation/block-extractors/features.extractor.ts
// Extrator resiliente e protegido contra formatos legados ou malformados para blocos Features, Inserts, Software Connectivity e Multi-Mode.

import { ContentBlock, FeatureItem } from '@/domain/catalog.schema';
import {
  CalibratorModeItem,
  SoftwareConnectivityItem,
  getEffectiveModeDesc
} from '@/domain/composite-content.engine';
import { PrintableTextNode } from '../types';

export function extractFeaturesBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
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

  if (Array.isArray(block.features)) {
    block.features.forEach((feat: FeatureItem, idx: number) => {
      if (feat && typeof feat === 'object') {
        if (typeof feat.title === 'string' && feat.title.trim()) {
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

        if (typeof feat.description === 'string' && feat.description.trim()) {
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
      }
    });
  }

  // Inserts Visual: Legendas, Códigos, Títulos e Tabela de Insertos
  if (block.type === 'inserts_visual') {
    if (typeof block.badgeText === 'string' && block.badgeText.trim()) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_badgeText`,
        pageId,
        blockId: block.id,
        path: 'badgeText',
        sourceText: block.badgeText.trim(),
        kind: 'badge',
        policy: 'protect',
        source: { blockType: block.type, field: 'badgeText' }
      });
    }

    const diameter = typeof block.customData?.diameter === 'string' && block.customData.diameter.trim()
      ? block.customData.diameter.trim()
      : 'Outer Diameter: Ø 32mm / Ø 35mm';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_diameter`,
      pageId,
      blockId: block.id,
      path: 'customData.diameter',
      sourceText: diameter,
      kind: 'legend',
      policy: 'protect',
      source: { blockType: block.type, field: 'diameter' }
    });

    if (Array.isArray(block.customData?.inserts)) {
      block.customData.inserts.forEach((ins: any, idx: number) => {
        if (ins && typeof ins === 'object') {
          if (ins.code !== undefined && String(ins.code).trim()) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_insert_${idx}_code`,
              pageId,
              blockId: block.id,
              path: `customData.inserts[${idx}].code`,
              sourceText: String(ins.code).trim(),
              kind: 'ordering_description',
              policy: 'protect',
              source: { blockType: block.type, field: `inserts[${idx}].code` }
            });
          }
          if (ins.title !== undefined && String(ins.title).trim()) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_insert_${idx}_title`,
              pageId,
              blockId: block.id,
              path: `customData.inserts[${idx}].title`,
              sourceText: String(ins.title).trim(),
              kind: 'heading',
              policy: 'translate',
              source: { blockType: block.type, field: `inserts[${idx}].title` }
            });
          }
          if (ins.label !== undefined && String(ins.label).trim()) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_insert_${idx}_label`,
              pageId,
              blockId: block.id,
              path: `customData.inserts[${idx}].label`,
              sourceText: String(ins.label).trim(),
              kind: 'legend',
              policy: 'translate',
              renderExpectation: 'optional',
              source: { blockType: block.type, field: `inserts[${idx}].label` }
            });
          }
          if (ins.description !== undefined && String(ins.description).trim()) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_insert_${idx}_desc`,
              pageId,
              blockId: block.id,
              path: `customData.inserts[${idx}].description`,
              sourceText: String(ins.description).trim(),
              kind: 'body',
              policy: 'translate',
              renderExpectation: 'optional',
              source: { blockType: block.type, field: `inserts[${idx}].description` }
            });
          }
        }
      });
    }

    const defaultTableCols = ['TA-25N / 35N / 50N', 'TA-350P / 650P', 'TA-1200P'];
    const rawTableCols = block.customData?.tableColumns;
    const tableColumns = Array.isArray(rawTableCols) ? rawTableCols : defaultTableCols;

    tableColumns.forEach((col: any, cIdx: number) => {
      if (col !== undefined && String(col).trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_table_col_${cIdx}`,
          pageId,
          blockId: block.id,
          path: `customData.tableColumns[${cIdx}]`,
          sourceText: String(col).trim(),
          kind: 'table_header',
          policy: 'protect',
          source: { blockType: block.type, field: `tableColumns[${cIdx}]` }
        });
      }
    });

    const defaultTableRows = [
      { code: 'IN1P', holesDesc: '1 × 3mm, 1 × 6mm, 1 × 1/4", 1 × 8mm', models: { 'TA-25N / 35N / 50N': '06.04.0121-00', 'TA-350P / 650P': '06.04.0128-00', 'TA-1200P': '06.04.0156-00' } },
      { code: 'IN1A', holesDesc: '1 × 1/8", 1 × 3/16", 2 × 1/4", 1 × 3/8"', models: { 'TA-25N / 35N / 50N': '06.04.0122-00', 'TA-350P / 650P': '06.04.0129-00', 'TA-1200P': '06.04.0157-00' } },
      { code: 'IN01', holesDesc: '1 × 3/4" (Centered Hole)', models: { 'TA-25N / 35N / 50N': '06.04.0011-00', 'TA-350P / 650P': '06.04.0101-00', 'TA-1200P': '06.04.0031-00' } },
      { code: 'INCL', holesDesc: 'Cup Type Insert with steel micro-spheres', models: { 'TA-25N / 35N / 50N': '06.04.0086-00', 'TA-350P / 650P': '06.04.0099-00', 'TA-1200P': '—' } }
    ];
    const rawTableRows = block.customData?.tableRows;
    const tableRows = Array.isArray(rawTableRows) ? rawTableRows : defaultTableRows;

    tableRows.forEach((row: any, rIdx: number) => {
      if (row && typeof row === 'object') {
        if (row.code !== undefined && String(row.code).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_table_r${rIdx}_code`,
            pageId,
            blockId: block.id,
            path: `customData.tableRows[${rIdx}].code`,
            sourceText: String(row.code).trim(),
            kind: 'ordering_description',
            policy: 'protect',
            source: { blockType: block.type, field: `tableRows[${rIdx}].code` }
          });
        }
        if (row.holesDesc !== undefined && String(row.holesDesc).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_table_r${rIdx}_desc`,
            pageId,
            blockId: block.id,
            path: `customData.tableRows[${rIdx}].holesDesc`,
            sourceText: String(row.holesDesc).trim(),
            kind: 'table_cell',
            policy: 'translate',
            source: { blockType: block.type, field: `tableRows[${rIdx}].holesDesc` }
          });
        }
        if (row.models && typeof row.models === 'object' && !Array.isArray(row.models)) {
          Object.entries(row.models).forEach(([col, val]: [string, any], cIdx: number) => {
            if (val !== undefined && String(val).trim()) {
              nodes.push({
                id: `p${pageNumber}_b${block.id}_table_r${rIdx}_c${cIdx}`,
                pageId,
                blockId: block.id,
                path: `customData.tableRows[${rIdx}].models.${col}`,
                sourceText: String(val).trim(),
                kind: 'table_cell',
                policy: 'protect',
                source: { blockType: block.type, field: `tableRows[${rIdx}].models.${col}` }
              });
            }
          });
        }
      }
    });
  }

  // Software Connectivity: Título, Badge e Itens de Conectividade
  if (block.type === 'software_connectivity') {
    if (typeof block.badgeText === 'string' && block.badgeText.trim().length > 0) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_badgeText`,
        pageId,
        blockId: block.id,
        path: 'badgeText',
        sourceText: block.badgeText.trim(),
        kind: 'badge',
        policy: 'translate',
        source: { blockType: block.type, field: 'badgeText' }
      });
    }

    if (Array.isArray(block.customData?.items)) {
      block.customData.items.forEach((item: SoftwareConnectivityItem, idx: number) => {
        if (item && typeof item === 'object') {
          if (typeof item.badge === 'string' && item.badge.trim().length > 0) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_item_${idx}_badge`,
              pageId,
              blockId: block.id,
              path: `customData.items[${idx}].badge`,
              sourceText: item.badge.trim(),
              kind: 'badge',
              policy: 'translate',
              source: { blockType: block.type, field: `items[${idx}].badge` }
            });
          }
          if (typeof item.title === 'string' && item.title.trim().length > 0) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_item_${idx}_title`,
              pageId,
              blockId: block.id,
              path: `customData.items[${idx}].title`,
              sourceText: item.title.trim(),
              kind: 'heading',
              policy: 'translate',
              source: { blockType: block.type, field: `items[${idx}].title` }
            });
          }
          if (typeof item.desc === 'string' && item.desc.trim().length > 0) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_item_${idx}_desc`,
              pageId,
              blockId: block.id,
              path: `customData.items[${idx}].desc`,
              sourceText: item.desc.trim(),
              kind: 'body',
              policy: 'translate',
              source: { blockType: block.type, field: `items[${idx}].desc` }
            });
          }
        }
      });
    }
  }

  // Multi Mode Calibrator: Títulos e descrições dos modos operacionais
  if (block.type === 'multi_mode_calibrator') {
    if (typeof block.badgeText === 'string' && block.badgeText.trim().length > 0) {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_badgeText`,
        pageId,
        blockId: block.id,
        path: 'badgeText',
        sourceText: block.badgeText.trim(),
        kind: 'badge',
        policy: 'translate',
        source: { blockType: block.type, field: 'badgeText' }
      });
    }

    if (Array.isArray(block.customData?.modes)) {
      block.customData.modes.forEach((mode: CalibratorModeItem, idx: number) => {
        if (mode && typeof mode === 'object') {
          const modeId = mode.id || String(idx);

          if (typeof mode.badge === 'string' && mode.badge.trim().length > 0) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_mode_${modeId}_badge`,
              pageId,
              blockId: block.id,
              path: `customData.modes[${idx}].badge`,
              sourceText: mode.badge.trim(),
              kind: 'badge',
              policy: 'protect',
              source: { blockType: block.type, field: `modes[${idx}].badge` }
            });
          }

          if (typeof mode.title === 'string' && mode.title.trim().length > 0) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_mode_${modeId}_title`,
              pageId,
              blockId: block.id,
              path: `customData.modes[${idx}].title`,
              sourceText: mode.title.trim(),
              kind: 'heading',
              policy: 'translate',
              source: { blockType: block.type, field: `modes[${idx}].title` }
            });
          }

          const desc = getEffectiveModeDesc(mode);
          if (desc.trim().length > 0) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_mode_${modeId}_desc`,
              pageId,
              blockId: block.id,
              path: `customData.modes[${idx}].desc`,
              sourceText: desc.trim(),
              kind: 'body',
              policy: 'translate',
              source: { blockType: block.type, field: `modes[${idx}].desc` }
            });
          }
        }
      });
    }
  }

  return nodes;
}
