// src/domain/table-core/table-datum-resolver.types.ts
// Contrato canônico e autoridade única para resolução pura de datum em Table Core.
// Zero dependências de React, Zustand, UI, apresentação ou Supabase.

import { TableCellBoundContent, TableCellLiteralContent } from './table.types';

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
 * Função de resolução pura para referências de dados vinculados (datum_reference).
 * Autoridade única para desacoplar a camada de tabela (Renderer, Inspector, Adapters)
 * de qualquer fonte externa (Product Workbook, Library legada, etc.).
 */
export type TableDatumResolver = (
  reference: TableCellBoundContent
) => TableDatumResolutionResult | undefined;
