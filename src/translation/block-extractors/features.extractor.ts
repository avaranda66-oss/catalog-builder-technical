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

  // Inserts Visual: Legendas, Códigos, Títulos e Tabela de Insertos
  if (block.type === 'inserts_visual') {
    if (block.badgeText && block.badgeText.trim()) {
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

    const diameter = block.customData?.diameter || 'Outer Diameter: Ø 32mm / Ø 35mm';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_diameter`,
      pageId,
      blockId: block.id,
      path: 'customData.diameter',
      sourceText: String(diameter).trim(),
      kind: 'legend',
      policy: 'protect',
      source: { blockType: block.type, field: 'diameter' }
    });

    if (block.customData?.inserts && Array.isArray(block.customData.inserts)) {
      block.customData.inserts.forEach((ins: any, idx: number) => {
        if (ins.code && String(ins.code).trim()) {
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
        if (ins.title && String(ins.title).trim()) {
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

    const defaultTableCols = ['TA-25N / 35N / 50N', 'TA-350P / 650P', 'TA-1200P'];
    const tableColumns = block.customData?.tableColumns || defaultTableCols;
    tableColumns.forEach((col: string, cIdx: number) => {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_table_col_${cIdx}`,
        pageId,
        blockId: block.id,
        path: `customData.tableColumns[${cIdx}]`,
        sourceText: col,
        kind: 'table_header',
        policy: 'protect',
        source: { blockType: block.type, field: `tableColumns[${cIdx}]` }
      });
    });

    // Tabela técnica interna de insertos (se houver linhas customizadas ou padrão)
    const defaultTableRows = [
      { code: 'IN1P', holesDesc: '1 × 3mm, 1 × 6mm, 1 × 1/4", 1 × 8mm', models: { 'TA-25N / 35N / 50N': '06.04.0121-00', 'TA-350P / 650P': '06.04.0128-00', 'TA-1200P': '06.04.0156-00' } },
      { code: 'IN1A', holesDesc: '1 × 1/8", 1 × 3/16", 2 × 1/4", 1 × 3/8"', models: { 'TA-25N / 35N / 50N': '06.04.0122-00', 'TA-350P / 650P': '06.04.0129-00', 'TA-1200P': '06.04.0157-00' } },
      { code: 'IN01', holesDesc: '1 × 3/4" (Centered Hole)', models: { 'TA-25N / 35N / 50N': '06.04.0011-00', 'TA-350P / 650P': '06.04.0101-00', 'TA-1200P': '06.04.0031-00' } },
      { code: 'INCL', holesDesc: 'Cup Type Insert with steel micro-spheres', models: { 'TA-25N / 35N / 50N': '06.04.0086-00', 'TA-350P / 650P': '06.04.0099-00', 'TA-1200P': '—' } }
    ];
    const tableRows = block.customData?.tableRows || defaultTableRows;
    tableRows.forEach((row: any, rIdx: number) => {
      nodes.push({
        id: `p${pageNumber}_b${block.id}_table_r${rIdx}_code`,
        pageId,
        blockId: block.id,
        path: `customData.tableRows[${rIdx}].code`,
        sourceText: row.code,
        kind: 'ordering_description',
        policy: 'protect',
        source: { blockType: block.type, field: `tableRows[${rIdx}].code` }
      });
      nodes.push({
        id: `p${pageNumber}_b${block.id}_table_r${rIdx}_desc`,
        pageId,
        blockId: block.id,
        path: `customData.tableRows[${rIdx}].holesDesc`,
        sourceText: row.holesDesc,
        kind: 'table_cell',
        policy: 'translate',
        source: { blockType: block.type, field: `tableRows[${rIdx}].holesDesc` }
      });
      if (row.models) {
        Object.entries(row.models).forEach(([col, val]: [string, any], cIdx: number) => {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_table_r${rIdx}_c${cIdx}`,
            pageId,
            blockId: block.id,
            path: `customData.tableRows[${rIdx}].models.${col}`,
            sourceText: String(val),
            kind: 'table_cell',
            policy: 'protect',
            source: { blockType: block.type, field: `tableRows[${rIdx}].models.${col}` }
          });
        });
      }
    });
  }

  // Software Connectivity: Título, Badge e Itens de Conectividade
  if (block.type === 'software_connectivity') {
    const badge = block.badgeText || 'Digital Factory 4.0';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeText`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: badge.trim(),
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
    const items = block.customData?.items || defaultItems;
    items.forEach((item: any, idx: number) => {
      if (item.badge && String(item.badge).trim()) {
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
      if (item.title && String(item.title).trim()) {
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
      if (item.desc && String(item.desc).trim()) {
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
    });
  }

  // Multi Mode Calibrator: Títulos e descrições dos modos operacionais
  if (block.type === 'multi_mode_calibrator') {
    const badge = block.badgeText || 'Multifunctional Series';
    nodes.push({
      id: `p${pageNumber}_b${block.id}_badgeText`,
      pageId,
      blockId: block.id,
      path: 'badgeText',
      sourceText: badge.trim(),
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
    const modes = block.customData?.modes || defaultModes;
    modes.forEach((mode: any, idx: number) => {
      const modeBadge = mode.badge || String(idx + 1).padStart(2, '0');
      nodes.push({
        id: `p${pageNumber}_b${block.id}_mode_${idx}_badge`,
        pageId,
        blockId: block.id,
        path: `customData.modes[${idx}].badge`,
        sourceText: String(modeBadge).trim(),
        kind: 'badge',
        policy: 'protect',
        source: { blockType: block.type, field: `modes[${idx}].badge` }
      });

      if (mode.title) {
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
      if (mode.desc || mode.description) {
        const desc = mode.desc || mode.description;
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
    });
  }

  return nodes;
}
