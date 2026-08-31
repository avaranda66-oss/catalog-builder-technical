import { z } from 'zod'

// ============================================================================
// SECTION STYLE SCHEMA (Runtime Validation)
// ============================================================================

export const SectionStyleSchema = z.object({
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  accentColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidthPx: z.number().min(0).max(10).optional(),
  borderStyle: z.enum(['solid', 'dashed', 'none']).optional(),
  fontSizePx: z.number().min(6).max(32).optional(),
  titleFontSizePx: z.number().min(8).max(48).optional(),
  paddingMm: z.number().min(0).max(50).optional(),
  marginBottomMm: z.number().min(0).max(100).optional(),
  widthPercent: z.union([z.literal(100), z.literal(50), z.literal(33)]).optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  showBorder: z.boolean().optional(),
  hideHeader: z.boolean().optional(),
}).strict()

export type ValidatedSectionStyle = z.infer<typeof SectionStyleSchema>

// ============================================================================
// PAGE SECTION SCHEMA
// ============================================================================

export const SectionTypeEnum = z.enum([
  'hero_banner',
  'features_list',
  'specs_table',
  'comparison_grid',
  'image_gallery',
  'single_image',
  'text_block',
  'accessories_table',
  'ordering_codes',
  'contact_footer',
  'blank_spacer',
  'electrical_table',
  'general_specs_table',
  'custom_table',
])

export const PageSectionSchema = z.object({
  id: z.string().min(1, 'ID da seção é obrigatório'),
  type: SectionTypeEnum,
  title: z.string().min(1, 'Título da seção é obrigatório'),
  config: z.record(z.string(), z.any()).default({}),
  content: z.any().optional(),
  style: SectionStyleSchema.optional(),
  sort_order: z.number().int().nonnegative().default(0),
  visible: z.boolean().default(true),
})

export type ValidatedPageSection = z.infer<typeof PageSectionSchema>

// ============================================================================
// CATALOG PAGE SCHEMA
// ============================================================================

export const CatalogPageSchema = z.object({
  id: z.string().min(1, 'ID da página é obrigatório'),
  title: z.string().min(1, 'Título da página é obrigatório'),
  sort_order: z.number().int().nonnegative().default(0),
  visible: z.boolean().default(true),
  sections: z.array(PageSectionSchema).default([]),
})

export type ValidatedCatalogPage = z.infer<typeof CatalogPageSchema>

// ============================================================================
// DESIGN TOKENS SCHEMA
// ============================================================================

export const DesignTokensSchema = z.object({
  colors: z.record(z.string(), z.string()),
  fonts: z.record(z.string(), z.string()),
  spacing: z.record(z.string(), z.number()),
})

// ============================================================================
// CONTACT INFO SCHEMA
// ============================================================================

export const ContactInfoSchema = z.object({
  companyName: z.string().default('Empresa'),
  logoUrl: z.string().default(''),
  website: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  address: z.string().optional(),
})

// ============================================================================
// CATALOG PRESET SCHEMA
// ============================================================================

export const CatalogPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  design_tokens: DesignTokensSchema,
  contact: ContactInfoSchema,
  default_pages: z.array(CatalogPageSchema),
  is_system: z.boolean().default(false),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ValidatedCatalogPreset = z.infer<typeof CatalogPresetSchema>

// ============================================================================
// HELPER VALIDATORS WITH FRIENDLY ERROR FORMATTING
// ============================================================================

export interface ValidationResult<T> {
  success: boolean
  data?: T
  errors?: string[]
}

export function validateCatalogPage(page: unknown): ValidationResult<ValidatedCatalogPage> {
  const result = CatalogPageSchema.safeParse(page)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  }
}

export function validatePageSection(section: unknown): ValidationResult<ValidatedPageSection> {
  const result = PageSectionSchema.safeParse(section)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  }
}
