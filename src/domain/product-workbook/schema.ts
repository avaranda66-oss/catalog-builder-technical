// src/domain/product-workbook/schema.ts
// Strict Zod schemas for Product Workbook validation and serialization.
// Enforces schemaVersion: 1, strict field checking, and semantic key grammars.
// Zero explicit any.

import { z } from 'zod';
import {
  ProductWorkbook,
  SourceDocument,
  ProductKnowledgeBundle
} from './types';

/**
 * Regular expression validating lowercase ASCII segmented semantic keys.
 * Pattern: segment.segment (e.g. "metrology.temperature.range", "custom.field.v1")
 * Minimum 2 segments, each starting with lowercase letter, containing lowercase letters, digits, and underscores.
 */
export const SEMANTIC_KEY_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * Validates semantic key syntax.
 */
export function isValidSemanticKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  return SEMANTIC_KEY_REGEX.test(key);
}

/**
 * Technical Unit Code Schema.
 */
export const UnitCodeSchema = z
  .string()
  .min(1, 'Código de unidade não pode ser vazio')
  .max(30, 'Código de unidade não pode exceder 30 caracteres')
  .refine(
    (u) => !/[<>{}\\]/.test(u),
    'Unidade contém caracteres inválidos ou inseguros'
  );

export const QuantityQualifierSchema = z.enum([
  'exact',
  'approx',
  'min',
  'max',
  'nominal',
  'typical'
]);

export const TechnicalValueSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    value: z.string()
  }).strict(),

  z.object({
    type: z.literal('number'),
    value: z.number()
  }).strict(),

  z.object({
    type: z.literal('boolean'),
    value: z.boolean()
  }).strict(),

  z.object({
    type: z.literal('quantity'),
    amount: z.number(),
    unit: UnitCodeSchema,
    qualifier: QuantityQualifierSchema.optional()
  }).strict(),

  z.object({
    type: z.literal('range'),
    lower: z.number().optional(),
    upper: z.number().optional(),
    unit: UnitCodeSchema,
    lowerInclusive: z.boolean().optional(),
    upperInclusive: z.boolean().optional()
  }).strict(),

  z.object({
    type: z.literal('enum'),
    code: z.string().min(1, 'Código do enum é obrigatório'),
    label: z.string().optional()
  }).strict(),

  z.object({
    type: z.literal('technical_token'),
    token: z.string().min(1, 'Token técnico é obrigatório'),
    category: z.string().optional()
  }).strict(),

  z.object({
    type: z.literal('asset_reference'),
    assetId: z.string().min(1, 'ID do asset é obrigatório'),
    mimeType: z.string().optional(),
    label: z.string().optional()
  }).strict(),

  z.object({
    type: z.literal('product_reference'),
    targetProductId: z.string().min(1, 'ID do produto alvo é obrigatório'),
    relationKind: z.string().optional()
  }).strict(),

  z.object({
    type: z.literal('unknown'),
    reason: z.string().optional()
  }).strict()
]).superRefine((val, ctx) => {
  if (val.type === 'range') {
    if (val.lower === undefined && val.upper === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Faixa técnica deve definir ao menos um limite (inferior ou superior)'
      });
    } else if (val.lower !== undefined && val.upper !== undefined && val.lower > val.upper) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Limite inferior da faixa não pode ser superior ao limite superior'
      });
    }
  }
});

export const SourceDocumentTypeSchema = z.enum([
  'manual',
  'datasheet',
  'certificate',
  'drawing',
  'standard',
  'engineering_note',
  'website',
  'other'
]);

export const SourceDocumentSchema = z.object({
  id: z.string().min(1, 'ID do documento fonte é obrigatório'),
  title: z.string().min(1, 'Título do documento fonte é obrigatório'),
  documentType: SourceDocumentTypeSchema,
  revision: z.string().optional(),
  language: z.string().optional(),
  publicationDate: z.string().optional(),
  fileReference: z.string().optional(),
  externalUrl: z.string().url().optional(),
  checksum: z.string().optional(),
  metadata: z.record(z.string()).optional()
}).strict();

export const EvidenceSchema = z.object({
  id: z.string().min(1, 'ID da evidência é obrigatório'),
  sourceDocumentId: z.string().min(1, 'ID do documento de origem é obrigatório'),
  page: z.union([z.string(), z.number()]).optional(),
  section: z.string().optional(),
  locator: z.string().optional(),
  observedValue: TechnicalValueSchema.optional(),
  excerpt: z.string().max(500, 'Excerto deve ser conciso (máx 500 chars)').optional(),
  capturedAt: z.string().optional(),
  capturedBy: z.string().optional(),
  notes: z.string().optional()
}).strict();

export const CanonicalDecisionSchema = z.object({
  status: z.enum(['selected', 'synthetic', 'verified']),
  selectedEvidenceId: z.string().optional(),
  rationale: z.string().optional(),
  decidedAt: z.string().optional(),
  decidedBy: z.string().optional()
}).strict();

export const DatumStatusSchema = z.enum(['draft', 'verified', 'approved', 'deprecated']);

export const TechnicalDatumSchema = z.object({
  id: z.string().min(1, 'ID do dado é obrigatório'),
  semanticKey: z.string().regex(SEMANTIC_KEY_REGEX, 'semanticKey deve seguir padrão namespace.segment'),
  moduleId: z.string().min(1, 'moduleId é obrigatório'),
  label: z.string().min(1, 'Label do dado é obrigatório'),
  description: z.string().optional(),
  localizedLabels: z.record(z.string()).optional(),
  value: TechnicalValueSchema,
  evidence: z.array(EvidenceSchema).default([]),
  canonicalDecision: CanonicalDecisionSchema.optional(),
  status: DatumStatusSchema,
  audit: z.object({
    createdAt: z.string(),
    createdBy: z.string().optional(),
    updatedAt: z.string(),
    updatedBy: z.string().optional()
  }).strict().optional()
}).strict();

export const ModuleKindSchema = z.enum([
  'key_value',
  'matrix',
  'collection',
  'ordering',
  'rich_notes',
  'custom'
]);

export const TechnicalModuleSchema = z.object({
  id: z.string().min(1, 'ID do módulo é obrigatório'),
  semanticKey: z.string().regex(SEMANTIC_KEY_REGEX, 'semanticKey deve seguir padrão namespace.segment'),
  label: z.string().min(1, 'Label do módulo é obrigatório'),
  localizedLabels: z.record(z.string()).optional(),
  kind: ModuleKindSchema,
  order: z.number().int().default(0),
  datumIds: z.array(z.string()).default([]),
  metadata: z.record(z.string()).optional()
}).strict();

export const WorkbookOwnerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('product'),
    id: z.string().min(1, 'ID do produto é obrigatório')
  }).strict(),
  z.object({
    kind: z.literal('family'),
    id: z.string().min(1, 'ID da família é obrigatório')
  }).strict()
]);

export const OverrideModeSchema = z.enum(['override', 'suppress']);

export const InheritedDatumOverrideSchema = z.object({
  targetSemanticKey: z.string().regex(SEMANTIC_KEY_REGEX),
  mode: OverrideModeSchema,
  overriddenValue: TechnicalValueSchema.optional(),
  overriddenStatus: DatumStatusSchema.optional(),
  evidence: z.array(EvidenceSchema).optional(),
  canonicalDecision: CanonicalDecisionSchema.optional(),
  notes: z.string().optional()
}).strict().refine(
  (override) => {
    if (override.mode === 'override') {
      return override.overriddenValue !== undefined;
    }
    return true;
  },
  'Modo override exige definição de overriddenValue'
);

export const ViewPresentationHintSchema = z.object({
  presetRef: z.string().optional(),
  density: z.enum(['compact', 'regular']).optional()
}).strict();

export const ProductDataViewSchema = z.object({
  id: z.string().min(1, 'ID da visão é obrigatório'),
  name: z.string().min(1, 'Nome da visão é obrigatório'),
  description: z.string().optional(),
  moduleIds: z.array(z.string()).optional(),
  datumKeys: z.array(z.string()).default([]),
  ordering: z.array(z.string()).optional(),
  groupingByModule: z.boolean().optional(),
  viewKind: z.enum(['summary', 'spec_matrix', 'ordering', 'comparison', 'custom']).optional(),
  presentationHint: ViewPresentationHintSchema.optional()
}).strict();

export const ProductWorkbookSchema = z.object({
  id: z.string().min(1, 'ID do workbook é obrigatório'),
  schemaVersion: z.literal(1),
  owner: WorkbookOwnerSchema,
  revision: z.number().int().nonnegative('Revisão deve ser um inteiro >= 0'),
  modules: z.array(TechnicalModuleSchema).default([]),
  data: z.record(TechnicalDatumSchema).default({}),
  overrides: z.record(InheritedDatumOverrideSchema).optional(),
  savedViews: z.array(ProductDataViewSchema).optional(),
  metadata: z.record(z.string()).optional()
}).strict();

export const ProductKnowledgeBundleSchema = z.object({
  sources: z.array(SourceDocumentSchema).default([]),
  workbooks: z.array(ProductWorkbookSchema).default([])
}).strict();

/**
 * Validador e parser estrito de ProductWorkbook.
 */
export function parseProductWorkbook(input: unknown): ProductWorkbook {
  return ProductWorkbookSchema.parse(input) as ProductWorkbook;
}

/**
 * Validador e parser estrito de SourceDocument.
 */
export function parseSourceDocument(input: unknown): SourceDocument {
  return SourceDocumentSchema.parse(input) as SourceDocument;
}

/**
 * Validador e parser estrito de ProductKnowledgeBundle.
 */
export function parseProductKnowledgeBundle(input: unknown): ProductKnowledgeBundle {
  return ProductKnowledgeBundleSchema.parse(input) as ProductKnowledgeBundle;
}
