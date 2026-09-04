// src/domain/table-values/table-values.types.ts
// Módulo neutro de tipos literais de células tabulares (Emenda 3).
// Desacoplado de catalog.schema e table-core para garantir zero dependências circulares.
// Zero explicit any.

export type TableHorizontalAlign = 'left' | 'center' | 'right';
export type TableVerticalAlign = 'top' | 'middle' | 'bottom';

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
 * União discriminada estrita de todos os conteúdos literais que podem ser materializados
 * de forma pura e independente, persistidos em snapshots ou cellValues.
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
