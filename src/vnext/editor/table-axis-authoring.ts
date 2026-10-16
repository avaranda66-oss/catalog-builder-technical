import { VNextError } from '../domain/diagnostics';
import type { TableModel } from '../domain/editorial-model';
import { deleteAxis } from '../table/table-model';

/**
 * FR-34: inserting and removing rows and columns from the cell or range the person selected. Pure checks and
 * names; the editor runs the existing `table.axis.insert` / `table.axis.remove` actions under one transactionId.
 */

export type TableAxisRemovalPlan =
  | { readonly ok: true; readonly axisIds: readonly string[] }
  | { readonly ok: false; readonly code: 'NO_AXIS' | 'TABLE_LAST_AXIS' | 'MERGE_INTERSECTION' | 'TABLE_AXIS_NOT_FOUND' | 'ACTION_INVALID' };

/**
 * Checks, before anything changes, that every selected row (or column) can go: the table keeps at least one, and
 * none of them crosses a merged cell. Returns the axes in table order, ready to be removed one by one.
 */
export function planTableAxisRemoval(
  table: TableModel,
  axis: 'row' | 'column',
  axisIds: readonly string[]
): TableAxisRemovalPlan {
  if (axisIds.length === 0) return { ok: false, code: 'NO_AXIS' };
  const items = axis === 'row' ? table.rows : table.columns;
  const wanted = new Set(axisIds);
  const ordered = items.map((item) => item.id).filter((id) => wanted.has(id));
  if (ordered.length !== wanted.size) return { ok: false, code: 'TABLE_AXIS_NOT_FOUND' };
  if (ordered.length >= items.length) return { ok: false, code: 'TABLE_LAST_AXIS' };
  let current = table;
  for (const id of ordered) {
    try {
      current = deleteAxis(current, axis, id);
    } catch (error) {
      if (error instanceof VNextError && error.code === 'MERGE_INTERSECTION') return { ok: false, code: 'MERGE_INTERSECTION' };
      if (error instanceof VNextError && error.code === 'TABLE_LAST_AXIS') return { ok: false, code: 'TABLE_LAST_AXIS' };
      return { ok: false, code: 'ACTION_INVALID' };
    }
  }
  return { ok: true, axisIds: ordered };
}

/**
 * Role of a row inserted next to `referenceRowId`. Above a header row it is a header row too; below the last
 * header row it is an ordinary row (a new row under the header is where the data goes); next to a section row it
 * is an ordinary row.
 */
export function insertedRowRole(
  table: TableModel,
  referenceRowId: string,
  position: 'before' | 'after'
): 'header' | 'body' {
  const index = table.rows.findIndex((row) => row.id === referenceRowId);
  const reference = table.rows[index];
  if (!reference || reference.role !== 'header') return 'body';
  if (position === 'before') return 'header';
  return table.rows[index + 1]?.role === 'header' ? 'header' : 'body';
}

/** "Excluir linha", "Excluir 3 linhas", "Excluir coluna", "Excluir 2 colunas". */
export function removeAxisLabel(axis: 'row' | 'column', count: number): string {
  if (count <= 1) return axis === 'row' ? 'Excluir linha' : 'Excluir coluna';
  return axis === 'row' ? `Excluir ${count} linhas` : `Excluir ${count} colunas`;
}

/** Plain message for a refused structure change (same words the toolbar always used where they already existed). */
export function tableAxisRefusalMessage(code: string, axis: 'row' | 'column'): string {
  if (code === 'NO_AXIS') {
    return axis === 'row'
      ? 'Clique numa célula da tabela para inserir ou excluir linhas.'
      : 'Clique numa célula da tabela para inserir ou excluir colunas.';
  }
  if (code === 'TABLE_LAST_AXIS') return 'A última linha ou coluna não pode ser removida.';
  if (code === 'MERGE_INTERSECTION') return 'A remoção cruza uma célula mesclada. Desfaça a mesclagem antes de remover.';
  if (code === 'TARGET_STALE') return 'A tabela mudou. A ação foi descartada sem alterar o documento.';
  if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
  return 'Não foi possível alterar a estrutura da tabela.';
}
