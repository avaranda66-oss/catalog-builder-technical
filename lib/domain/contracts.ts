import { z } from 'zod'

const NonEmptyId = z.string().trim().min(1, 'Identificador obrigatório')
const Timestamp = z.string().trim().min(1, 'Data/hora obrigatória')

export const ProductStatusSchema = z.enum(['draft', 'review', 'approved', 'published', 'archived'])
export const CatalogStatusSchema = z.enum(['draft', 'review', 'approved', 'published'])

export const ProductDataSchema = z.record(z.string(), z.unknown()).default({})

export const ProductRecordSchema = z.object({
  id: NonEmptyId,
  catalog_id: NonEmptyId,
  sku: z.string().trim().min(1, 'SKU obrigatório').max(80),
  name: z.string().trim().min(1, 'Nome obrigatório').max(240),
  family: z.string().trim().min(1).max(80),
  status: ProductStatusSchema,
  sort_order: z.number().int().nonnegative(),
  data: ProductDataSchema,
  version: z.number().int().positive(),
  updated_by: z.string().nullable(),
  updated_at: Timestamp,
  created_at: Timestamp,
}).strict()

export const MediaAssetSchema = z.object({
  id: NonEmptyId,
  product_id: NonEmptyId,
  storage_path: z.string().trim().min(1, 'Caminho do arquivo obrigatório'),
  role: z.enum(['hero', 'gallery', 'diagram', 'certificate', 'variation', 'other']),
  alt_text: z.string().trim().max(240).nullable().optional(),
  mime_type: z.string().trim().max(120).nullable().optional(),
  byte_size: z.number().int().nonnegative().nullable().optional(),
  checksum: z.string().trim().max(128).nullable().optional(),
  sort_order: z.number().int().nonnegative(),
  created_at: Timestamp,
}).strict()

export const PageSectionContractSchema = z.object({
  id: NonEmptyId,
  type: z.enum([
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
  ]),
  title: z.string().trim().min(1, 'Título do bloco obrigatório').max(240),
  config: z.record(z.string(), z.unknown()).default({}),
  content: z.unknown().nullable(),
  style: z.record(z.string(), z.unknown()).optional(),
  sort_order: z.number().int().nonnegative(),
  visible: z.boolean(),
}).strict()

export const CatalogPageContractSchema = z.object({
  id: NonEmptyId,
  title: z.string().trim().min(1, 'Título da página obrigatório').max(240),
  sort_order: z.number().int().nonnegative(),
  visible: z.boolean(),
  sections: z.array(PageSectionContractSchema),
}).strict()

export const CatalogDocumentSchema = z.object({
  id: NonEmptyId,
  name: z.string().trim().min(1, 'Nome do catálogo obrigatório').max(240),
  locale: z.string().trim().min(2).max(16),
  status: CatalogStatusSchema,
  template_key: z.string().trim().min(1).max(120),
  brand: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
  pages: z.array(CatalogPageContractSchema),
  updated_by: z.string().nullable(),
  updated_at: Timestamp,
  created_at: Timestamp,
}).strict()

export const ChangeProposalSchema = z.object({
  path: z.string().trim().min(1),
  fieldLabel: z.string().trim().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().trim().max(500).optional(),
  accepted: z.boolean().default(false),
}).strict()

export const ProposalSchema = z.object({
  id: NonEmptyId,
  source: z.enum(['manual', 'import', 'ai']),
  summary: z.string().trim().min(1).max(500),
  product_id: NonEmptyId.nullable(),
  catalog_id: NonEmptyId,
  changes: z.array(ChangeProposalSchema).min(1, 'A proposta precisa conter uma mudança'),
  created_by: NonEmptyId.nullable(),
  created_at: Timestamp,
}).strict()

export const ReviewSchema = z.object({
  id: NonEmptyId,
  catalog_id: NonEmptyId,
  version: z.number().int().positive(),
  status: z.enum(['pending', 'approved', 'rejected']),
  author_id: NonEmptyId,
  reviewer_id: NonEmptyId.nullable(),
  note: z.string().trim().max(1000).nullable().optional(),
  created_at: Timestamp,
  decided_at: Timestamp.nullable().optional(),
}).strict()

export type ProductRecord = z.infer<typeof ProductRecordSchema>
export type MediaAsset = z.infer<typeof MediaAssetSchema>
export type PageSectionContract = z.infer<typeof PageSectionContractSchema>
export type CatalogPageContract = z.infer<typeof CatalogPageContractSchema>
export type CatalogDocument = z.infer<typeof CatalogDocumentSchema>
export type ChangeProposal = z.infer<typeof ChangeProposalSchema>
export type Proposal = z.infer<typeof ProposalSchema>
export type Review = z.infer<typeof ReviewSchema>

export type ContractValidation<T> =
  | { success: true; data: T; errors?: never }
  | { success: false; data?: never; errors: string[] }

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${path}: ${issue.message}`
  })
}

export function validateProduct(input: unknown): ContractValidation<ProductRecord> {
  const result = ProductRecordSchema.safeParse(input)
  return result.success ? { success: true, data: result.data } : { success: false, errors: formatIssues(result.error) }
}

export function validateDocument(input: unknown): ContractValidation<CatalogDocument> {
  const result = CatalogDocumentSchema.safeParse(input)
  return result.success ? { success: true, data: result.data } : { success: false, errors: formatIssues(result.error) }
}

export function validateProposal(input: unknown): ContractValidation<Proposal> {
  const result = ProposalSchema.safeParse(input)
  return result.success ? { success: true, data: result.data } : { success: false, errors: formatIssues(result.error) }
}
