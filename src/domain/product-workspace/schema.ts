// src/domain/product-workspace/schema.ts
// Strict Zod schemas for Mega Product Workspace Layouts, Semantic Descriptors, and Staging Drafts.
// Enforces schemaVersion: 1, strict field checking, size/visibility tokens, revision independence, and referential integrity.
// Zero explicit any.

import { z } from 'zod';
import {
  SEMANTIC_KEY_REGEX,
  TechnicalValueSchema,
  UnitCodeSchema,
  EvidenceSchema
} from '../product-workbook/schema';

// ============================================================================
// 1. SEMANTIC DESCRIPTOR SCHEMA
// ============================================================================

export const SemanticDescriptorSchema = z
  .object({
    canonicalKey: z.string().regex(SEMANTIC_KEY_REGEX, {
      message: 'canonicalKey deve seguir o padrão segmentado minúsculo (ex: metrology.temperature.range)'
    }),
    displayLabel: z.string().min(1, 'displayLabel não pode ser vazio').max(150),
    aliases: z.array(z.string().min(1).max(100)),
    description: z.string().max(500).optional(),
    localeLabels: z.record(z.string(), z.string()).optional(),
    deprecatedAliases: z.array(z.string().min(1).max(100)).optional()
  })
  .strict();

// ============================================================================
// 2. WORKSPACE TABLE SCHEMAS
// ============================================================================

export const WorkspaceTableCellDefSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('datum_ref'),
      datumId: z.string().min(1, 'datumId não pode ser vazio')
    })
    .strict(),
  z
    .object({
      type: z.literal('dataset_cell_ref'),
      datasetId: z.string().min(1, 'datasetId não pode ser vazio'),
      rowId: z.string().min(1, 'rowId não pode ser vazio'),
      columnId: z.string().min(1, 'columnId não pode ser vazio')
    })
    .strict(),
  z
    .object({
      type: z.literal('editorial_literal'),
      value: z.string().max(1000),
      notes: z.string().max(500).optional()
    })
    .strict()
]);

export const WorkspaceTableColumnDefSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(100),
    headerType: z.enum(['text', 'quantity', 'status']).optional(),
    unit: UnitCodeSchema.optional(),
    width: z.string().optional(),
    align: z.enum(['left', 'center', 'right']).optional()
  })
  .strict();

export const WorkspaceTableRowDefSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(150),
    group: z.string().max(100).optional(),
    order: z.number().int().nonnegative()
  })
  .strict();

export const WorkspaceTechnicalTableDefSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(150),
    description: z.string().max(500).optional(),
    columns: z.array(WorkspaceTableColumnDefSchema).min(1, 'Tabela deve ter pelo menos uma coluna'),
    rows: z.array(WorkspaceTableRowDefSchema),
    cells: z.record(z.string(), WorkspaceTableCellDefSchema),
    metadata: z.record(z.string(), z.string()).optional()
  })
  .strict();

// ============================================================================
// 3. WORKSPACE BLOCK SCHEMAS (WITH SIZE & VISIBILITY PRESENTATION TOKENS)
// ============================================================================

export const WorkspaceBlockSizeSchema = z.enum(['small', 'medium', 'large', 'full']);
export const WorkspaceBlockVisibilitySchema = z.enum(['visible', 'hidden']);

export const FactGridBlockDefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('fact_grid'),
    size: WorkspaceBlockSizeSchema.optional(),
    visibility: WorkspaceBlockVisibilitySchema.optional(),
    title: z.string().max(100).optional(),
    datumIds: z.array(z.string().min(1)),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional()
  })
  .strict();

export const DatumListBlockDefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('datum_list'),
    size: WorkspaceBlockSizeSchema.optional(),
    visibility: WorkspaceBlockVisibilitySchema.optional(),
    title: z.string().max(100).optional(),
    datumIds: z.array(z.string().min(1))
  })
  .strict();

export const TechnicalTableBlockDefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('technical_table'),
    size: WorkspaceBlockSizeSchema.optional(),
    visibility: WorkspaceBlockVisibilitySchema.optional(),
    tableDef: WorkspaceTechnicalTableDefSchema
  })
  .strict();

export const DatasetViewBlockDefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('dataset_view'),
    size: WorkspaceBlockSizeSchema.optional(),
    visibility: WorkspaceBlockVisibilitySchema.optional(),
    datasetId: z.string().min(1),
    customTitle: z.string().max(150).optional(),
    visibleColumnIds: z.array(z.string()).optional()
  })
  .strict();

export const TextNoteBlockDefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('text_note'),
    size: WorkspaceBlockSizeSchema.optional(),
    visibility: WorkspaceBlockVisibilitySchema.optional(),
    title: z.string().max(150).optional(),
    content: z.string().max(5000),
    calloutVariant: z.enum(['info', 'warning', 'tip', 'editorial']).optional()
  })
  .strict();

export const SourceGroupBlockDefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('source_group'),
    size: WorkspaceBlockSizeSchema.optional(),
    visibility: WorkspaceBlockVisibilitySchema.optional(),
    title: z.string().max(150).optional(),
    sourceDocumentIds: z.array(z.string().min(1))
  })
  .strict();

export const DividerBlockDefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('divider'),
    size: WorkspaceBlockSizeSchema.optional(),
    visibility: WorkspaceBlockVisibilitySchema.optional(),
    spacing: z.enum(['small', 'medium', 'large']).optional()
  })
  .strict();

export const WorkspaceBlockDefSchema = z.discriminatedUnion('kind', [
  FactGridBlockDefSchema,
  DatumListBlockDefSchema,
  TechnicalTableBlockDefSchema,
  DatasetViewBlockDefSchema,
  TextNoteBlockDefSchema,
  SourceGroupBlockDefSchema,
  DividerBlockDefSchema
]);

// ============================================================================
// 4. WORKSPACE SECTION & LAYOUT V1 SCHEMAS
// ============================================================================

export const WorkspaceSectionDefSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1, 'Título da seção é obrigatório').max(150),
    description: z.string().max(500).optional(),
    blockIds: z.array(z.string().min(1)),
    order: z.number().int().nonnegative(),
    collapsed: z.boolean().optional(),
    icon: z.string().optional()
  })
  .strict();

export const WorkspaceDisplayOverrideSchema = z
  .object({
    customLabel: z.string().max(150).optional(),
    customDescription: z.string().max(500).optional()
  })
  .strict();

export const WorkspaceLayoutV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    productId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    title: z.string().min(1).max(150),
    description: z.string().max(500).optional(),
    sections: z.array(WorkspaceSectionDefSchema),
    blocks: z.record(z.string(), WorkspaceBlockDefSchema),
    displayOverrides: z.record(z.string(), WorkspaceDisplayOverrideSchema).optional(),
    semanticDescriptors: z.record(z.string(), SemanticDescriptorSchema).optional(),
    metadata: z.record(z.string(), z.string()).optional()
  })
  .strict()
  .superRefine((layout, ctx) => {
    // Validação de integridade referencial interna: cada blockId em cada seção deve existir em blocks
    for (const section of layout.sections) {
      for (const blockId of section.blockIds) {
        if (!layout.blocks[blockId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Seção "${section.title}" referencia blockId inexistente: "${blockId}"`,
            path: ['sections', section.id, 'blockIds']
          });
        }
      }
    }
  });

// ============================================================================
// 5. STAGING DRAFT SCHEMAS (STRICT 1:1 WITH TYPESCRIPT CONTRACTS)
// ============================================================================

export const DatumChangeDraftSchema = z
  .object({
    datumId: z.string().min(1),
    semanticKey: z.string().regex(SEMANTIC_KEY_REGEX),
    oldValue: TechnicalValueSchema,
    newValue: TechnicalValueSchema,
    reason: z.string().max(500).optional(),
    evidence: z.array(EvidenceSchema).optional(),
    stagedAt: z.string()
  })
  .strict();

export const WorkspaceEditDraftSchema = z
  .object({
    productId: z.string().min(1),
    stagedDatumChanges: z.record(z.string(), DatumChangeDraftSchema),
    stagedLayoutChanges: z.record(z.string(), z.unknown()).optional()
  })
  .strict();
