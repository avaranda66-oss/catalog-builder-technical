import { z } from 'zod';
import { StructuralSectionData, StructuralSectionDataSchema } from './canvas-layout.schema';

export * from './canvas-layout.schema';
export * from './canvas-layout.engine';

export const BlockTypeSchema = z.enum([
  'text',
  'image',
  'table',
  'box',
  'hero_banner',
  'features_list',
  'specs_table',
  'electrical_table',
  'accessories_table',
  'ordering_codes',
  'image_gallery',
  'contact_footer',
  'custom_table',
  'additel_two_col_hero',
  'fluke_header',
  'inserts_visual',
  'multi_mode_calibrator',
  'full_page_cover',
  'bottom_header',
  'matrix_spec_table',
  'software_connectivity',
  'structural_section'
]);
export type BlockType = z.infer<typeof BlockTypeSchema>;

export interface BlockPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export type CanvasLayerType = 'text' | 'image' | 'shape' | 'line' | 'badge';

export interface CanvasLayer {
  id: string;
  type: CanvasLayerType;
  label: string;
  x: number; // 0 a 100%
  y: number; // 0 a 100%
  width?: number; // em % ou px
  height?: number; // em px
  zIndex: number;
  visible: boolean;
  locked?: boolean;
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold' | 'black';
  fontFamily?: 'sans' | 'mono' | 'serif';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: 'normal' | 'wide' | 'widest';
  textTransform?: 'none' | 'uppercase' | 'capitalize';
  lineHeight?: 'tight' | 'normal' | 'relaxed';
  imageUrl?: string;
  assetId?: string;
  legacyUrl?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  padding?: number;
}

export interface TableColumnConfig {
  id?: string;
  key: string;
  label: string;
  visible?: boolean;
  width?: number;
  isCustom?: boolean;
  type?: 'text' | 'number' | 'badge';
}

export interface CatalogCellBinding {
  sourceKind: 'product_metadata' | 'pim_datum' | 'dataset' | 'legacy';
  productId: string;
  semanticKey: string;
  moduleKey?: string;
  datasetId?: string;
  bindingMode: 'live' | 'snapshot' | 'review_required';
  snapshot?: any; // TableCellLiteralContent
  sourceRevision?: number;
  stale?: boolean;
}

export interface CatalogTableRow {
  id: string;
  productRefId?: string;
  localOverrides?: Record<string, string>;
  cellBindings?: Record<string, CatalogCellBinding>;
  customNotes?: string;
  order?: number;
}

export interface FeatureItem {
  id: string;
  title: string;
  description?: string;
  icon?: string;
}

export interface OrderingSegment {
  id: string;
  code: string;
  name: string;
  options?: string[];
}

export interface ContentBlock {
  id: string;
  type: BlockType;
  position?: BlockPosition;
  style?: Record<string, any>;
  badgeText?: string;
  title?: string;
  subtitle?: string;
  textContent?: string;
  assetId?: string;
  imageUrl?: string;
  legacyUrl?: string;
  imageCaption?: string;
  images?: { assetId?: string; url: string; caption?: string }[];
  tableColumns?: TableColumnConfig[];
  tableRows?: CatalogTableRow[];
  features?: FeatureItem[];
  orderingSegments?: OrderingSegment[];
  contactInfo?: {
    companyName?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    logoAssetId?: string;
    logoUrl?: string;
  };
  customData?: Record<string, any>;
  structuralData?: StructuralSectionData;
}

export type PageType = 'cover' | 'technical' | 'custom' | 'presentation';

export interface CatalogPage {
  id: string;
  pageNumber: number;
  pageType?: PageType;
  title?: string;
  blocks: ContentBlock[];
}

export type MutationKind =
  | 'ADD_BLOCK'
  | 'REMOVE_BLOCK'
  | 'UPDATE_BLOCK'
  | 'REORDER_BLOCKS'
  | 'ADD_PAGE'
  | 'REMOVE_PAGE'
  | 'REORDER_PAGES'
  | 'SET_TITLE'
  | 'SET_SUBTITLE'
  | 'SET_THEME'
  | 'EDIT_TEXT'
  | 'LOAD_PRESET'
  | 'CREATE_COPY'
  | 'ADD_TABLE_ROW'
  | 'REMOVE_TABLE_ROW'
  | 'UPDATE_TABLE_CELL'
  | 'RESTORE_TABLE_CELL'
  | 'ADD_TABLE_COLUMN'
  | 'REMOVE_TABLE_COLUMN'
  | 'RENAME_TABLE_COLUMN'
  | 'UPDATE_LEGEND'
  | 'UPDATE_FEATURE'
  | 'UPDATE_ORDERING_CODE'
  | 'UPDATE_CANVAS_LAYER'
  | 'MANUAL_EDIT';

export interface MutationMetadata {
  kind: MutationKind;
  clientInstanceId: string;
  targetId?: string; // blockId or pageId
  targetPageId?: string;
  targetRowId?: string;
  fieldKey?: string;
  summary: string;
  timestamp: string;
}

export interface CatalogTranslationMeta {
  sourceCatalogId?: string;
  sourceCatalogVersion?: number;
  sourceContentHash?: string;
  sourceLocale?: string;
  targetLocale?: string;
  provider?: string;
  model?: string;
  translationEngineVersion?: string;
  glossaryVersion?: string;
  translatedAt?: string;
  coverage?: number;
  layoutQaStatus?: 'pending' | 'passed' | 'warning' | 'error';
  humanEdited?: boolean;
}

export interface Catalog {
  id: string;
  title: string;
  subtitle?: string;
  themeId: string;
  pages: CatalogPage[];
  sourceLocale?: string;
  locale?: string;
  translationMeta?: CatalogTranslationMeta;
  localizedSystemStrings?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  version: number;
  lastMutation?: MutationMetadata;
  [key: string]: any;
}

export interface CatalogPreset {
  id: string;
  name: string;
  description: string;
  category?: 'layout_template' | 'official_product_catalog';
  isSystem?: boolean;
  catalog: Catalog;
  version?: number;
  createdAt: string;
  updatedAt?: string;
}

// =========================================================================
// ZOD SCHEMAS (Para validação em runtime)
// =========================================================================

export const CanvasLayerSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'image', 'shape', 'line', 'badge']),
  label: z.string().default('Camada'),
  x: z.number().min(0).max(100).default(5),
  y: z.number().min(0).max(100).default(5),
  width: z.number().optional(),
  height: z.number().optional(),
  zIndex: z.number().int().default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().optional().default(false),
  content: z.string().optional().default(''),
  fontSize: z.number().min(8).max(120).optional().default(16),
  fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold', 'black']).optional().default('normal'),
  fontFamily: z.enum(['sans', 'mono', 'serif']).optional().default('sans'),
  color: z.string().optional().default('#000000'),
  textAlign: z.enum(['left', 'center', 'right']).optional().default('left'),
  letterSpacing: z.enum(['normal', 'wide', 'widest']).optional().default('normal'),
  textTransform: z.enum(['none', 'uppercase', 'capitalize']).optional().default('none'),
  lineHeight: z.enum(['tight', 'normal', 'relaxed']).optional().default('normal'),
  imageUrl: z.string().optional().default(''),
  assetId: z.string().optional(),
  legacyUrl: z.string().optional(),
  objectFit: z.enum(['cover', 'contain', 'fill']).optional().default('cover'),
  backgroundColor: z.string().optional().default('transparent'),
  borderColor: z.string().optional().default('transparent'),
  borderWidth: z.number().optional().default(0),
  borderRadius: z.number().optional().default(0),
  opacity: z.number().min(0).max(100).optional().default(100),
  padding: z.number().optional().default(0)
});

export const BlockPositionSchema = z.object({
  x: z.number().min(0).default(0),
  y: z.number().min(0).default(0),
  width: z.number().positive().default(714),
  height: z.number().positive().default(100),
  zIndex: z.number().int().default(1)
});

export const TableColumnConfigSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  label: z.string(),
  visible: z.boolean().optional().default(true),
  width: z.number().optional(),
  isCustom: z.boolean().optional().default(false),
  type: z.enum(['text', 'number', 'badge']).optional().default('text')
});

export const CatalogCellBindingSchema = z.object({
  sourceKind: z.enum(['product_metadata', 'pim_datum', 'dataset', 'legacy']),
  productId: z.string(),
  semanticKey: z.string(),
  moduleKey: z.string().optional(),
  datasetId: z.string().optional(),
  bindingMode: z.enum(['live', 'snapshot', 'review_required']).default('live'),
  snapshot: z.any().optional(),
  sourceRevision: z.number().int().positive().optional(),
  stale: z.boolean().optional()
});

export const CatalogTableRowSchema = z.object({
  id: z.string(),
  productRefId: z.string().optional().default(''),
  localOverrides: z.record(z.string()).optional().default({}),
  cellBindings: z.record(CatalogCellBindingSchema).optional().default({}),
  customNotes: z.string().optional().default(''),
  order: z.number().int().optional().default(0)
});

export const FeatureItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional().default(''),
  icon: z.string().optional().default('CheckCircle2')
});

export const OrderingSegmentSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  options: z.array(z.string()).optional().default([])
});

export const ContentBlockSchema = z.object({
  id: z.string(),
  type: BlockTypeSchema,
  position: BlockPositionSchema.optional(),
  style: z.record(z.any()).optional(),
  badgeText: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  textContent: z.string().optional(),
  assetId: z.string().optional(),
  imageUrl: z.string().optional(),
  legacyUrl: z.string().optional(),
  imageCaption: z.string().optional(),
  images: z.array(z.object({
    assetId: z.string().optional(),
    url: z.string(),
    caption: z.string().optional()
  })).optional(),
  tableColumns: z.array(TableColumnConfigSchema).optional(),
  tableRows: z.array(CatalogTableRowSchema).optional(),
  features: z.array(FeatureItemSchema).optional(),
  orderingSegments: z.array(OrderingSegmentSchema).optional(),
  contactInfo: z.object({
    companyName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    address: z.string().optional(),
    logoAssetId: z.string().optional(),
    logoUrl: z.string().optional()
  }).optional(),
  customData: z.record(z.any()).optional(),
  structuralData: StructuralSectionDataSchema.optional()
});

export const CatalogPageSchema = z.object({
  id: z.string(),
  pageNumber: z.number().int().positive(),
  pageType: z.enum(['cover', 'technical', 'custom', 'presentation']).optional().default('technical'),
  title: z.string().optional().default(''),
  blocks: z.array(ContentBlockSchema).default([])
});

export const CatalogTranslationMetaSchema = z.object({
  sourceCatalogId: z.string().optional(),
  sourceCatalogVersion: z.number().int().optional(),
  sourceContentHash: z.string().optional(),
  sourceLocale: z.string().optional(),
  targetLocale: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  translationEngineVersion: z.string().optional(),
  glossaryVersion: z.string().optional(),
  translatedAt: z.string().datetime().or(z.string()).optional(),
  coverage: z.number().min(0).max(100).optional(),
  layoutQaStatus: z.enum(['pending', 'passed', 'warning', 'error']).optional(),
  humanEdited: z.boolean().optional()
});

export const CatalogSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional().default(''),
  themeId: z.string().default('default-technical'),
  pages: z.array(CatalogPageSchema).default([]),
  sourceLocale: z.string().optional().default('pt-BR'),
  locale: z.string().optional().default('pt-BR'),
  translationMeta: CatalogTranslationMetaSchema.optional(),
  localizedSystemStrings: z.record(z.string()).optional(),
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()),
  version: z.number().int().default(1)
}).passthrough();

export const CatalogPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['layout_template', 'official_product_catalog']).optional().default('layout_template'),
  isSystem: z.boolean().optional().default(false),
  catalog: CatalogSchema,
  version: z.number().int().optional().default(1),
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()).optional()
});

export type EditorDocumentContext =
  | {
      kind: 'catalog';
      catalogId: string;
    }
  | {
      kind: 'template';
      templateId: string;
    };

export function generateUniqueCatalogTitle(baseTitle: string, existingTitles: string[]): string {
  const titleSet = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  if (!titleSet.has(baseTitle.trim().toLowerCase())) {
    return baseTitle;
  }
  const cleanBase = baseTitle.replace(/ \(Cópia( \d+)?\)$/, '');
  let candidate = `${cleanBase} (Cópia)`;
  if (!titleSet.has(candidate.toLowerCase())) {
    return candidate;
  }
  let index = 2;
  while (titleSet.has(`${cleanBase} (Cópia ${index})`.toLowerCase())) {
    index++;
  }
  return `${cleanBase} (Cópia ${index})`;
}

/**
 * Resolução defensiva de locale do documento na ordem canônica (Fase 3A.4A):
 * 1. catalog.locale
 * 2. catalog.translationMeta?.targetLocale
 * 3. catalog.sourceLocale
 * 4. Fallback legado documentado: 'pt-BR'
 */
export function resolveDocumentLocale(catalog: Partial<Catalog> | null | undefined): string {
  if (!catalog) return 'pt-BR';
  if (typeof catalog.locale === 'string' && catalog.locale.trim()) {
    return catalog.locale.trim();
  }
  if (
    catalog.translationMeta &&
    typeof catalog.translationMeta.targetLocale === 'string' &&
    catalog.translationMeta.targetLocale.trim()
  ) {
    return catalog.translationMeta.targetLocale.trim();
  }
  if (typeof catalog.sourceLocale === 'string' && catalog.sourceLocale.trim()) {
    return catalog.sourceLocale.trim();
  }
  return 'pt-BR';
}

export interface StructuralDelta {
  hasChanges: boolean;
  removedPages: string[];
  addedPages: string[];
  removedBlocks: Array<{ pageId: string; blockId: string; blockType?: string }>;
  addedBlocks: Array<{ pageId: string; blockId: string; blockType?: string }>;
  changedBlocks: Array<{ pageId: string; blockId: string }>;
}

export function analyzeCatalogStructuralDelta(
  local: Catalog | null,
  remote: Catalog | null
): StructuralDelta {
  if (!local || !remote) {
    return {
      hasChanges: true,
      removedPages: [],
      addedPages: [],
      removedBlocks: [],
      addedBlocks: [],
      changedBlocks: []
    };
  }

  const localPages = local.pages || [];
  const remotePages = remote.pages || [];

  const localPageIds = new Set(localPages.map((p) => p.id));
  const remotePageIds = new Set(remotePages.map((p) => p.id));

  const removedPages = localPages.filter((p) => !remotePageIds.has(p.id)).map((p) => p.id);
  const addedPages = remotePages.filter((p) => !localPageIds.has(p.id)).map((p) => p.id);

  const removedBlocks: Array<{ pageId: string; blockId: string; blockType?: string }> = [];
  const addedBlocks: Array<{ pageId: string; blockId: string; blockType?: string }> = [];
  const changedBlocks: Array<{ pageId: string; blockId: string }> = [];

  for (const localPage of localPages) {
    const remotePage = remotePages.find((p) => p.id === localPage.id);
    if (!remotePage) continue;

    const localBlocks = localPage.blocks || [];
    const remoteBlocks = remotePage.blocks || [];
    const remoteBlockMap = new Map(remoteBlocks.map((b) => [b.id, b]));
    const localBlockMap = new Map(localBlocks.map((b) => [b.id, b]));

    for (const lb of localBlocks) {
      if (!remoteBlockMap.has(lb.id)) {
        removedBlocks.push({ pageId: localPage.id, blockId: lb.id, blockType: lb.type });
      } else {
        const rb = remoteBlockMap.get(lb.id)!;
        if (JSON.stringify(lb) !== JSON.stringify(rb)) {
          changedBlocks.push({ pageId: localPage.id, blockId: lb.id });
        }
      }
    }

    for (const rb of remoteBlocks) {
      if (!localBlockMap.has(rb.id)) {
        addedBlocks.push({ pageId: localPage.id, blockId: rb.id, blockType: rb.type });
      }
    }
  }

  const hasChanges =
    removedPages.length > 0 ||
    addedPages.length > 0 ||
    removedBlocks.length > 0 ||
    addedBlocks.length > 0 ||
    changedBlocks.length > 0;

  return {
    hasChanges,
    removedPages,
    addedPages,
    removedBlocks,
    addedBlocks,
    changedBlocks
  };
}
