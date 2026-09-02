import { z } from 'zod';

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
  'software_connectivity'
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

export interface CatalogTableRow {
  id: string;
  productRefId?: string;
  localOverrides?: Record<string, string>;
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
  imageUrl?: string;
  imageCaption?: string;
  images?: { url: string; caption?: string }[];
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
    logoUrl?: string;
  };
  customData?: Record<string, any>;
}

export type PageType = 'cover' | 'technical' | 'custom' | 'presentation';

export interface CatalogPage {
  id: string;
  pageNumber: number;
  pageType?: PageType;
  title?: string;
  blocks: ContentBlock[];
}

export interface Catalog {
  id: string;
  title: string;
  subtitle?: string;
  themeId: string;
  pages: CatalogPage[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CatalogPreset {
  id: string;
  name: string;
  description: string;
  category?: 'layout_template' | 'official_product_catalog';
  isSystem?: boolean;
  catalog: Catalog;
  createdAt: string;
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

export const CatalogTableRowSchema = z.object({
  id: z.string(),
  productRefId: z.string().optional().default(''),
  localOverrides: z.record(z.string()).optional().default({}),
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
  imageUrl: z.string().optional(),
  imageCaption: z.string().optional(),
  images: z.array(z.object({ url: z.string(), caption: z.string().optional() })).optional(),
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
    logoUrl: z.string().optional()
  }).optional(),
  customData: z.record(z.any()).optional()
});

export const CatalogPageSchema = z.object({
  id: z.string(),
  pageNumber: z.number().int().positive(),
  pageType: z.enum(['cover', 'technical', 'custom', 'presentation']).optional().default('technical'),
  title: z.string().optional().default(''),
  blocks: z.array(ContentBlockSchema).default([])
});

export const CatalogSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional().default(''),
  themeId: z.string().default('default-technical'),
  pages: z.array(CatalogPageSchema).default([]),
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()),
  version: z.number().int().default(1)
});

export const CatalogPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['layout_template', 'official_product_catalog']).optional().default('layout_template'),
  isSystem: z.boolean().optional().default(false),
  catalog: CatalogSchema,
  createdAt: z.string().datetime().or(z.string())
});

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
