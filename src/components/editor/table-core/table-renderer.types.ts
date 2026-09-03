// src/components/editor/table-core/table-renderer.types.ts
// Contratos de Tipagem Pura para o Renderizador Compartilhado TableCoreRenderer (Fase CORE.T2A).
// Desacoplado de stores globais, mutations de Zustand e APIs do navegador.
// Zero explicit any.

import {
  TableCoreModel,
  TableCellLiteralContent,
  TableCellBoundContent
} from '../../../domain/table-core/table.types';

export type TableCoreRendererMode = 'editor' | 'export';

/**
 * Função de resolução pura para referências de mídia/assets.
 * Permite que o renderizador permaneça 100% desacoplado do MediaStore.
 */
export type TableAssetResolver = (
  assetId: string
) => { url: string; altText?: string } | undefined;

/**
 * Função de resolução pura para dados técnicos vinculados (datum_reference).
 * Permite que o renderizador permaneça 100% desacoplado da Library ou do Product Workbook.
 */
export type TableDatumResolver = (
  reference: TableCellBoundContent
) => {
  value: TableCellLiteralContent;
  status?: 'approved' | 'draft' | 'conflict' | 'unknown';
} | undefined;

/**
 * Propriedades do componente TableCoreRenderer.
 */
export interface TableCoreRendererProps {
  table: TableCoreModel;
  mode?: TableCoreRendererMode; // Default: 'editor'
  resolveAsset?: TableAssetResolver;
  resolveDatum?: TableDatumResolver;
  selectedCellId?: string;
  onSelectCell?: (cellId: string) => void;
  className?: string;
}
