// src/domain/table-core/table.pagination.ts
// Motor Puro de Paginação A4 do Table Core V2 (A4.FLOW.R1 / CORE.T2).
// Define planejamento determinístico, não-fatiamento de linhas, repetição de cabeçalhos e proteção de seções.
// Totalmente desacoplado de React, DOM, Zustand e banco de dados.

import { TablePaginationPolicy, TableRowKind } from './table.types';

export const DEFAULT_TABLE_PAGINATION_POLICY: TablePaginationPolicy = {
  allowRowSplit: false,           // Invariante: Nunca fatiar uma linha de dados ao meio
  repeatHeaderOnBreak: true,     // Repetir cabeçalho na folha seguinte
  keepHeaderWithFirstRow: true,  // Evitar cabeçalho solitário na última linha da página
  minOrphanRows: 1               // Não deixar linha órfã desacompanhada
};

/**
 * Entrada de medição física para o plano de paginação.
 * Fornecido pelo renderizador DOM ou modelo de medição invariante de escala.
 */
export interface TableRowMeasurement {
  rowId: string;
  measuredHeightMm: number;
  kind?: TableRowKind;
}

export interface TablePaginationMeasurementInput {
  tableId: string;
  /** Title, outer border, legend/notice allowance and other non-row printable chrome. */
  fixedChromeHeightMm?: number;
  headerHeightMm: number;
  rowHeights: TableRowMeasurement[];
  availableHeightOnFirstPageMm: number;
  availableHeightOnSubsequentPagesMm: number;
}

/**
 * Fatia lógica da tabela particionada para renderização em múltiplas folhas A4.
 */
export interface TablePaginationSlice {
  sliceIndex: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  includedRowIds: string[];
  includesRepeatedHeader: boolean;
  totalSliceHeightMm: number;
  footnoteNotice?: string;        // ex: "(Continua na próxima folha...)" ou "(Continuação)"
}

export interface TablePaginationPlan {
  tableId: string;
  policy: TablePaginationPolicy;
  slices: TablePaginationSlice[];
  totalPagesRequired: number;
  hasUnresolvedOversizedRow?: boolean;
  unresolvedOversizedRowIds?: string[];
  hasDuplicateRowIds?: boolean;
  duplicateRowIds?: string[];
}

/**
 * Computa o plano determinístico de paginação de uma tabela técnica A4.
 *
 * Invariantes rigorosos:
 * 1. ZERO row split: Linhas nunca são quebradas ao meio.
 * 2. Deduplicação e preservação estrita: Toda rowId do input aparece em exata e unicamente uma fatia.
 * 3. Ordem idêntica: A ordem relativa das linhas é 100% preservada.
 * 4. Repetição de cabeçalho: Folhas de continuação alocam headerHeightMm se repeatHeaderOnBreak for true.
 * 5. Proteção de seções: Linhas do tipo 'section' nunca são deixadas órfãs no final de uma fatia sem ao menos um filho.
 * 6. Quebras manuais: manualBreakRowIds força quebra de folha antes da linha especificada.
 * 7. Fail-Closed: Linhas individuais maiores que a folha inteira são diagnosticadas como hasUnresolvedOversizedRow.
 */
export function computeTablePaginationPlan(
  input: TablePaginationMeasurementInput,
  policyOverrides?: Partial<TablePaginationPolicy>,
  manualBreakRowIds?: string[]
): TablePaginationPlan {
  const policy: TablePaginationPolicy = {
    ...DEFAULT_TABLE_PAGINATION_POLICY,
    ...policyOverrides
  };

  const manualBreaksSet = new Set(manualBreakRowIds || []);
  const rows = input.rowHeights || [];

  if (rows.length === 0) {
    return {
      tableId: input.tableId,
      policy,
      slices: [],
      totalPagesRequired: 0,
      hasUnresolvedOversizedRow: false
    };
  }

  const slices: TablePaginationSlice[] = [];
  const unresolvedOversizedRowIds: string[] = [];
  const duplicateRowIds = rows
    .map((row) => row.rowId)
    .filter((rowId, index, all) => all.indexOf(rowId) !== index)
    .filter((rowId, index, all) => all.indexOf(rowId) === index);
  const fixedChromeHeightMm = Math.max(0, input.fixedChromeHeightMm ?? 0);
  const baseSliceHeightMm = input.headerHeightMm + fixedChromeHeightMm;

  let currentSliceIndex = 0;
  let currentIncludedRowIds: string[] = [];
  let currentSliceHeightMm = baseSliceHeightMm;
  let currentAvailableHeightMm = input.availableHeightOnFirstPageMm;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowHeight = Math.max(0, row.measuredHeightMm);

    // Diagnóstico de linha individual maior que uma folha A4 em branco
    if (baseSliceHeightMm + rowHeight > input.availableHeightOnSubsequentPagesMm) {
      if (!unresolvedOversizedRowIds.includes(row.rowId)) {
        unresolvedOversizedRowIds.push(row.rowId);
      }
    }

    // Verifica quebra manual antes desta linha
    const isManualBreak = manualBreaksSet.has(row.rowId);
    if (isManualBreak && currentIncludedRowIds.length > 0) {
      // Fecha a fatia corrente e inicia uma nova
      slices.push({
        sliceIndex: currentSliceIndex,
        isFirstPage: currentSliceIndex === 0,
        isLastPage: false,
        includedRowIds: currentIncludedRowIds,
        includesRepeatedHeader: currentSliceIndex > 0 ? policy.repeatHeaderOnBreak : true,
        totalSliceHeightMm: Number(currentSliceHeightMm.toFixed(2))
      });

      currentSliceIndex++;
      currentIncludedRowIds = [];
      const repeatHeader = policy.repeatHeaderOnBreak;
      currentSliceHeightMm = fixedChromeHeightMm + (repeatHeader ? input.headerHeightMm : 0);
      currentAvailableHeightMm = input.availableHeightOnSubsequentPagesMm;
    }

    // Proteção de Cabeçalho de Seção (FLOW-T29 / FLOW-T30):
    // Se a linha é uma seção e tem pelo menos um filho seguinte,
    // verifica se ambos cabem na fatia corrente. Se não couberem e a fatia já tiver linhas, move a seção.
    if (row.kind === 'section' && i + 1 < rows.length) {
      const nextChildRow = rows[i + 1];
      const combinedSectionMm = rowHeight + Math.max(0, nextChildRow.measuredHeightMm);

      if (currentSliceHeightMm + combinedSectionMm > currentAvailableHeightMm && currentIncludedRowIds.length > 0) {
        // Fecha a fatia corrente para manter a seção junto com seu primeiro filho
        slices.push({
          sliceIndex: currentSliceIndex,
          isFirstPage: currentSliceIndex === 0,
          isLastPage: false,
          includedRowIds: currentIncludedRowIds,
          includesRepeatedHeader: currentSliceIndex > 0 ? policy.repeatHeaderOnBreak : true,
          totalSliceHeightMm: Number(currentSliceHeightMm.toFixed(2))
        });

        currentSliceIndex++;
        currentIncludedRowIds = [];
        const repeatHeader = policy.repeatHeaderOnBreak;
        currentSliceHeightMm = fixedChromeHeightMm + (repeatHeader ? input.headerHeightMm : 0);
        currentAvailableHeightMm = input.availableHeightOnSubsequentPagesMm;
      }
    }

    // Verificação de estouro de altura normal
    if (currentSliceHeightMm + rowHeight > currentAvailableHeightMm && currentIncludedRowIds.length > 0) {
      // Fecha a fatia corrente
      slices.push({
        sliceIndex: currentSliceIndex,
        isFirstPage: currentSliceIndex === 0,
        isLastPage: false,
        includedRowIds: currentIncludedRowIds,
        includesRepeatedHeader: currentSliceIndex > 0 ? policy.repeatHeaderOnBreak : true,
        totalSliceHeightMm: Number(currentSliceHeightMm.toFixed(2))
      });

      currentSliceIndex++;
      currentIncludedRowIds = [];
      const repeatHeader = policy.repeatHeaderOnBreak;
      currentSliceHeightMm = fixedChromeHeightMm + (repeatHeader ? input.headerHeightMm : 0);
      currentAvailableHeightMm = input.availableHeightOnSubsequentPagesMm;
    }

    // Adiciona a linha na fatia ativa
    currentIncludedRowIds.push(row.rowId);
    currentSliceHeightMm += rowHeight;
  }

  // Fecha a última fatia
  if (currentIncludedRowIds.length > 0) {
    slices.push({
      sliceIndex: currentSliceIndex,
      isFirstPage: currentSliceIndex === 0,
      isLastPage: true,
      includedRowIds: currentIncludedRowIds,
      includesRepeatedHeader: currentSliceIndex > 0 ? policy.repeatHeaderOnBreak : true,
      totalSliceHeightMm: Number(currentSliceHeightMm.toFixed(2))
    });
  }

  // Ajusta flags e avisos de rodapé
  const totalSlices = slices.length;
  for (let idx = 0; idx < totalSlices; idx++) {
    const slice = slices[idx];
    slice.isFirstPage = idx === 0;
    slice.isLastPage = idx === totalSlices - 1;

    if (!slice.isLastPage) {
      slice.footnoteNotice = '(Continua na próxima folha...)';
    }
  }

  return {
    tableId: input.tableId,
    policy,
    slices,
    totalPagesRequired: totalSlices,
    hasUnresolvedOversizedRow: unresolvedOversizedRowIds.length > 0,
    unresolvedOversizedRowIds,
    hasDuplicateRowIds: duplicateRowIds.length > 0,
    duplicateRowIds
  };
}
