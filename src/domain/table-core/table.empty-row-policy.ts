// src/domain/table-core/table.empty-row-policy.ts
// Política Canônica Pura de Detecção e Supressão de Linhas Visualmente Vazias (MISSÃO UX.TABLE.DESIGN.SYSTEM1).
// Usado para garantir paridade absoluta entre Canvas, Preview e PDF/Export sem ghost stripes.
// Zero explicit any.

import {
  TableRowModel,
  TableColumnModel,
  TableCellModel,
  getCellKey
} from './table.types';
import { TableDatumResolver } from '../../components/editor/table-core/table-renderer.types';

/**
 * Avalia de forma puramente funcional se uma linha é 100% semanticamente e visualmente vazia.
 *
 * Invariantes da Emenda 2 e 3:
 * - "   " (whitespace) -> considerado VAZIO.
 * - numeric 0 -> NÃO vazio (0 é um valor metrológico real).
 * - boolean false -> NÃO vazio (false é um estado booleano significativo).
 * - datum_reference (binding real PIM/conhecimento técnico sem snapshot ou sem literal imediato) -> NÃO vazio.
 * - asset_reference -> NÃO vazio.
 * - value_unit (mesmo com 0) -> NÃO vazio.
 * - badge com texto -> NÃO vazio.
 * - span horizontal ou vertical com conteúdo -> NÃO vazio.
 * - row estrutural de seção ou divisor -> NÃO vazio se possuir rótulo.
 */
export function isTableRowVisuallyEmpty(
  row: TableRowModel,
  columns: TableColumnModel[],
  cells: Record<string, TableCellModel>,
  resolveDatum?: TableDatumResolver
): boolean {
  // 1. Linhas estruturais de seção ou divisor têm regra própria
  if (row.kind === 'section' || row.kind === 'divider') {
    const firstColId = columns[0]?.id;
    if (!firstColId) return true;
    const firstKey = getCellKey(row.id, firstColId);
    const sectionCell = cells[firstKey];
    if (!sectionCell) return true;
    if (sectionCell.content.kind === 'text') {
      return sectionCell.content.text.trim().length === 0;
    }
    return sectionCell.content.kind === 'empty';
  }

  // 2. Cabeçalhos e rodapés estruturais não são linhas de dados
  if (row.isHeader || row.kind === 'header' || row.kind === 'footer') {
    return false;
  }

  // 3. Avalia cada célula pertencente à linha de dados
  for (const col of columns) {
    const key = getCellKey(row.id, col.id);
    const cell = cells[key];

    if (!cell) {
      continue;
    }

    // Células cobertas por merge (coveredBy) herdam a visibilidade da âncora
    if (cell.coveredBy) {
      continue;
    }

    const { content } = cell;

    switch (content.kind) {
      case 'empty':
        break;

      case 'text':
        if (content.text && content.text.trim().length > 0) {
          return false;
        }
        break;

      case 'number':
        // 0 é um número válido e não deve ser considerado vazio
        if (typeof content.value === 'number') {
          return false;
        }
        break;

      case 'value_unit':
        // Valor com unidade é conteúdo físico
        if (typeof content.amount === 'number' || (content.unit && content.unit.trim().length > 0)) {
          return false;
        }
        break;

      case 'badge':
        if (content.label && content.label.trim().length > 0) {
          return false;
        }
        break;

      case 'boolean':
        // true ou false são estados explícitos válidos
        if (typeof content.value === 'boolean') {
          return false;
        }
        break;

      case 'asset_reference':
        if (content.assetId && content.assetId.trim().length > 0) {
          return false;
        }
        break;

      case 'range':
        // Range estruturado
        return false;

      case 'enum':
        if (content.code && content.code.trim().length > 0) {
          return false;
        }
        break;

      case 'technical_token':
        if (content.token && content.token.trim().length > 0) {
          return false;
        }
        break;

      case 'datum_reference':
        // Binding real de biblioteca/PIM: mesmo sem snapshot materializado, a célula possui vínculo
        // Portanto, a linha NÃO é considerada vazia
        if (content.datumKey && content.datumKey.trim().length > 0) {
          return false;
        }
        if (resolveDatum) {
          const resolved = resolveDatum(content);
          if (resolved && resolved.value.kind !== 'empty') {
            return false;
          }
        }
        break;

      default:
        // Qualquer outro tipo desconhecido é tratado como potencialmente não-vazio para segurança
        return false;
    }
  }

  // Se todas as células forem vazias ou ausentes, a linha é 100% vazia
  return true;
}
