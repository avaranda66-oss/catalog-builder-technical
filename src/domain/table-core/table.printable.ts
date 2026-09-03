// src/domain/table-core/table.printable.ts
// Identificadores Estáveis de Tradução (i18n) para Table Core V2.
// Elimina a fragilidade dos índices de array numéricos da arquitetura legada.

/**
 * Gera o ID estável de tradução para o rótulo de uma coluna.
 * Baseado estritamente no ID persistente da tabela e da coluna.
 */
export function getTableColumnPrintableNodeId(tableId: string, columnId: string): string {
  return `table_${tableId}_column_${columnId}_label`;
}

/**
 * Gera o ID estável de tradução para o conteúdo textual de uma célula.
 * Baseado estritamente no ID persistente da tabela e da célula.
 */
export function getTableCellPrintableNodeId(tableId: string, cellId: string): string {
  return `table_${tableId}_cell_${cellId}_text`;
}

/**
 * Gera o ID estável de tradução para o título da tabela.
 */
export function getTableTitlePrintableNodeId(tableId: string): string {
  return `table_${tableId}_title`;
}
