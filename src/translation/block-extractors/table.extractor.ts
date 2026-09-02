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

  // Cabeçalhos de Colunas (Labels exibidos no PDF)
  if (block.tableColumns && Array.isArray(block.tableColumns)) {
    block.tableColumns.forEach((col: TableColumnConfig, idx: number) => {
      if (col.label && col.label.trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_col_${col.key || idx}_label`,
          pageId,
          blockId: block.id,
          path: `tableColumns[${idx}].label`,
          sourceText: col.label.trim(),
          kind: 'table_header',
          policy: 'translate',
          source: { blockType: block.type, field: `tableColumns[${idx}].label` }
        });
      }
    });
  }

  // Linhas da Tabela: customNotes e localOverrides textuais
  if (block.tableRows && Array.isArray(block.tableRows)) {
    block.tableRows.forEach((row: CatalogTableRow, rIdx: number) => {
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
              source: { blockType: block.type, field: `tableRows[${rIdx}].localOverrides.${key}` }
            });
          }
        });
      }
    });
  }

  // Custom Table: Headers e Células personalizadas em customData
  if (block.type === 'custom_table' && block.customData) {
    if (Array.isArray(block.customData.headers)) {
      block.customData.headers.forEach((h: string, idx: number) => {
        if (typeof h === 'string' && h.trim()) {
          nodes.push({
            id: `p${pageNumber}_b${block.id}_cust_h_${idx}`,
            pageId,
            blockId: block.id,
            path: `customData.headers[${idx}]`,
            sourceText: h.trim(),
            kind: 'table_header',
            policy: 'translate',
            source: { blockType: block.type, field: `customData.headers[${idx}]` }
          });
        }
      });
    }

    if (Array.isArray(block.customData.rows)) {
      block.customData.rows.forEach((row: any[], rIdx: number) => {
        if (Array.isArray(row)) {
          row.forEach((cell: any, cIdx: number) => {
            if (typeof cell === 'string' && cell.trim()) {
              nodes.push({
                id: `p${pageNumber}_b${block.id}_cust_r${rIdx}_c${cIdx}`,
                pageId,
                blockId: block.id,
                path: `customData.rows[${rIdx}][${cIdx}]`,
                sourceText: cell.trim(),
                kind: 'table_cell',
                policy: 'translate',
                source: { blockType: block.type, field: `customData.rows[${rIdx}][${cIdx}]` }
              });
            }
          });
        }
      });
    }
  }

  // Matrix Spec Table: seções e cabeçalhos em customData
  if (block.type === 'matrix_spec_table' && block.customData?.sections && Array.isArray(block.customData.sections)) {
    block.customData.sections.forEach((sec: any, sIdx: number) => {
      if (sec.title && String(sec.title).trim()) {
        nodes.push({
          id: `p${pageNumber}_b${block.id}_sec_${sIdx}_title`,
          pageId,
          blockId: block.id,
          path: `customData.sections[${sIdx}].title`,
          sourceText: String(sec.title).trim(),
          kind: 'heading',
          policy: 'translate',
          source: { blockType: block.type, field: `sections[${sIdx}].title` }
        });
      }
    });
  }

  return nodes;
}
