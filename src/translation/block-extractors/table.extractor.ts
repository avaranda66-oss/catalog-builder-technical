// src/translation/block-extractors/table.extractor.ts
// Extrator resiliente e protegido contra formatos legados ou malformados para tabelas técnicas, customizadas e matrizes.

import { ContentBlock, TableColumnConfig, CatalogTableRow } from '@/domain/catalog.schema';
import { PrintableTextNode } from '../types';

export function extractTableBlocks(block: ContentBlock, pageId: string, pageNumber: number): PrintableTextNode[] {
  const nodes: PrintableTextNode[] = [];
  if (!block || typeof block !== 'object') return nodes;

  // Título do Bloco de Tabela
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

  // Cabeçalhos e Linhas Derivados de customData (se presentes como arrays válidos)
  const customHeaders: any = Array.isArray(block.customData?.headers) ? block.customData.headers : undefined;
  const customRows: any = Array.isArray(block.customData?.rows) ? block.customData.rows : undefined;

  const derivedCols: TableColumnConfig[] | undefined = customHeaders
    ? customHeaders.map((h: any, i: number) => ({ key: `col${i + 1}`, label: String(h), visible: true }))
    : undefined;

  const derivedRows: CatalogTableRow[] | undefined = customRows
    ? customRows.map((r: any, rIdx: number) => ({
        id: `crow-${rIdx + 1}`,
        order: rIdx,
        localOverrides: Array.isArray(r)
          ? r.reduce((acc: any, cell: any, cIdx: number) => ({ ...acc, [`col${cIdx + 1}`]: String(cell) }), {})
          : {}
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

  const rawCols = block.tableColumns || derivedCols || defaultColsByBlockType[block.type];
  const columns = Array.isArray(rawCols) ? rawCols : [];

  columns.forEach((col: TableColumnConfig, idx: number) => {
    if (col && typeof col === 'object' && typeof col.label === 'string' && col.label.trim()) {
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

  // Linhas da Tabela: customNotes e localOverrides textuais
  const rawRows = block.tableRows || derivedRows || defaultRowsByBlockType[block.type];
  const rows = Array.isArray(rawRows) ? rawRows : [];

  rows.forEach((row: CatalogTableRow, rIdx: number) => {
    if (row && typeof row === 'object') {
      // Notas customizadas da linha
      if (typeof row.customNotes === 'string' && row.customNotes.trim()) {
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
      if (row.localOverrides && typeof row.localOverrides === 'object' && !Array.isArray(row.localOverrides)) {
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
    }
  });

  // Matrix Spec Table: colunas, linhas, seções e cabeçalhos em customData
  if (block.type === 'matrix_spec_table') {
    const custom = (block.customData && typeof block.customData === 'object') ? block.customData : {};
    const defaultCols = ['Parâmetro / Modelo', 'PCON-Y18-LP', 'PCON-Y18', 'PCON-Y18-HP'];
    const rawMatrixCols = custom.columns;
    const matrixCols = Array.isArray(rawMatrixCols) ? rawMatrixCols : defaultCols;

    matrixCols.forEach((col: any, idx: number) => {
      if (col !== undefined && String(col).trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_col_${idx}`,
          pageId,
          blockId: block.id,
          path: `customData.columns[${idx}]`,
          sourceText: String(col).trim(),
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
    const rawMatrixRows = custom.rows;
    const matrixRows = Array.isArray(rawMatrixRows) ? rawMatrixRows : defaultRows;

    matrixRows.forEach((row: any, rIdx: number) => {
      if (row && typeof row === 'object') {
        if (row.param !== undefined && String(row.param).trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_row_${rIdx}_param`,
            pageId,
            blockId: block.id,
            path: `customData.rows[${rIdx}].param`,
            sourceText: String(row.param).trim(),
            kind: 'table_cell',
            policy: 'translate',
            source: { blockType: block.type, field: `rows[${rIdx}].param` }
          });
        }
        if (Array.isArray(row.values)) {
          row.values.forEach((val: any, vIdx: number) => {
            if (val !== undefined && String(val).trim()) {
              const strVal = String(val).trim();
              const isBullet = ['■', '□', '—', '-', '•'].includes(strVal);
              nodes.push({
                id: `p${pageNumber}_b${block.id}_row_${rIdx}_val_${vIdx}`,
                pageId,
                blockId: block.id,
                path: `customData.rows[${rIdx}].values[${vIdx}]`,
                sourceText: strVal,
                kind: 'table_cell',
                policy: 'protect',
                renderExpectation: isBullet ? 'optional' : 'required',
                source: { blockType: block.type, field: `rows[${rIdx}].values[${vIdx}]` }
              });
            }
          });
        }
      }
    });

    if (Array.isArray(custom.sections)) {
      custom.sections.forEach((sec: any, sIdx: number) => {
        if (sec && typeof sec === 'object' && sec.title !== undefined && String(sec.title).trim()) {
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
