import { z } from 'zod';
import { StructuralSectionData, StructuralSectionDataSchema } from './canvas-layout.schema';
import {
  type TableCellLiteralContent,
  TableCellLiteralContentSchema
} from './table-values';

export * from './canvas-layout.schema';
export * from './canvas-layout.engine';
export * from './table-values';

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
  align?: 'left' | 'center' | 'right';
}

export interface CatalogCellBinding {
  sourceKind: 'product_metadata' | 'pim_datum' | 'dataset' | 'legacy';
  productId: string;
  semanticKey: string;
  moduleKey?: string;
  datasetId?: string;
  bindingMode: 'live' | 'snapshot' | 'review_required';
  snapshot?: TableCellLiteralContent;
  sourceRevision?: number;
  sourceOwnerKind?: 'product' | 'family';
  sourceOwnerId?: string;
  stale?: boolean;
}

export interface CatalogTableRow {
  id: string;
  productRefId?: string;
  localOverrides?: Record<string, string>;
  cellValues?: Record<string, TableCellLiteralContent>;
  cellBindings?: Record<string, CatalogCellBinding>;
  customNotes?: string;
  order?: number;
  kind?: 'data' | 'header' | 'footer' | 'divider' | 'section';
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

export type CatalogSourceDiagnosticCode = 'MALFORMED_PAGE_BLOCKS';

export type CatalogSourceValueType = 'string' | 'number' | 'object' | 'boolean' | 'bigint' | 'function' | 'symbol';

/**
 * Provenance retained when persisted/source catalog data cannot satisfy a runtime invariant.
 * Diagnostics live beside catalog metadata and never masquerade as editable ContentBlock data.
 */
export interface CatalogSourceDiagnostic {
  code: CatalogSourceDiagnosticCode;
  pageId: string;
  pageNumber: number;
  sourcePath: string;
  receivedType: CatalogSourceValueType;
  message: string;
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
  layoutFlowMode?: 'smart' | 'manual';
  sourceDiagnostics?: CatalogSourceDiagnostic[];
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

export const CatalogCellBindingBaseSchema = z.object({
  sourceKind: z.enum(['product_metadata', 'pim_datum', 'dataset', 'legacy']),
  productId: z.string().min(1, 'productId cannot be empty'),
  semanticKey: z.string(),
  moduleKey: z.string().optional(),
  datasetId: z.string().optional(),
  bindingMode: z.enum(['live', 'snapshot', 'review_required']).default('live'),
  snapshot: TableCellLiteralContentSchema.optional(),
  sourceRevision: z.number().int().nonnegative().optional(),
  sourceOwnerKind: z.enum(['product', 'family']).optional(),
  sourceOwnerId: z.string().optional(),
  stale: z.boolean().optional()
});

export const CatalogCellBindingSchema = CatalogCellBindingBaseSchema.superRefine((val, ctx) => {
  if (val.bindingMode === 'snapshot' && !val.snapshot) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Snapshot is mandatory when bindingMode is "snapshot"',
      path: ['snapshot']
    });
  }
  if (val.sourceKind === 'dataset' && (!val.datasetId || val.datasetId.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'datasetId is required and cannot be empty for dataset sourceKind',
      path: ['datasetId']
    });
  }
  if (val.sourceKind === 'pim_datum' && (!val.semanticKey || val.semanticKey.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'semanticKey cannot be empty for pim_datum',
      path: ['semanticKey']
    });
  }
});

export const CatalogTableRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['data', 'header', 'footer', 'divider', 'section']).optional(),
  productRefId: z.string().optional().default(''),
  localOverrides: z.record(z.string()).optional().default({}),
  cellValues: z.record(TableCellLiteralContentSchema).optional().default({}),
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

export const CatalogSourceDiagnosticSchema = z.object({
  code: z.literal('MALFORMED_PAGE_BLOCKS'),
  pageId: z.string(),
  pageNumber: z.number().int().positive(),
  sourcePath: z.string(),
  receivedType: z.enum(['string', 'number', 'object', 'boolean', 'bigint', 'function', 'symbol']),
  message: z.string()
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
  sourceDiagnostics: z.array(CatalogSourceDiagnosticSchema).optional(),
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()),
  version: z.number().int().default(1),
  layoutFlowMode: z.enum(['smart', 'manual']).optional().default('smart')
}).passthrough();

export interface CatalogHydrationResult {
  catalog: Catalog;
  diagnostics: CatalogSourceDiagnostic[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isCatalogSourceDiagnostic = (value: unknown): value is CatalogSourceDiagnostic => (
  CatalogSourceDiagnosticSchema.safeParse(value).success
);

const diagnosticKey = (diagnostic: CatalogSourceDiagnostic) => (
  `${diagnostic.code}:${diagnostic.pageId}`
);

const countCatalogPagesById = (catalog: Catalog): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const page of catalog.pages) {
    counts.set(page.id, (counts.get(page.id) ?? 0) + 1);
  }
  return counts;
};

/**
 * A page-scoped block delta is authoritative only while page identity is unique
 * on both sides of the transaction.
 */
export function didCatalogPageBlocksChangeUnambiguously(
  before: Catalog,
  after: Catalog,
  pageId: string
): boolean {
  const previousMatches = before.pages.filter((page) => page.id === pageId);
  const nextMatches = after.pages.filter((page) => page.id === pageId);
  if (previousMatches.length !== 1 || nextMatches.length !== 1) return false;

  try {
    return JSON.stringify(previousMatches[0].blocks) !== JSON.stringify(nextMatches[0].blocks);
  } catch {
    return false;
  }
}

/**
 * Reconciles persisted source provenance against stable runtime page identity.
 * Existing-page diagnostics stay fail-closed unless that exact page was explicitly
 * structurally remediated; diagnostics for removed pages are always discarded.
 */
export function reconcileCatalogSourceDiagnostics(
  catalog: Catalog,
  structurallyRemediatedPageIds: readonly string[] = []
): Catalog {
  const diagnostics = catalog.sourceDiagnostics ?? [];
  if (diagnostics.length === 0) return catalog;

  const pageIdentityCounts = countCatalogPagesById(catalog);
  const remediatedPageIds = new Set(structurallyRemediatedPageIds);
  const unresolvedDiagnostics = diagnostics.filter((diagnostic) => {
    const pageMatchCount = pageIdentityCounts.get(diagnostic.pageId) ?? 0;
    if (pageMatchCount === 0) return false;

    return !(
      pageMatchCount === 1
      &&
      diagnostic.code === 'MALFORMED_PAGE_BLOCKS'
      && remediatedPageIds.has(diagnostic.pageId)
    );
  });

  if (unresolvedDiagnostics.length === diagnostics.length) return catalog;

  return {
    ...catalog,
    sourceDiagnostics: unresolvedDiagnostics.length > 0 ? unresolvedDiagnostics : undefined
  };
}

/**
 * The single persisted/source -> runtime boundary for Catalog page blocks.
 * It deliberately performs only boundary normalization here; full schema validation remains
 * the responsibility of callers such as StorageService.
 */
export function hydrateCatalogSource(source: unknown): CatalogHydrationResult {
  if (!isRecord(source)) {
    throw new TypeError('Catalog hydration requires an object source.');
  }

  const existingDiagnostics = Array.isArray(source.sourceDiagnostics)
    ? source.sourceDiagnostics.filter(isCatalogSourceDiagnostic)
    : [];
  const discoveredDiagnostics: CatalogSourceDiagnostic[] = [];
  const sourcePages = Array.isArray(source.pages) ? source.pages : [];
  const pages = sourcePages.map((rawPage, pageIndex) => {
    if (!isRecord(rawPage)) return rawPage;

    const rawBlocks = rawPage.blocks;
    if (rawBlocks === undefined || rawBlocks === null) {
      return { ...rawPage, blocks: [] };
    }
    if (Array.isArray(rawBlocks)) {
      return rawPage;
    }

    const pageNumber = typeof rawPage.pageNumber === 'number' && Number.isInteger(rawPage.pageNumber) && rawPage.pageNumber > 0
      ? rawPage.pageNumber
      : pageIndex + 1;
    const pageId = typeof rawPage.id === 'string' ? rawPage.id : `page-${pageNumber}`;
    const receivedType = typeof rawBlocks as CatalogSourceValueType;
    discoveredDiagnostics.push({
      code: 'MALFORMED_PAGE_BLOCKS',
      pageId,
      pageNumber,
      sourcePath: `pages[${pageIndex}].blocks`,
      receivedType,
      message: `Página ${pageNumber} continha estrutura de blocos malformada (${receivedType}); o runtime recebeu uma lista vazia segura.`
    });
    return { ...rawPage, blocks: [] };
  });

  const diagnosticsByKey = new Map<string, CatalogSourceDiagnostic>();
  for (const diagnostic of [...existingDiagnostics, ...discoveredDiagnostics]) {
    diagnosticsByKey.set(diagnosticKey(diagnostic), diagnostic);
  }
  const diagnostics = [...diagnosticsByKey.values()];
  const catalog = reconcileCatalogSourceDiagnostics({
    ...source,
    pages,
    ...(diagnostics.length > 0 ? { sourceDiagnostics: diagnostics } : { sourceDiagnostics: undefined })
  } as unknown as Catalog);

  return { catalog, diagnostics: catalog.sourceDiagnostics ?? [] };
}

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
