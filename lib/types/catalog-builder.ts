// ============================================================================
// CATALOG BUILDER — Core Types for Dynamic Pages, Sections & Presets
// ============================================================================

// ---------------------------------------------------------------------------
// Section Types — the building blocks that compose each page
// ---------------------------------------------------------------------------

export const SECTION_TYPES = [
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
] as const

export type SectionType = (typeof SECTION_TYPES)[number]

export interface SectionTypeInfo {
  type: SectionType
  label: string
  description: string
  icon: string // Lucide icon name
  defaultConfig: Record<string, unknown>
}

export const SECTION_TYPE_CATALOG: SectionTypeInfo[] = [
  {
    type: 'hero_banner',
    label: 'Banner / Capa',
    description: 'Logo, título principal, subtítulo e imagem hero do produto',
    icon: 'Image',
    defaultConfig: { showLogo: true, showSubtitle: true, showImage: true },
  },
  {
    type: 'features_list',
    label: 'Lista de Destaques',
    description: 'Bullets com os principais recursos e diferenciais',
    icon: 'ListChecks',
    defaultConfig: { maxItems: 8, columns: 1 },
  },
  {
    type: 'text_block',
    label: 'Bloco de Texto',
    description: 'Parágrafo livre de descrição, overview ou notas técnicas',
    icon: 'FileText',
    defaultConfig: { alignment: 'left' },
  },
  {
    type: 'specs_table',
    label: 'Tabela de Especificações',
    description: 'Tabela Parâmetro × Valor para specs técnicas',
    icon: 'Table',
    defaultConfig: { columns: ['Parâmetro', 'Especificação'], showHeader: true },
  },
  {
    type: 'comparison_grid',
    label: 'Tabela Comparativa',
    description: 'Comparação lado a lado entre múltiplos modelos',
    icon: 'Columns3',
    defaultConfig: { models: [] },
  },
  {
    type: 'electrical_table',
    label: 'Tabela de Sinais Elétricos',
    description: 'Sinal, Faixa, Resolução, Exatidão, Notas',
    icon: 'Zap',
    defaultConfig: { columns: ['Sinal', 'Faixa', 'Resolução', 'Exatidão', 'Observação'] },
  },
  {
    type: 'general_specs_table',
    label: 'Especificações Gerais',
    description: 'Tabela simples Parâmetro × Descrição',
    icon: 'Settings',
    defaultConfig: {},
  },
  {
    type: 'image_gallery',
    label: 'Galeria de Imagens',
    description: 'Grid de fotos do produto com legendas opcionais',
    icon: 'GalleryHorizontalEnd',
    defaultConfig: { columns: 3, showCaptions: true },
  },
  {
    type: 'single_image',
    label: 'Foto / Diagrama',
    description: 'Imagem individual ou esquema técnico com legenda',
    icon: 'Image',
    defaultConfig: { maxHeightMm: 60, align: 'center', caption: '' },
  },
  {
    type: 'accessories_table',
    label: 'Tabela de Acessórios',
    description: 'Código, descrição e tipo (Standard/Opcional)',
    icon: 'Package',
    defaultConfig: {},
  },
  {
    type: 'ordering_codes',
    label: 'Código de Encomenda',
    description: 'Blocos visuais para montar o código do pedido',
    icon: 'Barcode',
    defaultConfig: { segments: [] },
  },
  {
    type: 'contact_footer',
    label: 'Rodapé de Contato',
    description: 'Dados de contato, website, telefone, email',
    icon: 'Contact',
    defaultConfig: {},
  },
  {
    type: 'custom_table',
    label: 'Tabela Personalizada',
    description: 'Tabela com colunas e linhas totalmente definidas por você',
    icon: 'Grid3x3',
    defaultConfig: { columns: ['Coluna 1', 'Coluna 2'], rows: [] },
  },
  {
    type: 'blank_spacer',
    label: 'Espaçador',
    description: 'Espaço em branco para ajuste de layout na página',
    icon: 'Minus',
    defaultConfig: { heightMm: 20 },
  },
]

// ---------------------------------------------------------------------------
// Page Section — a block inside a page
// ---------------------------------------------------------------------------

export interface SectionStyle {
  backgroundColor?: string
  textColor?: string
  accentColor?: string
  borderColor?: string
  borderWidthPx?: number
  borderStyle?: 'solid' | 'dashed' | 'none'
  fontSizePx?: number
  titleFontSizePx?: number
  paddingMm?: number
  marginBottomMm?: number
  widthPercent?: number // 100, 50, 33
  align?: 'left' | 'center' | 'right' | 'justify'
  showBorder?: boolean
  hideHeader?: boolean
}

export interface PageSection {
  id: string
  type: SectionType
  title: string
  config: Record<string, unknown>
  /** Data specific to this section instance (rows, text, items, etc.) */
  content: unknown
  style?: SectionStyle
  sort_order: number
  visible: boolean
}

// ---------------------------------------------------------------------------
// Catalog Page — one A4 page in the catalog
// ---------------------------------------------------------------------------

export interface CatalogPage {
  id: string
  title: string
  sort_order: number
  visible: boolean
  sections: PageSection[]
}

// ---------------------------------------------------------------------------
// Design Tokens — visual appearance of the catalog
// ---------------------------------------------------------------------------

export interface DesignTokens {
  colors: {
    primary: string      // Brand primary (e.g. #003366)
    dark: string         // Dark accent (e.g. #001A33)
    accent: string       // Interactive accent (e.g. #2563EB)
    headerBg: string     // Table header background
    headerText: string   // Table header text
    surface: string      // Background surface
    border: string       // Cell borders
    [key: string]: string
  }
  fonts: {
    heading: string
    body: string
    data: string
    [key: string]: string
  }
  spacing: {
    pageMarginMm: number
    sectionGapMm: number
    cellHeightPx: number
    [key: string]: number
  }
}

// ---------------------------------------------------------------------------
// Contact Info — for footer sections
// ---------------------------------------------------------------------------

export interface ContactInfo {
  companyName: string
  logoUrl: string
  website: string
  phone: string
  email: string
  address?: string
  [key: string]: string | undefined
}

// ---------------------------------------------------------------------------
// Catalog Preset — saveable, reusable configuration
// ---------------------------------------------------------------------------

export interface CatalogPreset {
  id: string
  name: string
  description: string
  design_tokens: DesignTokens
  contact: ContactInfo
  default_pages: CatalogPage[]
  is_system: boolean   // true = built-in, cannot delete
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createSectionId(): string {
  return `sec-${crypto.randomUUID()}`
}

export function createPageId(): string {
  return `page-${crypto.randomUUID()}`
}

export function createSection(
  type: SectionType,
  overrides?: Partial<PageSection>
): PageSection {
  const info = SECTION_TYPE_CATALOG.find((s) => s.type === type)
  return {
    id: createSectionId(),
    type,
    title: info?.label || type,
    content: null,
    sort_order: 0,
    visible: true,
    ...overrides,
    config: { ...structuredClone(info?.defaultConfig ?? {}), ...overrides?.config },
  }
}

export function createPage(
  title: string,
  sections: PageSection[] = [],
  overrides?: Partial<CatalogPage>
): CatalogPage {
  return {
    id: createPageId(),
    title,
    sort_order: 0,
    visible: true,
    sections: sections.map((s, i) => ({ ...s, sort_order: i })),
    ...overrides,
  }
}
