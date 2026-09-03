// src/components/editor/table-core/table-renderer.types.ts
// Contratos de Tipagem Pura para o Renderizador Compartilhado TableCoreRenderer (Fase CORE.T2A.1).
// Desacoplado de stores globais, mutations de Zustand e APIs do navegador.
// Zero explicit any.

import {
  TableCoreModel,
  TableCellModel,
  TableRowModel,
  TableColumnModel,
  TableDatumResolver
} from '../../../domain/table-core';

export type TableCoreRendererMode = 'editor' | 'export';

export type TableRenderDiagnosticCode =
  | 'UNRESOLVED_LIVE_DATUM'
  | 'REVIEW_REQUIRED_WITHOUT_SNAPSHOT'
  | 'UNRESOLVED_ASSET'
  | 'INVALID_GEOMETRY';

export type TableRenderDiagnosticSeverity = 'warning' | 'error';

export interface TableRenderDiagnostic {
  code: TableRenderDiagnosticCode;
  severity: TableRenderDiagnosticSeverity;
  tableId: string;
  cellId?: string;
  message: string;
}

/**
 * Função de resolução pura para referências de mídia/assets.
 * Permite que o renderizador permaneça 100% desacoplado do MediaStore.
 */
export type TableAssetResolver = (
  assetId: string
) => { url: string; altText?: string } | undefined;

// Re-exporta o contrato canônico do Table Core
export type { TableDatumResolver };

/**
 * Propriedades do componente TableCoreRenderer.
 * `mode` é OBRIGATÓRIO para evitar vazamento acidental de comportamento do Editor no CleanA4.
 */
export interface TableCoreRendererProps {
  table: TableCoreModel;
  mode: TableCoreRendererMode; // OBRIGATÓRIO (Part A4)
  resolveAsset?: TableAssetResolver;
  resolveDatum?: TableDatumResolver;
  selectedCellId?: string;
  onSelectCell?: (cellId: string) => void;
  onDiagnostic?: (diagnostic: TableRenderDiagnostic) => void;
  renderTitle?: boolean; // Default: false (evita duplicação com wrappers externos)
  className?: string;
  getCellPrintableField?: (
    cell: TableCellModel,
    row: TableRowModel,
    col: TableColumnModel
  ) => string | undefined;
  getHeaderPrintableField?: (col: TableColumnModel) => string | undefined;
}
