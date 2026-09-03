// src/domain/table-core/table.pagination.ts
// Contrato Arquitetural de Paginação A4 do Table Core V2.
// Define políticas de não-fatiamento de linhas e repetição de cabeçalhos.

import { TablePaginationPolicy } from './table.types';

export const DEFAULT_TABLE_PAGINATION_POLICY: TablePaginationPolicy = {
  allowRowSplit: false,           // Invariante: Nunca fatiar uma linha de dados ao meio
  repeatHeaderOnBreak: true,     // Repetir cabeçalho na folha seguinte
  keepHeaderWithFirstRow: true,  // Evitar cabeçalho solitário na última linha da página
  minOrphanRows: 1               // Não deixar linha órfã desacompanhada
};

/**
 * Entrada de medição física para o plano de paginação futuro (T2).
 * Fornecido pelo renderizador DOM no browser, sem heurísticas artificiais de caracteres.
 */
export interface TableRowMeasurement {
  rowId: string;
  measuredHeightMm: number;
}

export interface TablePaginationMeasurementInput {
  tableId: string;
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
}
