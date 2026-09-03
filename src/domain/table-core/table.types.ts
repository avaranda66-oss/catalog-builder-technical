// src/domain/table-core/table.types.ts
// Tipos Puros de Domínio do Table Core V2.
// Totalmente desacoplado de React, Zustand, DOM e banco de dados.
// Invariante de tipagem estrita: Zero explicit any.

export type TableSchemaVersion = 1;

export type TableHorizontalAlign = 'left' | 'center' | 'right';
export type TableVerticalAlign = 'top' | 'middle' | 'bottom';

export type TableRowKind = 'header' | 'data' | 'footer' | 'divider';

/**
 * Tokens semânticos fechados de cor para estilização e apresentação de tabelas.
 * Proíbe expressamente strings arbitrárias de cores, hexadecimais soltos e injeção de CSS.
 */
export type TableColorToken =
  | 'transparent'
  | 'surface'
  | 'surface_subtle'
  | 'surface_header'
  | 'text_primary'
  | 'text_secondary'
  | 'text_muted'
  | 'text_on_header'
  | 'brand_primary'
  | 'brand_secondary'
  | 'brand_navy'
  | 'accent'
  | 'success'
  | 'warning'
  | 'critical'
  | 'white'
  | 'slate_900'
  | 'slate_800'
  | 'slate_100';

/**
 * Especificação discriminada da largura de coluna física.
 * Não permite combinações inválidas ou ambíguas de propriedades.
 */
export type ColumnWidthSpec =
  | { mode: 'auto' }
  | { mode: 'fixed_mm'; widthMm: number }
  | { mode: 'weighted'; weight: number };

/**
 * Definição de Coluna no Table Core.
 * `id`: Identificador estável opaco.
 * `semanticKey`: Chave canônica de domínio estável para matching e bindings.
 */
export interface TableColumnModel {
  id: string;                      // Identificador estável da coluna
  semanticKey: string;             // Chave semântica (ex: 'range', 'accuracy', 'supply')
  defaultLabel: string;            // Rótulo padrão da coluna
  widthSpec: ColumnWidthSpec;      // Especificação discriminada de largura
  align: TableHorizontalAlign;     // Alinhamento padrão do conteúdo
  isCustom?: boolean;              // Indica se foi adicionada manualmente pelo usuário
}

/**
 * Definição de Linha no Table Core.
 * `id`: Identificador estável opaco.
 */
export interface TableRowModel {
  id: string;                      // Identificador estável da linha
  kind: TableRowKind;              // Semântica estrutural (data, header, footer, divider)
  minHeightMm?: number;            // Altura física mínima em milímetros
  isHeader?: boolean;              // Linha repetível em quebra de página
}

// ============================================================================
// CONTEÚDO POLIMÓRFICO DE CÉLULAS (DISCRIMINATED UNIONS)
// ============================================================================

export interface TableCellEmptyContent {
  kind: 'empty';
}

export interface TableCellTextContent {
  kind: 'text';
  text: string;
}

export interface TableCellNumberContent {
  kind: 'number';
  value: number;
  format?: {
    decimals?: number;
    prefix?: string;
    suffix?: string;
  };
}

export interface TableCellValueUnitContent {
  kind: 'value_unit';
  amount: number;
  unit: string;
  qualifier?: string; // ex: '±', '≤', '≥', 'ca.'
}

export interface TableCellBadgeContent {
  kind: 'badge';
  label: string;
  variant: 'info' | 'success' | 'warning' | 'neutral' | 'critical';
}

export interface TableCellAssetRefContent {
  kind: 'asset_reference';
  assetId: string;
  caption?: string;
  altText?: string;
  targetWidthMm?: number;
  targetHeightMm?: number;
}

/**
 * Conteúdos literais que podem ser materializados de forma independente.
 */
export type TableCellLiteralContent =
  | TableCellEmptyContent
  | TableCellTextContent
  | TableCellNumberContent
  | TableCellValueUnitContent
  | TableCellBadgeContent
  | TableCellAssetRefContent;

export type TableBindingMode = 'live' | 'snapshot' | 'review_required';

/**
 * Referência tipada a um dado do Product Workbook ou catálogo.
 * Se bindingMode === 'snapshot', a presença de snapshot materializado é obrigatória.
 */
export type TableCellBoundContent =
  | {
      kind: 'datum_reference';
      productId: string;
      datumKey: string;
      moduleKey?: string;
      bindingMode: 'live' | 'review_required';
      snapshot?: TableCellLiteralContent;
    }
  | {
      kind: 'datum_reference';
      productId: string;
      datumKey: string;
      moduleKey?: string;
      bindingMode: 'snapshot';
      snapshot: TableCellLiteralContent;
    };

export type TableCellContent = TableCellLiteralContent | TableCellBoundContent;

/**
 * Overrides de estilo a nível de célula.
 * Usa exclusivamente tokens semânticos de cor (TableColorToken). Proíbe CSS ou cores arbitrárias.
 */
export interface TableCellStyleOverride {
  bold?: boolean;
  italic?: boolean;
  align?: TableHorizontalAlign;
  verticalAlign?: TableVerticalAlign;
  textColorToken?: TableColorToken;
  backgroundColorToken?: TableColorToken;
}

/**
 * Definição de Célula no Table Core.
 * Cada célula possui identificador estável único e coordenadas (rowId, columnId).
 * Células cobertas por merges são explicitadas via `coveredBy`.
 */
export interface TableCellModel {
  id: string;                      // Identificador estável da célula
  rowId: string;                   // Referência à linha correspondente
  columnId: string;                // Referência à coluna correspondente
  content: TableCellContent;       // Conteúdo tipado
  colSpan?: number;                // Span horizontal (>= 1, default 1)
  rowSpan?: number;                // Span vertical (>= 1, default 1)
  coveredBy?: string;              // Se coberta por uma âncora, armazena o cellId da âncora
  styleOverride?: TableCellStyleOverride;
}

/**
 * Identificadores dos Presets de Apresentação canônicos.
 */
export type TablePresetId =
  | 'presys_clean_technical'
  | 'dense_spec_matrix'
  | 'model_comparison'
  | 'parameter_value';

export type TableDensityToken = 'compact' | 'regular' | 'spacious';
export type TableBorderToken = 'all' | 'horizontal_only' | 'outer_only' | 'none';
export type TableStripeToken = 'none' | 'subtle_zebra' | 'high_contrast_zebra';

/**
 * Especificação de largura total da tabela (Discriminated Union estrita).
 */
export type TableWidthSpec =
  | { mode: 'auto_fill' }
  | { mode: 'fixed_mm'; widthMm: number };

/**
 * Configuração de Apresentação da Tabela (Desacoplada dos dados).
 * Usa tokens semânticos e unidades em mm, sem classes CSS arbitrárias.
 */
export interface TablePresentationModel {
  presetId: TablePresetId;
  density: TableDensityToken;
  borderStyle: TableBorderToken;
  stripeStyle: TableStripeToken;
  headerBackgroundToken: TableColorToken;   // Token semântico de cor tipado
  headerTextColorToken: TableColorToken;    // Token semântico de cor de texto tipado
  fontScale: 'compact' | 'normal' | 'large';
  tableWidth: TableWidthSpec;               // Especificação discriminada da largura total
}

/**
 * Política de Paginação da Tabela em páginas A4.
 */
export interface TablePaginationPolicy {
  allowRowSplit: boolean;          // Invariante: Nunca cortar linha ao meio
  repeatHeaderOnBreak: boolean;    // Repetir cabeçalhos em folhas seguintes
  keepHeaderWithFirstRow: boolean; // Evitar cabeçalho órfão no fim da página
  minOrphanRows: number;           // Mínimo de linhas para permitir continuação
}

/**
 * Modelo Canônico Raiz do Table Core V2.
 */
export interface TableCoreModel {
  id: string;                      // Identificador estável da tabela
  schemaVersion: TableSchemaVersion;
  title?: string;
  columns: TableColumnModel[];
  rows: TableRowModel[];
  cells: Record<string, TableCellModel>; // Chave composta indexada: getCellKey(rowId, columnId)
  presentation: TablePresentationModel;
  paginationPolicy: TablePaginationPolicy;
}

/**
 * Retorna a chave canônica e determinística de indexação de uma célula na matriz.
 * Utiliza codificação de coordenadas prefixadas com comprimento para garantir
 * total ausência de colisões de delimitadores (Collision-Safe Cell Key Contract).
 * Exemplo: rowId="a::b", colId="c" -> "r4:a::b|c1:c"
 */
export function getCellKey(rowId: string, columnId: string): string {
  if (!rowId || !columnId) {
    throw new Error(`Coordenadas de célula não podem ser vazias: rowId="${rowId}", columnId="${columnId}"`);
  }
  return `r${rowId.length}:${rowId}|c${columnId.length}:${columnId}`;
}

/**
 * Faz o parse reversível de uma chave canônica de célula.
 */
export function parseCellKey(key: string): { rowId: string; columnId: string } | null {
  if (!key.startsWith('r')) return null;
  const colIndex = key.indexOf('|c');
  if (colIndex === -1) return null;

  const rowPart = key.slice(1, colIndex);
  const colPart = key.slice(colIndex + 2);

  const rowColon = rowPart.indexOf(':');
  const colColon = colPart.indexOf(':');
  if (rowColon === -1 || colColon === -1) return null;

  const rowLen = parseInt(rowPart.slice(0, rowColon), 10);
  const colLen = parseInt(colPart.slice(0, colColon), 10);
  if (isNaN(rowLen) || isNaN(colLen)) return null;

  const rowId = rowPart.slice(rowColon + 1);
  const columnId = colPart.slice(colColon + 1);

  if (rowId.length !== rowLen || columnId.length !== colLen) return null;

  return { rowId, columnId };
}
