// src/domain/table-values/table-values.schema.ts
// Schemas Zod de validação estrita para valores literais de células tabulares (Emenda 3).
// Módulo neutro com zero ciclo de dependência.
// Zero explicit any.

import { z } from 'zod';

export const TableHorizontalAlignSchema = z.enum(['left', 'center', 'right']);
export const TableVerticalAlignSchema = z.enum(['top', 'middle', 'bottom']);

export const TableCellEmptyContentSchema = z.object({
  kind: z.literal('empty')
}).strict();

export const TableCellTextContentSchema = z.object({
  kind: z.literal('text'),
  text: z.string()
}).strict();

export const TableCellNumberContentSchema = z.object({
  kind: z.literal('number'),
  value: z.number(),
  format: z.object({
    decimals: z.number().int().min(0).max(10).optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional()
  }).strict().optional()
}).strict();

export const TableCellValueUnitContentSchema = z.object({
  kind: z.literal('value_unit'),
  amount: z.number(),
  unit: z.string().min(1, 'Unidade é obrigatória em value_unit'),
  qualifier: z.string().optional()
}).strict();

export const TableCellBadgeContentSchema = z.object({
  kind: z.literal('badge'),
  label: z.string().min(1),
  variant: z.enum(['neutral', 'success', 'warning', 'info', 'critical']).default('neutral')
}).strict();

export const TableCellAssetRefContentSchema = z.object({
  kind: z.literal('asset_reference'),
  assetId: z.string().min(1, 'assetId é obrigatório'),
  caption: z.string().optional(),
  altText: z.string().optional(),
  targetWidthMm: z.number().optional(),
  targetHeightMm: z.number().optional(),
  fit: z.enum(['contain', 'cover']).optional(),
  align: TableHorizontalAlignSchema.optional(),
  paddingMm: z.number().optional()
}).strict();

export const TableCellRangeContentSchema = z.object({
  kind: z.literal('range'),
  lower: z.number().optional(),
  upper: z.number().optional(),
  unit: z.string().optional(),
  lowerInclusive: z.boolean().optional(),
  upperInclusive: z.boolean().optional(),
  prefix: z.string().optional()
}).strict();

export const TableCellBooleanContentSchema = z.object({
  kind: z.literal('boolean'),
  value: z.boolean(),
  format: z.enum(['yes_no', 'sim_nao', 'check_cross', 'dot', 'badge']).optional()
}).strict();

export const TableCellEnumContentSchema = z.object({
  kind: z.literal('enum'),
  code: z.string().min(1),
  label: z.string().optional()
}).strict();

export const TableCellTechnicalTokenContentSchema = z.object({
  kind: z.literal('technical_token'),
  token: z.string().min(1),
  category: z.string().optional()
}).strict();

export const TableCellUnknownContentSchema = z.object({
  kind: z.literal('unknown'),
  reason: z.string().optional()
}).strict();

export const TableCellLiteralContentSchema = z.discriminatedUnion('kind', [
  TableCellEmptyContentSchema,
  TableCellTextContentSchema,
  TableCellNumberContentSchema,
  TableCellValueUnitContentSchema,
  TableCellBadgeContentSchema,
  TableCellAssetRefContentSchema,
  TableCellRangeContentSchema,
  TableCellBooleanContentSchema,
  TableCellEnumContentSchema,
  TableCellTechnicalTokenContentSchema,
  TableCellUnknownContentSchema
]);
