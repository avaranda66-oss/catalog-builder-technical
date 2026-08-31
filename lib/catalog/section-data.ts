import type { PageSection, SectionType } from '../types/catalog-builder'
import type { Product } from '../types/database'

export type DataRecord = Record<string, unknown>
export type DataSource = 'product' | 'section'

export function record(value: unknown): DataRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRecord : {}
}

export function rows(value: unknown): DataRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const PRODUCT_BLOCKS = new Set<SectionType>([
  'hero_banner', 'features_list', 'specs_table', 'electrical_table', 'general_specs_table', 'accessories_table',
])

/** Templates contain presentation defaults, never authoritative product values. */
export function sectionDataSource(section: PageSection): DataSource {
  if (section.config.dataSource === 'section' || section.config.dataSource === 'product') return section.config.dataSource
  return PRODUCT_BLOCKS.has(section.type) ? 'product' : 'section'
}

export function sectionProduct(section: PageSection, selected: Product | null, products: Product[]): Product | null {
  const id = section.config.productId
  return typeof id === 'string' && id ? products.find(product => product.id === id) ?? null : selected
}

export function productRows(product: Product | null, type: SectionType): DataRecord[] {
  const data = record(product?.data)
  if (type === 'specs_table') {
    if (Array.isArray(data.specs)) return rows(data.specs)
    return Object.entries(record(data.pressure_specs)).map(([param, value]) => ({ param, value }))
  }
  if (type === 'electrical_table') return rows(data.electrical ?? data.electrical_specs)
  if (type === 'general_specs_table') return rows(data.general ?? data.general_specs)
  if (type === 'accessories_table') return rows(data.accessories)
  return []
}

/** Shared by forms, preview and export. Reads exactly the source the editor writes. */
export function sectionContent(section: PageSection, product: Product | null): DataRecord {
  const content = record(section.content)
  if (sectionDataSource(section) === 'section') {
    if (section.type === 'ordering_codes') return { ...content, segments: content.segments ?? section.config.segments ?? [] }
    if (section.type === 'single_image') return { ...content, imageUrl: content.imageUrl ?? content.url ?? content.src ?? (typeof section.content === 'string' ? section.content : '') }
    return content
  }
  const data = record(product?.data)
  const marketing = record(data.marketing)
  switch (section.type) {
    case 'hero_banner': return { ...marketing, title: marketing.title ?? product?.name ?? '' }
    case 'text_block': return { text: marketing.overview ?? '' }
    case 'features_list': return { items: marketing.features ?? [] }
    case 'image_gallery': return { images: marketing.images ?? [] }
    case 'single_image': return { imageUrl: strings(marketing.images)[0] ?? '', caption: content.caption ?? '' }
    case 'ordering_codes': return { segments: record(data.ordering).code_parts ?? [] }
    default: return { rows: productRows(product, section.type) }
  }
}

export function productPath(type: SectionType, field: string): string | null {
  if (type === 'hero_banner') return `marketing.${field}`
  if (type === 'text_block') return 'marketing.overview'
  if (type === 'features_list') return 'marketing.features'
  if (type === 'image_gallery') return 'marketing.images'
  if (type === 'ordering_codes') return 'ordering.code_parts'
  const paths: Partial<Record<SectionType, string>> = { specs_table: 'specs', electrical_table: 'electrical', general_specs_table: 'general', accessories_table: 'accessories' }
  return paths[type] ?? null
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(formatValue).join(', ')
  const item = record(value)
  if (typeof item.display === 'string') return item.display
  if ('min' in item && 'max' in item) return `${formatValue(item.min)} a ${formatValue(item.max)}${item.unit ? ` ${item.unit}` : ''}`
  if ('value' in item) return `${formatValue(item.value)}${item.unit ? ` ${item.unit}` : ''}`
  return Object.entries(item).map(([key, val]) => `${key}: ${formatValue(val)}`).join('; ')
}

export function imageItems(value: unknown): { url: string; caption: string }[] {
  if (!Array.isArray(value)) return []
  return value.map(item => typeof item === 'string' ? { url: item, caption: '' } : {
    url: formatValue(record(item).url ?? record(item).src), caption: formatValue(record(item).caption),
  }).filter(item => item.url)
}

export function tableCells(row: unknown, columns: string[]): unknown[] {
  return columns.map((column, index) => Array.isArray(row) ? row[index] : record(row)[column])
}

/** Convert a visible move into positions in the canonical array. */
export function moveSectionIndices(sections: PageSection[], sectionId: string, targetId: string): [number, number] | null {
  const from = sections.findIndex(section => section.id === sectionId)
  const to = sections.findIndex(section => section.id === targetId)
  return from >= 0 && to >= 0 && from !== to ? [from, to] : null
}
