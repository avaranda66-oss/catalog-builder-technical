import { Product } from '../types/database'
import { LOCALIZABLE_PATH, TranslationSchema, collectTranslatableFields } from './contracts'

export interface ProductTranslation {
  fields: Record<string, string>
  pageTitles: Array<{ id: string; title: string }>
  sourceVersion: number
  sourceFields: Record<string, string>
  sourcePageTitles: Record<string, string>
  status: 'draft' | 'reviewed'
  createdAt: string
}

export function getProductTranslation(product: Product, locale?: string): ProductTranslation | null {
  if (!locale || locale === 'source') return null
  const translations: unknown = product.data.translations
  if (!translations || typeof translations !== 'object') return null
  const candidate: unknown = (translations as Record<string, unknown>)[locale]
  if (!candidate || typeof candidate !== 'object') return null
  const record = candidate as Record<string, unknown>
  const result = TranslationSchema.safeParse({ fields: record.fields, pageTitles: record.pageTitles })
  if (!result.success || typeof record.sourceVersion !== 'number' || typeof record.createdAt !== 'string' || !['draft', 'reviewed'].includes(String(record.status))) return null
  if (!record.sourceFields || typeof record.sourceFields !== 'object' || !record.sourcePageTitles || typeof record.sourcePageTitles !== 'object') return null
  const sourceFields = record.sourceFields as Record<string, string>
  const currentFields = collectTranslatableFields(product.data)
  if (JSON.stringify(Object.entries(sourceFields).sort()) !== JSON.stringify(Object.entries(currentFields).sort())) return null
  return { ...result.data, sourceFields, sourcePageTitles: record.sourcePageTitles as Record<string, string>, sourceVersion: record.sourceVersion, createdAt: record.createdAt, status: record.status as 'draft' | 'reviewed' }
}

/** Display-only copy: missing locales and fields fall back to source. */
export function getLocalizedProduct(product: Product, locale?: string): Product {
  const translation = getProductTranslation(product, locale)
  if (!translation) return product
  const data = JSON.parse(JSON.stringify(product.data)) as Product['data']
  for (const [path, value] of Object.entries(translation.fields)) {
    if (!LOCALIZABLE_PATH.test(path)) continue
    const keys = path.split('.')
    let current: unknown = data
    for (const key of keys.slice(0, -1)) {
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) { current = undefined; break }
      current = (current as Record<string, unknown>)[key]
    }
    const last = keys.at(-1)!
    if (current && typeof current === 'object' && Object.hasOwn(current, last)) (current as Record<string, unknown>)[last] = value
  }
  return { ...product, data }
}

export function getLocalizedPageTitle(product: Product, pageId: string, sourceTitle: string, locale?: string): string {
  const translation = getProductTranslation(product, locale)
  if (translation?.sourcePageTitles[pageId] !== sourceTitle) return sourceTitle
  return translation.pageTitles.find((page) => page.id === pageId)?.title || sourceTitle
}
