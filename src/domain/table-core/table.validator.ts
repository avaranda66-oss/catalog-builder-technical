// src/domain/table-core/table.validator.ts
// Validador de Invariantes Estruturais e Integridade do Table Core V2.
// Garante conformidade de merges, unicidade de IDs e ausência de células órfãs.
// Zero explicit any.

import { TableCoreModel, getCellKey, parseCellKey } from './table.types';
import { TableCoreModelSchema } from './table.schema';

export { getCellKey, parseCellKey };

export interface TableValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida rigorosamente todas as invariantes estruturais do modelo de tabela.
 */
export function validateTableModel(table: TableCoreModel): TableValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validação com Zod Schema estrito
  const zodParse = TableCoreModelSchema.safeParse(table);
  if (!zodParse.success) {
    zodParse.error.errors.forEach((err) => {
      errors.push(`[Schema] ${err.path.join('.')}: ${err.message}`);
    });
    return { valid: false, errors, warnings };
  }

  // 2. Unicidade de IDs e semanticKeys de colunas
  const colIdSet = new Set<string>();
  const semanticKeySet = new Set<string>();
  const colIndexMap = new Map<string, number>();

  table.columns.forEach((col, idx) => {
    if (colIdSet.has(col.id)) {
      errors.push(`ID de coluna duplicado encontrado: "${col.id}".`);
    }
    colIdSet.add(col.id);

    if (semanticKeySet.has(col.semanticKey)) {
      errors.push(`Chave semântica (semanticKey) duplicada encontrada: "${col.semanticKey}".`);
    }
    semanticKeySet.add(col.semanticKey);

    colIndexMap.set(col.id, idx);
  });

  // 3. Unicidade de IDs de linhas
  const rowIdSet = new Set<string>();
  const rowIndexMap = new Map<string, number>();

  table.rows.forEach((row, idx) => {
    if (rowIdSet.has(row.id)) {
      errors.push(`ID de linha duplicado encontrado: "${row.id}".`);
    }
    rowIdSet.add(row.id);
    rowIndexMap.set(row.id, idx);
  });

  // 4. Invariante de contagem exata de células: cells.length === rows.length * columns.length
  const expectedCellCount = table.rows.length * table.columns.length;
  const actualCellCount = Object.keys(table.cells).length;
  if (actualCellCount !== expectedCellCount) {
    errors.push(
      `Contagem de células inválida: a tabela possui ${actualCellCount} células, mas a grade ${table.rows.length}x${table.columns.length} exige exatamente ${expectedCellCount}.`
    );
  }

  // 5. Unicidade de IDs de células e integridade de coordenadas
  const cellIdSet = new Set<string>();
  for (const [key, cell] of Object.entries(table.cells)) {
    if (cellIdSet.has(cell.id)) {
      errors.push(`ID de célula duplicado encontrado: "${cell.id}" na chave "${key}".`);
    }
    cellIdSet.add(cell.id);

    if (!rowIdSet.has(cell.rowId)) {
      errors.push(`Célula "${cell.id}" referencia rowId inexistente: "${cell.rowId}".`);
    }
    if (!colIdSet.has(cell.columnId)) {
      errors.push(`Célula "${cell.id}" referencia columnId inexistente: "${cell.columnId}".`);
    }

    const expectedKey = getCellKey(cell.rowId, cell.columnId);
    if (key !== expectedKey) {
      errors.push(`Chave do mapa "${key}" diverge das coordenadas da célula "${expectedKey}".`);
    }
  }

  // 6. Completude da grade: toda coordenada (row, col) deve ter célula registrada
  for (const row of table.rows) {
    for (const col of table.columns) {
      const key = getCellKey(row.id, col.id);
      if (!table.cells[key]) {
        errors.push(`Célula ausente na grade para coordenada [row=${row.id}, col=${col.id}].`);
      }
    }
  }

  // 7. Invariantes de Mesclagem (Merge / Span)
  const coveredCoordinates = new Map<string, string>(); // coordKey -> anchorCellId

  for (const cell of Object.values(table.cells)) {
    const colSpan = cell.colSpan ?? 1;
    const rowSpan = cell.rowSpan ?? 1;

    if (colSpan < 1 || rowSpan < 1) {
      errors.push(`Célula "${cell.id}" possui spans inválidos (colSpan=${colSpan}, rowSpan=${rowSpan}).`);
      continue;
    }

    // Se a célula é coberta, seus spans devem ser estritamente 1
    if (cell.coveredBy) {
      if (colSpan !== 1 || rowSpan !== 1) {
        errors.push(`Célula coberta "${cell.id}" não pode ter spans maiores que 1 (colSpan=${colSpan}, rowSpan=${rowSpan}).`);
      }
      if (cell.content.kind !== 'empty') {
        errors.push(`Célula coberta "${cell.id}" não pode possuir conteúdo independente (kind="${cell.content.kind}").`);
      }
    }

    // Se é uma Célula Âncora (span > 1)
    if (colSpan > 1 || rowSpan > 1) {
      if (cell.coveredBy) {
        errors.push(`Célula âncora "${cell.id}" com span não pode ser simultaneamente coberta por "${cell.coveredBy}".`);
      }

      const startR = rowIndexMap.get(cell.rowId);
      const startC = colIndexMap.get(cell.columnId);

      if (startR === undefined || startC === undefined) continue;

      // Limites da tabela
      if (startC + colSpan > table.columns.length) {
        errors.push(`Mesclagem da célula "${cell.id}" ultrapassa o limite horizontal da tabela (${startC + colSpan} > ${table.columns.length}).`);
      }
      if (startR + rowSpan > table.rows.length) {
        errors.push(`Mesclagem da célula "${cell.id}" ultrapassa o limite vertical da tabela (${startR + rowSpan} > ${table.rows.length}).`);
      }

      // Validar cada célula coberta pelo retângulo da âncora
      for (let rowIdx: number = startR; rowIdx < Math.min(startR + rowSpan, table.rows.length); rowIdx++) {
        for (let colIdx: number = startC; colIdx < Math.min(startC + colSpan, table.columns.length); colIdx++) {
          if (rowIdx === startR && colIdx === startC) continue; // Pula a própria âncora

          const targetRow = table.rows[rowIdx];
          const targetCol = table.columns[colIdx];
          const targetKey = getCellKey(targetRow.id, targetCol.id);
          const targetCell = table.cells[targetKey];

          // Detecção de sobreposição de merges
          if (coveredCoordinates.has(targetKey)) {
            errors.push(`Sobreposição de mesclagens detectada na célula [${targetRow.id}::${targetCol.id}] entre "${coveredCoordinates.get(targetKey)}" e "${cell.id}".`);
          } else {
            coveredCoordinates.set(targetKey, cell.id);
          }

          if (targetCell) {
            if (targetCell.coveredBy !== cell.id) {
              errors.push(`Célula coberta "${targetCell.id}" em [${targetKey}] deve apontar coveredBy para a âncora "${cell.id}", mas aponta para "${targetCell.coveredBy}".`);
            }
          }
        }
      }
    }
  }

  // 8. Validar se células com coveredBy estão de fato cobertas por sua âncora
  for (const cell of Object.values(table.cells)) {
    if (cell.coveredBy) {
      const coordKey = getCellKey(cell.rowId, cell.columnId);
      const expectedAnchor = coveredCoordinates.get(coordKey);
      if (!expectedAnchor || expectedAnchor !== cell.coveredBy) {
        errors.push(`Célula "${cell.id}" em [${coordKey}] possui coveredBy="${cell.coveredBy}" órfão ou inválido.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
