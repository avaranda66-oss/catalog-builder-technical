// src/domain/table-core/table.types.ts
// Table Core V2: Contratos de tipos estritos do domínio documental puro.
// Zero dependência de React, Zustand ou infraestrutura de banco de dados.
// Conformidade absoluta: Zero explicit any.

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
 * Modo e especificação de largura de coluna física (Discriminated Union estrita).
 * - auto: Sem largura fixa, distribuída proporcionalmente no espaço restante.
 * - fixed_mm: Largura explícita em milímetros (autoridade física A4).
 * - weighted: Peso relativo (flex factor) para distribuição proporcional.
 */
export type ColumnWidthSpec =
  | { mode: 'auto' }
  | { mode: 'fixed_mm'; widthMm: number }
  | { mode: 'weighted'; weight: number };

/**
 * Definição da Coluna no Table Core.
 * O ID é um identificador estável único; semanticKey é o identificador técnico
 * para binding ou tradução, totalmente desacoplado do label visual.
 */
export interface TableColumnModel {
  id: string;                      // Identificador estável único da coluna
  semanticKey: string;             // Chave técnica única por tabela (ex: 'range', 'accuracy', 'code')
  defaultLabel: string;            // Rótulo padrão (conteúdo traduzível)
  widthSpec: ColumnWidthSpec;      // Especificação geométrica discriminada
  align: TableHorizontalAlign;     // Alinhamento padrão da coluna
  isCustom?: boolean;              // Indica coluna adicionada pelo usuário
}

/**
 * Tipo semântico da linha na tabela.
 */
export type TableRowKind = 'data' | 'header' | 'footer' | 'divider';

/**
 * Definição da Linha no Table Core.
 * O ID é um identificador estável único; não depende do índice no array.
 */
export interface TableRowModel {
  id: string;                      // Identificador estável único da linha
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
 * Nota: 'literal' é proibido aqui pois valores literais pertencem a TableCellLiteralContent.
 */
export type TableBindingMode = 'live' | 'snapshot' | 'review_required';

/**
 * Célula vinculada (Contrato future-facing para integração com Product Workbook).
 * Se bindingMode === 'snapshot', o snapshot é estritamente obrigatório.
 */
export type TableCellBoundContent =
  | {
      kind: 'datum_reference';
      productId: string;
      moduleKey?: string;
      datumKey: string;
      sourceRevision?: number;
      bindingMode: 'live';
      snapshot?: TableCellLiteralContent;
    }
  | {
      kind: 'datum_reference';
      productId: string;
      moduleKey?: string;
      datumKey: string;
      sourceRevision?: number;
      bindingMode: 'snapshot';
      snapshot: TableCellLiteralContent; // Obrigatório quando snapshot
    }
  | {
      kind: 'datum_reference';
      productId: string;
      moduleKey?: string;
      datumKey: string;
      sourceRevision?: number;
      bindingMode: 'review_required';
      snapshot?: TableCellLiteralContent;
    };

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
 * Usa tokens semânticos e unidades em mm, sem classes CSS de frameworks.
 */
export interface TablePresentationModel {
  presetId: TablePresetId;
  density: TableDensityToken;
  borderStyle: TableBorderToken;
  stripeStyle: TableStripeToken;
  headerBackgroundToken: string;   // Token semântico de cor (ex: 'slate_900', 'white')
  headerTextColorToken: string;     // Token semântico de cor de texto
  fontScale: 'compact' | 'normal' | 'large';
  tableWidth: TableWidthSpec;      // Especificação discriminada da largura total
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
  cells: Record<string, TableCellModel>; // Chave composta indexada: `${rowId}::${columnId}`
  presentation: TablePresentationModel;
  paginationPolicy: TablePaginationPolicy;
}
