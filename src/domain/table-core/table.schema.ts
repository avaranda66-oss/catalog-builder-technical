// src/domain/table-core/table.schema.ts
// Table Core V2: Zod runtime validation schemas.
// Garante conformidade tipada, rejeitando dados corrompidos ou malformados.

import { z } from 'zod';

export const TableHorizontalAlignSchema = z.enum(['left', 'center', 'right']);
export const TableVerticalAlignSchema = z.enum(['top', 'middle', 'bottom']);

export const ColumnWidthModeSchema = z.enum(['fixed_mm', 'auto', 'weighted']);

export const ColumnWidthSpecSchema = z.object({
  mode: ColumnWidthModeSchema,
  widthMm: z.number().positive('Largura da coluna em mm deve ser maior que zero').optional(),
  weight: z.number().positive('Peso da coluna deve ser positivo').optional()
}).refine(
  (spec) => {
    if (spec.mode === 'fixed_mm') {
      return typeof spec.widthMm === 'number' && spec.widthMm > 0;
    }
    return true;
  },
  { message: 'Modo fixed_mm exige widthMm estritamente positivo' }
);

export const TableColumnModelSchema = z.object({
  id: z.string().min(1, 'ID da coluna não pode ser vazio'),
  semanticKey: z.string().min(1, 'semanticKey da coluna é obrigatória'),
  defaultLabel: z.string().default(''),
  widthSpec: ColumnWidthSpecSchema,
  align: TableHorizontalAlignSchema.default('left'),
  isCustom: z.boolean().optional()
});

export const TableRowKindSchema = z.enum(['data', 'header', 'footer', 'divider']);

export const TableRowModelSchema = z.object({
  id: z.string().min(1, 'ID da linha não pode ser vazio'),
  kind: TableRowKindSchema.default('data'),
  minHeightMm: z.number().positive().optional(),
  isHeader: z.boolean().optional()
});

export const TableCellLiteralContentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string()
  }),
  z.object({
    kind: z.literal('number'),
    value: z.number(),
    format: z.object({
      decimals: z.number().int().min(0).max(10).optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional()
    }).optional()
  }),
  z.object({
    kind: z.literal('value_unit'),
    amount: z.number(),
    unit: z.string().min(1, 'Unidade é obrigatória em value_unit'),
    qualifier: z.enum(['±', '≤', '≥', '<', '>', 'typ.', 'max.', 'min.']).optional()
  }),
  z.object({
    kind: z.literal('badge'),
    text: z.string().min(1),
    variant: z.enum(['neutral', 'success', 'warning', 'info', 'critical']).default('neutral')
  }),
  z.object({
    kind: z.literal('asset_reference'),
    assetId: z.string().min(1, 'assetId é obrigatório'),
    caption: z.string().optional(),
    altText: z.string().optional()
  }),
  z.object({
    kind: z.literal('empty')
  })
]);

export const TableBindingModeSchema = z.enum(['literal', 'live', 'snapshot', 'review_required']);

export const TableCellBoundContentSchema = z.object({
  kind: z.literal('datum_reference'),
  productId: z.string().min(1, 'productId é obrigatório no binding'),
  moduleKey: z.string().optional(),
  datumKey: z.string().min(1, 'datumKey é obrigatória'),
  sourceRevision: z.number().int().positive().optional(),
  snapshot: TableCellLiteralContentSchema.optional(),
  bindingMode: TableBindingModeSchema.default('live')
});

export const TableCellContentSchema = z.union([
  TableCellLiteralContentSchema,
  TableCellBoundContentSchema
]);

export const TableCellStyleOverrideSchema = z.object({
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: TableHorizontalAlignSchema.optional(),
  verticalAlign: TableVerticalAlignSchema.optional(),
  textColor: z.string().optional(),
  backgroundColor: z.string().optional()
});

export const TableCellModelSchema = z.object({
  id: z.string().min(1, 'ID da célula não pode ser vazio'),
  rowId: z.string().min(1, 'rowId da célula é obrigatório'),
  columnId: z.string().min(1, 'columnId da célula é obrigatório'),
  content: TableCellContentSchema,
  colSpan: z.number().int().min(1).default(1),
  rowSpan: z.number().int().min(1).default(1),
  coveredBy: z.string().optional(),
  styleOverride: TableCellStyleOverrideSchema.optional()
});

export const TablePresetIdSchema = z.enum([
  'presys_clean_technical',
  'dense_spec_matrix',
  'model_comparison',
  'parameter_value'
]);

export const TablePresentationModelSchema = z.object({
  presetId: TablePresetIdSchema.default('presys_clean_technical'),
  density: z.enum(['compact', 'regular', 'spacious']).default('regular'),
  borderStyle: z.enum(['all', 'horizontal_only', 'outer_only', 'none']).default('all'),
  stripeStyle: z.enum(['none', 'subtle_zebra', 'high_contrast_zebra']).default('none'),
  headerBackgroundToken: z.string().default('slate_800'),
  headerTextColorToken: z.string().default('white'),
  fontScale: z.enum(['compact', 'normal', 'large']).default('normal'),
  tableWidthMode: z.enum(['auto_fill', 'fixed_mm']).default('auto_fill'),
  fixedTableWidthMm: z.number().positive().optional()
});

export const TablePaginationPolicySchema = z.object({
  allowRowSplit: z.boolean().default(false),
  repeatHeaderOnBreak: z.boolean().default(true),
  keepHeaderWithFirstRow: z.boolean().default(true),
  minOrphanRows: z.number().int().min(1).default(1)
});

export const TableCoreModelSchema = z.object({
  id: z.string().min(1, 'ID da tabela é obrigatório'),
  schemaVersion: z.literal(1),
  title: z.string().optional(),
  columns: z.array(TableColumnModelSchema).min(1, 'A tabela deve possuir ao menos 1 coluna'),
  rows: z.array(TableRowModelSchema),
  cells: z.record(TableCellModelSchema),
  presentation: TablePresentationModelSchema,
  paginationPolicy: TablePaginationPolicySchema
});
