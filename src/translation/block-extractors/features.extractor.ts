// src/translation/block-extractors/features.extractor.ts
// Extrator resiliente e protegido contra formatos legados ou malformados para blocos Features, Inserts, Software Connectivity e Multi-Mode.

import { ContentBlock, FeatureItem } from '@/domain/catalog.schema';
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
    const badge = typeof block.badgeText === 'string' && block.badgeText.trim() ? block.badgeText.trim() : 'Digital Factory 4.0';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeText`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: badge,
      kind: 'badge',
      policy: 'translate',
      source: { blockType: block.type, field: 'badgeText' }
    });

    const defaultItems = [
      { badge: 'Software', title: 'Software ISOPLAN®', desc: 'Integração direta para emissão automatizada de certificados de calibração RBC e relatórios de conformidade.' },
      { badge: 'Protocolos', title: 'Comunicação HART® & Modbus', desc: 'Configuração de transmissores inteligentes com leitura de PV, loop de corrente e ajuste de zero/span.' },
      { badge: 'Hardware', title: 'Conexão USB & Ethernet', desc: 'Exportação de dados em tempo real para SCADA, CLP ou pendrive em formato CSV e PDF criptografado.' },
      { badge: 'Memória', title: 'Datalogger Interno', desc: 'Memória para mais de 100.000 pontos com gravação de tendências e rastreabilidade total.' }
    ];
    const rawItems = block.customData?.items;
    const items = Array.isArray(rawItems) ? rawItems : defaultItems;

    items.forEach((item: any, idx: number) => {
      if (item && typeof item === 'object') {
        if (item.badge !== undefined && String(item.badge).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_item_${idx}_badge`,
            pageId,
            blockId: block.id,
            path: `customData.items[${idx}].badge`,
            sourceText: String(item.badge).trim(),
            kind: 'badge',
            policy: 'translate',
            source: { blockType: block.type, field: `items[${idx}].badge` }
          });
        }
        if (item.title !== undefined && String(item.title).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_item_${idx}_title`,
            pageId,
            blockId: block.id,
            path: `customData.items[${idx}].title`,
            sourceText: String(item.title).trim(),
            kind: 'heading',
            policy: 'translate',
            source: { blockType: block.type, field: `items[${idx}].title` }
          });
        }
        if (item.desc !== undefined && String(item.desc).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_item_${idx}_desc`,
            pageId,
            blockId: block.id,
            path: `customData.items[${idx}].desc`,
            sourceText: String(item.desc).trim(),
            kind: 'body',
            policy: 'translate',
            source: { blockType: block.type, field: `items[${idx}].desc` }
          });
        }
      }
    });
  }

  // Multi Mode Calibrator: Títulos e descrições dos modos operacionais
  if (block.type === 'multi_mode_calibrator') {
    const badge = typeof block.badgeText === 'string' && block.badgeText.trim() ? block.badgeText.trim() : 'Multifunctional Series';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeText`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: badge,
      kind: 'badge',
      policy: 'translate',
      source: { blockType: block.type, field: 'badgeText' }
    });

    const defaultModes = [
      { badge: '01', title: 'Dry Block', desc: 'Calibração rápida em bloco seco para termopares e termorresistências.' },
      { badge: '02', title: 'Banho de Óleo Agitado', desc: 'Uniformidade térmica máxima com fluído térmico recirculado.' },
      { badge: '03', title: 'Corpo Negro Infravermelho', desc: 'Emissividade e alvo calibrado para termômetros IR e pirômetros ópticos.' },
      { badge: '04', title: 'Calibração de Superfície', desc: 'Bloco de contato planar para sensores de superfície.' }
    ];
    const rawModes = block.customData?.modes;
    const modes = Array.isArray(rawModes) ? rawModes : defaultModes;

    modes.forEach((mode: any, idx: number) => {
      if (mode && typeof mode === 'object') {
        const modeBadge = mode.badge !== undefined ? String(mode.badge).trim() : String(idx + 1).padStart(2, '0');
        nodes.push({
          id: `p${pageNumber}_b${block.id}_mode_${idx}_badge`,
          pageId,
          blockId: block.id,
          path: `customData.modes[${idx}].badge`,
          sourceText: modeBadge,
          kind: 'badge',
          policy: 'protect',
          source: { blockType: block.type, field: `modes[${idx}].badge` }
        });

        if (mode.title !== undefined && String(mode.title).trim()) {
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
        const desc = mode.desc !== undefined ? mode.desc : mode.description;
        if (desc !== undefined && String(desc).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_mode_${idx}_desc`,
            pageId,
            blockId: block.id,
            path: `customData.modes[${idx}].description`,
            sourceText: String(desc).trim(),
            kind: 'body',
            policy: 'translate',
            source: { blockType: block.type, field: `modes[${idx}].description` }
          });
        }
      }
    });
  }

  return nodes;
}
