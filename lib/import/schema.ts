import { z } from 'zod'

const text = z.string().max(20000)
export const SourceFieldSchema = z.object({
  document: z.string().max(255),
  page: z.number().int().positive().nullable(),
  quote: text,
  confidence: z.enum(['verbatim', 'unverified']),
  sheet: z.string().max(255).optional(),
  row: z.number().int().positive().optional(),
}).strict()

export const ImportedDataSchema = z.object({
  marketing: z.object({
    title: text.optional(), subtitle: text.optional(), overview: text.optional(),
    features: z.array(text).max(100).optional(), images: z.array(z.string().url()).max(30).optional(),
  }).strict().optional(),
  specs: z.array(z.object({ param: text, value: text }).strict()).max(500).default([]),
  electrical: z.array(z.object({ signal: text, range: text, resolution: text, accuracy: text, note: text.optional() }).strict()).max(500).default([]),
  general: z.array(z.object({ param: text, desc: text }).strict()).max(500).default([]),
  accessories: z.array(z.object({ code: text, description: text, type: z.enum(['Standard', 'Optional']) }).strict()).max(500).default([]),
  metadata: z.record(z.string(), text).optional(),
  source: z.object({
    kind: z.enum(['pdf', 'spreadsheet']), document: z.string().max(255),
    importedAt: z.string(), status: z.literal('pending_review'),
    missingFields: z.array(z.string()), fields: z.record(z.string(), SourceFieldSchema),
  }).strict(),
}).strict()

export const ImportedProductSchema = z.object({
  sku: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(500),
  family: z.string().trim().max(200),
  data: ImportedDataSchema,
}).strict()

export type ImportedProduct = z.infer<typeof ImportedProductSchema>
export type ImportedData = z.infer<typeof ImportedDataSchema>
export type SourceField = z.infer<typeof SourceFieldSchema>

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}
