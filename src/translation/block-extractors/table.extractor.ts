import { ContentBlock, TableColumnConfig, CatalogTableRow } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractTableBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
  const nodes: PrintableTextNode[] = [];

  // Título do Bloco de Tabela
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

  // Cabeçalhos e Linhas Derivados de customData (se presentes)
  const customHeaders: string[] | undefined = block.customData?.headers;
  const customRows: string[][] | undefined = block.customData?.rows;

  const derivedCols: TableColumnConfig[] | undefined = customHeaders
    ? customHeaders.map((h, i) => ({ key: `col${i + 1}`, label: h, visible: true }))
    : undefined;

  const derivedRows: CatalogTableRow[] | undefined = customRows
    ? customRows.map((r, rIdx) => ({
        id: `crow-${rIdx + 1}`,
        order: rIdx,
        localOverrides: r.reduce((acc, cell, cIdx) => ({ ...acc, [`col${cIdx + 1}`]: cell }), {})
      }))
    : undefined;

  // Cabeçalhos de Colunas (Labels exibidos no PDF)
  const defaultColsByBlockType: Record<string, any[]> = {
    custom_table: [
      { key: 'col1', label: 'Item / Parâmetro' },
      { key: 'col2', label: 'Descrição / Especificação' }
    ]
  };
  const defaultRowsByBlockType: Record<string, any[]> = {
    custom_table: [
      { id: 'crow-1', localOverrides: { col1: 'Temperatura de Operação', col2: '-40 a +85 °C' } },
      { id: 'crow-2', localOverrides: { col1: 'Grau de Proteção', col2: 'IP67 / NEMA 4X' } },
      { id: 'crow-3', localOverrides: { col1: 'Tempo de Resposta', col2: '< 100 ms' } }
    ]
  };

  const columns = block.tableColumns || derivedCols || defaultColsByBlockType[block.type];
  if (columns && Array.isArray(columns)) {
    columns.forEach((col: TableColumnConfig, idx: number) => {
      if (col.label && col.label.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_col_${col.key || idx}_label`,
          pageId,
          blockId: block.id,
          path: `tableColumns[${idx}].label`,
          sourceText: col.label.trim(),
          kind: 'table_header',
          policy: 'translate',
          source: { blockType: block.type, field: `col_${col.key || idx}_label` }
        });
      }
    });
  }

  // Linhas da Tabela: customNotes e localOverrides textuais
  const rows = block.tableRows || derivedRows || defaultRowsByBlockType[block.type];
  if (rows && Array.isArray(rows)) {
    rows.forEach((row: CatalogTableRow, rIdx: number) => {
      // Notas customizadas da linha
      if (row.customNotes && row.customNotes.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_row_${row.id || rIdx}_notes`,
          pageId,
          blockId: block.id,
          path: `tableRows[${rIdx}].customNotes`,
          sourceText: row.customNotes.trim(),
          kind: 'table_cell',
          policy: 'translate',
          source: { blockType: block.type, field: `tableRows[${rIdx}].customNotes` }
        });
      }

      // Overrides locais específicos da linha
      if (row.localOverrides && typeof row.localOverrides === 'object') {
        Object.entries(row.localOverrides).forEach(([key, val]) => {
          if (typeof val === 'string' && val.trim() && !key.endsWith('Id') && !key.endsWith('id')) {
            nodes.push({
              id: `p${pageNumber}_b${block.id}_row_${row.id || rIdx}_ov_${key}`,
              pageId,
              blockId: block.id,
              path: `tableRows[${rIdx}].localOverrides.${key}`,
              sourceText: val.trim(),
              kind: 'table_cell',
              policy: 'translate',
              source: { blockType: block.type, field: `row_${row.id || rIdx}_ov_${key}` }
            });
          }
        });
      }
    });
  }

  // Matrix Spec Table: colunas, linhas, seções e cabeçalhos em customData
  if (block.type === 'matrix_spec_table') {
    const custom = block.customData || {};
    const defaultCols = ['Parâmetro / Modelo', 'PCON-Y18-LP', 'PCON-Y18', 'PCON-Y18-HP'];
    const columns = custom.columns || defaultCols;
    columns.forEach((col: string, idx: number) => {
      if (typeof col === 'string' && col.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_col_${idx}`,
          pageId,
          blockId: block.id,
          path: `customData.columns[${idx}]`,
          sourceText: col.trim(),
          kind: 'table_header',
          policy: 'protect',
          source: { blockType: block.type, field: `columns[${idx}]` }
        });
      }
    });

    const defaultRows = [
      { param: 'Faixa de Geração Pneumática', values: ['-0.9 a 2.5 bar', '-0.9 a 40 bar', '0 a 70 bar'] },
      { param: 'Exatidão Padrão (% FE)', values: ['±0.025% FE', '±0.025% FE', '±0.025% FE'] },
      { param: 'Estabilidade de Controle', values: ['< 0.003% FE', '< 0.003% FE', '< 0.005% FE'] },
      { param: 'Bomba Elétrica Integrada', values: ['■', '■', '■'] },
      { param: 'Alimentação de Loop 24Vdc Isolada', values: ['■', '■', '■'] },
      { param: 'Comunicação HART / Modbus', values: ['■', '■', '□'] }
    ];
    const rows = custom.rows || defaultRows;
    rows.forEach((row: any, rIdx: number) => {
      if (row.param && typeof row.param === 'string' && row.param.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_row_${rIdx}_param`,
          pageId,
          blockId: block.id,
          path: `customData.rows[${rIdx}].param`,
          sourceText: row.param.trim(),
          kind: 'table_cell',
          policy: 'translate',
          source: { blockType: block.type, field: `rows[${rIdx}].param` }
        });
      }
      if (Array.isArray(row.values)) {
        row.values.forEach((val: string, vIdx: number) => {
          if (typeof val === 'string' && val.trim()) {
            const isBullet = ['■', '□', '—', '-', '•'].includes(val.trim());
            nodes.push({
              id: `p${pageNumber}_b${block.id}_row_${rIdx}_val_${vIdx}`,
              pageId,
              blockId: block.id,
              path: `customData.rows[${rIdx}].values[${vIdx}]`,
              sourceText: val.trim(),
              kind: 'table_cell',
              policy: 'protect',
              renderExpectation: isBullet ? 'optional' : 'required',
              source: { blockType: block.type, field: `rows[${rIdx}].values[${vIdx}]` }
            });
          }
        });
      }
    });

    if (custom.sections && Array.isArray(custom.sections)) {
      custom.sections.forEach((sec: any, sIdx: number) => {
        if (sec.title && String(sec.title).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_sec_${sIdx}_title`,
            pageId,
            blockId: block.id,
            path: `customData.sections[${sIdx}].title`,
            sourceText: String(sec.title).trim(),
            kind: 'heading',
            policy: 'translate',
            renderExpectation: 'optional',
            source: { blockType: block.type, field: `sections[${sIdx}].title` }
          });
        }
      });
    }
  }

  return nodes;
}
