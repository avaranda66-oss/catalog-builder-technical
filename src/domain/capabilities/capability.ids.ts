// src/domain/capabilities/capability.ids.ts
// Identificadores semânticos estáveis e fechados de capacidades de elementos.
// Rejeita caminhos arbitrários (ex: "customData.foo.bar") em favor de IDs canônicos.

export const CAPABILITY_IDS = {
  // Conteúdo Textual e Estruturado
  CONTENT_TITLE: 'content.title',
  CONTENT_SUBTITLE: 'content.subtitle',
  CONTENT_BODY: 'content.body',
  CONTENT_BADGE: 'content.badge',
  CONTENT_SECONDARY_BADGE: 'content.secondary_badge',
  CONTENT_DESCRIPTION: 'content.description',
  CONTENT_ITEMS: 'content.items',
  CONTENT_MODES: 'content.modes',
  CONTENT_INSERTS: 'content.inserts',
  CONTENT_EXTERNAL_DIAMETER: 'content.external_diameter',
  CONTENT_ORDERING_SEGMENTS: 'content.ordering_segments',
  CONTENT_COMPANY_NAME: 'content.company_name',
  CONTENT_PHONE: 'content.phone',
  CONTENT_EMAIL: 'content.email',
  CONTENT_WEBSITE: 'content.website',
  CONTENT_ADDRESS: 'content.address',

  // Mídia & Ativos
  MEDIA_PRIMARY_ASSET: 'media.primary_asset',
  MEDIA_CAPTION: 'media.caption',
  MEDIA_GALLERY_ITEMS: 'media.gallery_items',

  // Layout & Dimensões
  LAYOUT_WIDTH_MODE: 'layout.width_mode',
  LAYOUT_FIXED_WIDTH_MM: 'layout.fixed_width_mm',
  LAYOUT_COLUMNS: 'layout.columns',
  LAYOUT_GAP: 'layout.gap',
  LAYOUT_PADDING: 'layout.padding',
  LAYOUT_DENSITY: 'layout.density',
  LAYOUT_ALIGNMENT: 'layout.alignment',

  // Aparência & Estilo
  APPEARANCE_BACKGROUND: 'appearance.background',
  APPEARANCE_BORDER: 'appearance.border',
  APPEARANCE_RADIUS: 'appearance.radius',
  APPEARANCE_OVERLAY_OPACITY: 'appearance.overlay_opacity',
  APPEARANCE_THEME_COLOR: 'appearance.theme_color',
  APPEARANCE_BADGE_BG: 'appearance.badge_bg',
  APPEARANCE_GRADIENT: 'appearance.gradient',

  // Dados & Tabelas
  DATA_COLUMNS: 'data.columns',
  DATA_ROWS: 'data.rows',
  DATA_TABLE_FAMILY: 'data.table_family',
  DATA_MATRIX_COLUMNS: 'data.matrix_columns',
  DATA_MATRIX_ROWS: 'data.matrix_rows',

  // Camadas & Filhos Estruturais
  LAYERS_CHILDREN: 'layers.children',
  LAYERS_CANVAS_LAYERS: 'layers.canvas_layers'
} as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[keyof typeof CAPABILITY_IDS];
