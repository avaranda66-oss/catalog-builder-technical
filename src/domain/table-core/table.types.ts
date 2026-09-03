// src/domain/table-core/table.types.ts
// Tipos Puros de Domínio do Table Core V2.
// Totalmente desacoplado de React, Zustand, DOM e banco de dados.
// Invariante de tipagem estrita: Zero explicit any.

export type TableSchemaVersion = 1;

export type TableHorizontalAlign = 'left' | 'center' | 'right';
export type TableVerticalAlign = 'top' | 'middle' | 'bottom';

export type TableRowKind = 'header' | 'data' | 'footer' | 'divider' | 'section';

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
  fit?: 'contain' | 'cover';
  align?: TableHorizontalAlign;
  paddingMm?: number;
}

export interface TableCellRangeContent {
  kind: 'range';
  lower?: number;
  upper?: number;
  unit?: string;
  lowerInclusive?: boolean;
  upperInclusive?: boolean;
  prefix?: string; // ex: 'ca.', 'ambiente a'
}

export interface TableCellBooleanContent {
  kind: 'boolean';
  value: boolean;
  format?: 'yes_no' | 'sim_nao' | 'check_cross' | 'dot' | 'badge';
}

export interface TableCellEnumContent {
  kind: 'enum';
  code: string;
  label?: string;
}

export interface TableCellTechnicalTokenContent {
  kind: 'technical_token';
  token: string;
  category?: string;
}

export interface TableCellUnknownContent {
  kind: 'unknown';
  reason?: string;
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
  | TableCellAssetRefContent
  | TableCellRangeContent
  | TableCellBooleanContent
  | TableCellEnumContent
  | TableCellTechnicalTokenContent
  | TableCellUnknownContent;

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
      datasetId?: string;
      sourceRevision?: number;
      bindingMode: 'live' | 'review_required';
      snapshot?: TableCellLiteralContent;
    }
  | {
      kind: 'datum_reference';
      productId: string;
      datumKey: string;
      moduleKey?: string;
      datasetId?: string;
      sourceRevision?: number;
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
  borderEmphasis?: 'none' | 'bottom_thick' | 'all_subtle' | 'accent';
  fontScale?: 'compact' | 'normal' | 'large';
  paddingToken?: 'dense' | 'normal' | 'spacious';
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
  | 'parameter_value'
  | 'presys_dark_navy'
  | 'presys_blue_comparison'
  | 'gray_technical'
  | 'corporate_slate';

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
  sectionBackgroundToken?: TableColorToken;
  sectionTextColorToken?: TableColorToken;
  bodyBackgroundToken?: TableColorToken;
  fontScale: 'compact' | 'normal' | 'large';
  tableWidth: TableWidthSpec;               // Especificação discriminada da largura total
  cellPadding?: 'dense' | 'normal' | 'spacious';
  headerPadding?: 'dense' | 'normal' | 'spacious';
  lineHeight?: 'tight' | 'normal' | 'relaxed';
  borderWidth?: 'none' | 'thin' | 'medium';
  outerBorderWidth?: 'none' | 'thin' | 'thick';
  borderColorToken?: TableColorToken;
  cornerRoundness?: 'none' | 'small' | 'medium';
}

/**
 * Template Reutilizável de Apresentação de Tabela.
 * Desacoplado dos dados: Knowledge Dataset != Table Presentation Template.
 */
export interface TablePresentationTemplate {
  id: string;
  name: string;
  description?: string;
  presentation: TablePresentationModel;
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

  const firstColon = key.indexOf(':');
  if (firstColon === -1) return null;

  const rowLen = parseInt(key.slice(1, firstColon), 10);
  if (isNaN(rowLen) || rowLen < 1) return null;

  const rowStart = firstColon + 1;
  const rowEnd = rowStart + rowLen;
  if (key.length < rowEnd + 2) return null;

  const rowId = key.slice(rowStart, rowEnd);

  if (key.slice(rowEnd, rowEnd + 2) !== '|c') return null;

  const colColonIndex = key.indexOf(':', rowEnd + 2);
  if (colColonIndex === -1) return null;

  const colLen = parseInt(key.slice(rowEnd + 2, colColonIndex), 10);
  if (isNaN(colLen) || colLen < 1) return null;

  const colStart = colColonIndex + 1;
  const colEnd = colStart + colLen;
  if (key.length !== colEnd) return null;

  const columnId = key.slice(colStart, colEnd);

  return { rowId, columnId };
}
