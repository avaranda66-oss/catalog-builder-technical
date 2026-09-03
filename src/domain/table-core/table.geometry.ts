// src/domain/table-core/table.geometry.ts
// Cálculos de Geometria Física A4 para o Table Core V2.
// Milímetros (mm) são a autoridade física canônica.
// Zero explicit any.

import { TableCoreModel } from './table.types';
import { CANONICAL_A4_GEOMETRY, getPageContentBox } from '../page-geometry';

export interface TableGeometryConstraints {
  maxAvailableWidthMm?: number;
}

export interface ResolvedColumnWidth {
  columnId: string;
  widthMm: number;
}

export interface TableGeometryResult {
  valid: boolean;
  totalTableWidthMm: number;
  availableContentWidthMm: number;
  columns: ResolvedColumnWidth[];
  warnings: string[];
  error?: string;
}

/**
 * Retorna a largura máxima disponível para conteúdo no A4 canônico.
 */
export function getDefaultMaxContentWidthMm(): number {
  return getPageContentBox(CANONICAL_A4_GEOMETRY).availableWidthMm;
}

/**
 * Resolve as larguras físicas em mm de todas as colunas da tabela.
 * Respeita colunas fixed_mm e distribui o espaço restante para auto / weighted.
 */
export function resolveColumnWidthsMm(
  table: TableCoreModel,
  constraints?: TableGeometryConstraints
): TableGeometryResult {
  const maxAvailable = constraints?.maxAvailableWidthMm ?? getDefaultMaxContentWidthMm();
  const warnings: string[] = [];

  let effectiveTableWidth = maxAvailable;
  if (table.presentation.tableWidth.mode === 'fixed_mm') {
    const specified = table.presentation.tableWidth.widthMm;
    if (typeof specified !== 'number' || specified <= 0) {
      return {
        valid: false,
        totalTableWidthMm: specified ?? 0,
        availableContentWidthMm: maxAvailable,
        columns: [],
        warnings,
        error: `Largura fixa da tabela (${specified} mm) deve ser maior que zero.`
      };
    }
    if (specified > maxAvailable + 0.001) {
      warnings.push(
        `Largura fixa da tabela (${specified} mm) excede a área útil da página A4 (${maxAvailable} mm).`
      );
    }
    effectiveTableWidth = specified;
  }

  // 1. Somar larguras fixas e contar pesos
  let totalFixedMm = 0;
  let autoCount = 0;
  let totalWeight = 0;

  for (const col of table.columns) {
    if (col.widthSpec.mode === 'fixed_mm') {
      const w = col.widthSpec.widthMm;
      if (typeof w !== 'number' || w <= 0) {
        return {
          valid: false,
          totalTableWidthMm: effectiveTableWidth,
          availableContentWidthMm: maxAvailable,
          columns: [],
          warnings,
          error: `Coluna "${col.semanticKey}" possui largura inválida (${w} mm).`
        };
      }
      totalFixedMm += w;
    } else if (col.widthSpec.mode === 'weighted') {
      const weight = col.widthSpec.weight;
      if (typeof weight !== 'number' || weight <= 0) {
        return {
          valid: false,
          totalTableWidthMm: effectiveTableWidth,
          availableContentWidthMm: maxAvailable,
          columns: [],
          warnings,
          error: `Coluna "${col.semanticKey}" possui peso inválido (${weight}).`
        };
      }
      totalWeight += weight;
    } else {
      // auto
      autoCount += 1;
    }
  }

  if (totalFixedMm > effectiveTableWidth + 0.001) {
    warnings.push(
      `A soma das colunas com largura fixa (${Number(totalFixedMm.toFixed(2))} mm) excede a largura total da tabela (${Number(effectiveTableWidth.toFixed(2))} mm).`
    );
  }

  const remainingSpace = Math.max(0, effectiveTableWidth - totalFixedMm);

  // 2. Distribuir espaço restante
  const resolved: ResolvedColumnWidth[] = [];
  const flexUnits = totalWeight + autoCount;

  for (const col of table.columns) {
    if (col.widthSpec.mode === 'fixed_mm') {
      resolved.push({
        columnId: col.id,
        widthMm: Number(col.widthSpec.widthMm.toFixed(4))
      });
    } else if (col.widthSpec.mode === 'weighted') {
      const weight = col.widthSpec.weight;
      const share = flexUnits > 0 ? (remainingSpace * weight) / flexUnits : 0;
      resolved.push({
        columnId: col.id,
        widthMm: Number(share.toFixed(4))
      });
    } else {
      // auto: peso unitário
      const share = flexUnits > 0 ? remainingSpace / flexUnits : 0;
      resolved.push({
        columnId: col.id,
        widthMm: Number(share.toFixed(4))
      });
    }
  }

  return {
    valid: true,
    totalTableWidthMm: Number(effectiveTableWidth.toFixed(4)),
    availableContentWidthMm: Number(maxAvailable.toFixed(4)),
    columns: resolved,
    warnings
  };
}
