// src/domain/table-core/table.types.ts
// Table Core V2: Contratos de tipos estritos do domínio documental puro.
// Zero dependência de React, Zustand ou infraestrutura de banco de dados.

export type TableSchemaVersion = 1;

/**
 * Alinhamento horizontal do conteúdo da coluna ou célula.
 */
export type TableHorizontalAlign = 'left' | 'center' | 'right';

/**
 * Alinhamento vertical do conteúdo da célula.
 */
export type TableVerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Modo de largura da coluna física.
 * - fixed_mm: Largura explícita em milímetros (autoridade física A4).
 * - auto: Largura distribuída proporcionalmente no espaço restante.
 * - weighted: Peso relativo (flex factor) para distribuição proporcional.
 */
export type ColumnWidthMode = 'fixed_mm' | 'auto' | 'weighted';

export interface ColumnWidthSpec {
  mode: ColumnWidthMode;
  widthMm?: number;
  weight?: number;
}

/**
 * Definição da Coluna no Table Core.
 * O ID é imutável e gerado na criação; semanticKey é o identificador técnico
 * para binding ou tradução, totalmente desacoplado do label visual.
 */
export interface TableColumnModel {
  id: string;                      // UUID estável único da coluna
  semanticKey: string;             // Chave técnica (ex: 'range', 'accuracy', 'code')
  defaultLabel: string;            // Rótulo padrão (conteúdo traduzível)
  widthSpec: ColumnWidthSpec;      // Especificação geométrica em mm
  align: TableHorizontalAlign;     // Alinhamento padrão da coluna
  isCustom?: boolean;              // Indica coluna adicionada pelo usuário
}

/**
 * Tipo semântico da linha na tabela.
 */
export type TableRowKind = 'data' | 'header' | 'footer' | 'divider';

/**
 * Definição da Linha no Table Core.
 * O ID é imutável e gerado na criação; não depende do índice no array.
 */
export interface TableRowModel {
  id: string;                      // UUID estável único da linha
  kind: TableRowKind;              // Papel estrutural da linha
  minHeightMm?: number;            // Altura mínima opcional em mm
  isHeader?: boolean;              // Flag de cabeçalho (repetível em paginação)
}

/**
 * Célula literal: valor físico imediato registrado na tabela.
 */
export type TableCellLiteralContent =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number; format?: { decimals?: number; prefix?: string; suffix?: string } }
  | { kind: 'value_unit'; amount: number; unit: string; qualifier?: '±' | '≤' | '≥' | '<' | '>' | 'typ.' | 'max.' | 'min.' }
  | { kind: 'badge'; text: string; variant?: 'neutral' | 'success' | 'warning' | 'info' | 'critical' }
  | { kind: 'asset_reference'; assetId: string; caption?: string; altText?: string }
  | { kind: 'empty' };

/**
 * Modo de sincronização para células vinculadas a dados de biblioteca.
 */
export type TableBindingMode = 'literal' | 'live' | 'snapshot' | 'review_required';

/**
 * Célula vinculada (Placeholder para futura integração com Product Workbook).
 * Desacoplado do banco de dados existente.
 */
export interface TableCellBoundContent {
  kind: 'datum_reference';
  productId: string;
  moduleKey?: string;
  datumKey: string;
  sourceRevision?: number;
  snapshot?: TableCellLiteralContent;
  bindingMode: TableBindingMode;
}

/**
 * União estrita de conteúdos possíveis para uma célula.
 * Rejeita explicitamente HTML arbitrário e JSON blobs genéricos.
 */
export type TableCellContent = TableCellLiteralContent | TableCellBoundContent;

/**
 * Sobrescrita de estilo visual pontual na célula.
 */
export interface TableCellStyleOverride {
  bold?: boolean;
  italic?: boolean;
  align?: TableHorizontalAlign;
  verticalAlign?: TableVerticalAlign;
  textColor?: string;
  backgroundColor?: string;
}

/**
 * Definição de Célula no Table Core.
 * Cada célula possui ID único estável e coordenadas (rowId, columnId).
 * Células cobertas por merges são explicitadas via `coveredBy`.
 */
export interface TableCellModel {
  id: string;                      // UUID estável da célula
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
 * Configuração de Apresentação da Tabela (Desacoplada dos dados).
 * Usa tokens semânticos e unidades em mm, sem classes CSS de frameworks.
 */
export interface TablePresentationModel {
  presetId: TablePresetId;
  density: TableDensityToken;
  borderStyle: TableBorderToken;
  stripeStyle: TableStripeToken;
  headerBackgroundToken: string;   // Token de cor (ex: 'slate_800', 'brand_primary', 'white')
  headerTextColorToken: string;     // Token de cor de texto
  fontScale: 'compact' | 'normal' | 'large';
  tableWidthMode: 'auto_fill' | 'fixed_mm';
  fixedTableWidthMm?: number;      // Largura total se tableWidthMode === 'fixed_mm'
}

/**
 * Política de Paginação da Tabela em páginas A4.
 */
export interface TablePaginationPolicy {
  allowRowSplit: boolean;          // Default false: nunca cortar linha ao meio
  repeatHeaderOnBreak: boolean;    // Default true: repetir cabeçalhos em folhas seguintes
  keepHeaderWithFirstRow: boolean; // Default true: evitar cabeçalho órfão no fim da página
  minOrphanRows: number;           // Mínimo de linhas para permitir continuação
}

/**
 * Modelo Canônico Raiz do Table Core V2.
 */
export interface TableCoreModel {
  id: string;                      // UUID estável da tabela
  schemaVersion: TableSchemaVersion;
  title?: string;
  columns: TableColumnModel[];
  rows: TableRowModel[];
  cells: Record<string, TableCellModel>; // Chave composta indexada: `${rowId}::${columnId}`
  presentation: TablePresentationModel;
  paginationPolicy: TablePaginationPolicy;
}
