// src/domain/table-core/table.schema.ts
// Table Core V2: Zod runtime validation schemas com strictness total.
// Garante conformidade tipada, rejeitando dados corrompidos ou malformados.
// Zero explicit any.

import { z } from 'zod';
import {
  TableHorizontalAlignSchema,
  TableVerticalAlignSchema,
  TableCellLiteralContentSchema
} from '../table-values';

export {
  TableHorizontalAlignSchema,
  TableVerticalAlignSchema,
  TableCellLiteralContentSchema
};

/**
 * Schema de ColumnWidthSpec como Discriminated Union estrita.
 * Proíbe estritamente campos cruzados irrelevantes (ex: auto com widthMm, fixed sem widthMm, etc.).
 */
export const ColumnWidthSpecSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('auto')
  }).strict(),
  z.object({
    mode: z.literal('fixed_mm'),
    widthMm: z.number().positive('Largura da coluna em mm deve ser maior que zero')
  }).strict(),
  z.object({
    mode: z.literal('weighted'),
    weight: z.number().positive('Peso da coluna deve ser positivo')
  }).strict()
]);

export const TableColumnModelSchema = z.object({
  id: z.string().min(1, 'ID da coluna não pode ser vazio'),
  semanticKey: z.string().min(1, 'semanticKey da coluna é obrigatória'),
  defaultLabel: z.string().default(''),
  widthSpec: ColumnWidthSpecSchema,
  align: TableHorizontalAlignSchema.default('left'),
  isCustom: z.boolean().optional()
}).strict();

export const TableRowKindSchema = z.enum(['data', 'header', 'footer', 'divider', 'section']);

export const TableRowModelSchema = z.object({
  id: z.string().min(1, 'ID da linha não pode ser vazio'),
  kind: TableRowKindSchema.default('data'),
  minHeightMm: z.number().positive().optional(),
  isHeader: z.boolean().optional()
}).strict();

export const TableBindingModeSchema = z.enum(['live', 'snapshot', 'review_required']);

export const TableCellBoundContentSchema = z.discriminatedUnion('bindingMode', [
  z.object({
    kind: z.literal('datum_reference'),
    productId: z.string().min(1, 'productId é obrigatório no binding'),
    moduleKey: z.string().optional(),
    datasetId: z.string().optional(),
    datumKey: z.string().min(1, 'datumKey é obrigatória'),
    sourceRevision: z.number().int().nonnegative().optional(),
    sourceOwnerKind: z.enum(['product', 'family']).optional(),
    sourceOwnerId: z.string().optional(),
    bindingMode: z.literal('live'),
    snapshot: TableCellLiteralContentSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal('datum_reference'),
    productId: z.string().min(1, 'productId é obrigatório no binding'),
    moduleKey: z.string().optional(),
    datasetId: z.string().optional(),
    datumKey: z.string().min(1, 'datumKey é obrigatória'),
    sourceRevision: z.number().int().nonnegative().optional(),
    sourceOwnerKind: z.enum(['product', 'family']).optional(),
    sourceOwnerId: z.string().optional(),
    bindingMode: z.literal('snapshot'),
    snapshot: TableCellLiteralContentSchema // Obrigatório para modo snapshot
  }).strict(),
  z.object({
    kind: z.literal('datum_reference'),
    productId: z.string().min(1, 'productId é obrigatório no binding'),
    moduleKey: z.string().optional(),
    datasetId: z.string().optional(),
    datumKey: z.string().min(1, 'datumKey é obrigatória'),
    sourceRevision: z.number().int().nonnegative().optional(),
    sourceOwnerKind: z.enum(['product', 'family']).optional(),
    sourceOwnerId: z.string().optional(),
    bindingMode: z.literal('review_required'),
    snapshot: TableCellLiteralContentSchema.optional()
  }).strict()
]);

export const TableCellContentSchema = z.union([
  TableCellLiteralContentSchema,
  TableCellBoundContentSchema
]);

import {
  HexColor,
  TableColorValue
} from './table.types';

export const TableColorTokenSchema = z.enum([
  'transparent',
  'surface',
  'surface_subtle',
  'surface_header',
  'text_primary',
  'text_secondary',
  'text_muted',
  'text_on_header',
  'brand_primary',
  'brand_secondary',
  'brand_navy',
  'technical_blue',
  'accent',
  'success',
  'warning',
  'critical',
  'white',
  'slate_900',
  'slate_800',
  'slate_200',
  'slate_100'
]);

export const HexColorSchema: z.ZodType<HexColor, z.ZodTypeDef, string> = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Formato de cor hexadecimal inválido (#RGB ou #RRGGBB)')
  .transform((val): HexColor => {
    const raw = val.toLowerCase();
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` as HexColor;
    }
    return raw as HexColor;
  }) as unknown as z.ZodType<HexColor, z.ZodTypeDef, string>;

export const TableColorValueSchema: z.ZodType<TableColorValue, z.ZodTypeDef, string> = z.union([
  TableColorTokenSchema,
  HexColorSchema
]);

export const TableCellStyleOverrideSchema = z.object({
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: TableHorizontalAlignSchema.optional(),
  verticalAlign: TableVerticalAlignSchema.optional(),
  textColorToken: TableColorValueSchema.optional(),
  backgroundColorToken: TableColorValueSchema.optional(),
  borderEmphasis: z.enum(['none', 'bottom_thick', 'all_subtle', 'accent']).optional(),
  fontScale: z.enum(['compact', 'normal', 'large']).optional(),
  paddingToken: z.enum(['dense', 'normal', 'spacious']).optional()
}).strict();

export const TableCellModelSchema = z.object({
  id: z.string().min(1, 'ID da célula não pode ser vazio'),
  rowId: z.string().min(1, 'rowId da célula é obrigatório'),
  columnId: z.string().min(1, 'columnId da célula é obrigatório'),
  content: TableCellContentSchema,
  colSpan: z.number().int().min(1).default(1),
  rowSpan: z.number().int().min(1).default(1),
  coveredBy: z.string().optional(),
  styleOverride: TableCellStyleOverrideSchema.optional()
}).strict();

export const TablePresetIdSchema = z.enum([
  'presys_clean_technical',
  'dense_spec_matrix',
  'model_comparison',
  'parameter_value',
  'presys_dark_navy',
  'presys_blue_comparison',
  'gray_technical',
  'corporate_slate',
  'precision_blue',
  'family_header',
  'minimal_light',
  'high_contrast'
]);

export const TableWidthSpecSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('auto_fill')
  }).strict(),
  z.object({
    mode: z.literal('fixed_mm'),
    widthMm: z.number().positive('Largura fixa da tabela deve ser maior que zero')
  }).strict()
]);

export const TableRowStyleOverrideSchema = z.object({
  backgroundToken: TableColorValueSchema.optional(),
  textColorToken: TableColorValueSchema.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  borderEmphasis: z.enum(['none', 'bottom_thick', 'all_subtle', 'accent']).optional(),
  minHeightMm: z.number().positive().optional()
}).strict();

export const TableColumnStyleOverrideSchema = z.object({
  backgroundToken: TableColorValueSchema.optional(),
  textColorToken: TableColorValueSchema.optional(),
  align: TableHorizontalAlignSchema.optional(),
  bold: z.boolean().optional()
}).strict();

export const TablePresentationModelSchema = z.object({
  presetId: TablePresetIdSchema.default('presys_clean_technical'),
  density: z.enum(['compact', 'regular', 'spacious']).default('regular'),
  borderStyle: z.enum(['all', 'horizontal_only', 'outer_only', 'none']).default('all'),
  stripeStyle: z.enum(['none', 'subtle_zebra', 'high_contrast_zebra']).default('none'),
  headerBackgroundToken: TableColorValueSchema.default('slate_900'),
  headerTextColorToken: TableColorValueSchema.default('white'),
  sectionBackgroundToken: TableColorValueSchema.optional(),
  sectionTextColorToken: TableColorValueSchema.optional(),
  bodyBackgroundToken: TableColorValueSchema.optional(),
  fontScale: z.enum(['compact', 'normal', 'large']).default('normal'),
  tableWidth: TableWidthSpecSchema.default({ mode: 'auto_fill' }),
  cellPadding: z.enum(['dense', 'normal', 'spacious']).optional(),
  headerPadding: z.enum(['dense', 'normal', 'spacious']).optional(),
  lineHeight: z.enum(['tight', 'normal', 'relaxed']).optional(),
  borderWidth: z.enum(['none', 'thin', 'medium']).optional(),
  outerBorderWidth: z.enum(['none', 'thin', 'thick']).optional(),
  borderColorToken: TableColorValueSchema.optional(),
  cornerRoundness: z.enum(['none', 'small', 'medium']).optional(),
  rowStyleOverrides: z.record(TableRowStyleOverrideSchema).optional(),
  columnStyleOverrides: z.record(TableColumnStyleOverrideSchema).optional(),
  cellStyleOverrides: z.record(TableCellStyleOverrideSchema).optional()
}).strict();

export const TablePresentationTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  presentation: TablePresentationModelSchema
}).strict();

export const TablePaginationPolicySchema = z.object({
  allowRowSplit: z.boolean().default(false),
  repeatHeaderOnBreak: z.boolean().default(true),
  keepHeaderWithFirstRow: z.boolean().default(true),
  minOrphanRows: z.number().int().min(1).default(1)
}).strict();

export const TableCoreModelSchema = z.object({
  id: z.string().min(1, 'ID da tabela é obrigatório'),
  schemaVersion: z.literal(1),
  title: z.string().optional(),
  columns: z.array(TableColumnModelSchema).min(1, 'A tabela deve possuir ao menos 1 coluna'),
  rows: z.array(TableRowModelSchema),
  cells: z.record(TableCellModelSchema),
  presentation: TablePresentationModelSchema,
  paginationPolicy: TablePaginationPolicySchema
}).strict();
