// src/domain/table-binding/table-datum.types.ts
// Contratos de tipos para resolução pura de dados vinculados (Table ↔ Product Knowledge / Library).
// Zero dependências de React, Zustand ou Supabase.

import { TableCellBoundContent, TableCellLiteralContent } from '../table-core/table.types';

export type TableDatumStatus = 'approved' | 'draft' | 'conflict' | 'unknown';

export interface TableDatumDiagnostic {
  readonly message?: string;
  readonly productRevision?: number;
  readonly familyRevision?: number;
  readonly unsupportedType?: string;
}

export interface TableDatumResolutionResult {
  readonly value: TableCellLiteralContent;
  readonly status?: TableDatumStatus;
  readonly diagnostic?: TableDatumDiagnostic;
}

/**
 * Função de resolução pura para referências de dados de tabela (datum_reference).
 * Permite que a camada de renderização permaneça 100% desacoplada da fonte de dados.
 */
export type TableDatumResolver = (
  reference: TableCellBoundContent
) => TableDatumResolutionResult | undefined;
