import { ProductStatusSchema } from './contracts.ts'
import type { ProductRecord } from './contracts.ts'
import type { infer as ZodInfer } from 'zod'

export type ProductStatus = ZodInfer<typeof ProductStatusSchema>

export interface CatalogProductLink {
  catalogId: string
  productId: string
  sortOrder: number
  visible: boolean
}

export interface CatalogSyncPlan {
  toAttach: Array<{ productId: string; sortOrder: number }>
  toDetach: string[]
  toReorder: Array<{ productId: string; sortOrder: number }>
}

export class CatalogLibraryError extends Error {
  readonly code: 'INVALID_ID' | 'DUPLICATE_LINK' | 'MEMBERSHIP_MISMATCH'

  constructor(code: CatalogLibraryError['code'], message: string) {
    super(message)
    this.name = 'CatalogLibraryError'
    this.code = code
  }
}

function ensureId(value: string, label: string): void {
  if (!value.trim()) throw new CatalogLibraryError('INVALID_ID', `${label} obrigatório`)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function compareLinks(a: CatalogProductLink, b: CatalogProductLink): number {
  return a.sortOrder - b.sortOrder || a.productId.localeCompare(b.productId)
}

/** Adiciona um produto à composição de um catálogo sem mutar o estado atual. */
export function attachProductToCatalog(
  catalogId: string,
  productId: string,
  links: CatalogProductLink[],
  options: Pick<CatalogProductLink, 'visible'> = { visible: true },
): CatalogProductLink[] {
  ensureId(catalogId, 'Catálogo')
  ensureId(productId, 'Produto')
  if (links.some((link) => link.catalogId === catalogId && link.productId === productId)) {
    throw new CatalogLibraryError('DUPLICATE_LINK', 'O produto já está incluído neste catálogo')
  }

  const nextOrder = links
    .filter((link) => link.catalogId === catalogId)
    .reduce((highest, link) => Math.max(highest, link.sortOrder), -1) + 1

  return clone([...links, { catalogId, productId, sortOrder: nextOrder, visible: options.visible }].sort(compareLinks))
}

/** Remove um vínculo; produtos continuam na biblioteca mestre. */
export function detachProductFromCatalog(
  catalogId: string,
  productId: string,
  links: CatalogProductLink[],
): CatalogProductLink[] {
  ensureId(catalogId, 'Catálogo')
  ensureId(productId, 'Produto')
  return clone(links.filter((link) => !(link.catalogId === catalogId && link.productId === productId)))
}

/** Reordena exatamente os produtos já vinculados, recusando perda silenciosa de itens. */
export function reorderCatalogProducts(
  catalogId: string,
  desiredProductIds: string[],
  links: CatalogProductLink[],
): CatalogProductLink[] {
  ensureId(catalogId, 'Catálogo')
  const catalogLinks = links.filter((link) => link.catalogId === catalogId)
  const currentIds = new Set(catalogLinks.map((link) => link.productId))
  const desiredIds = new Set(desiredProductIds)
  if (desiredIds.size !== desiredProductIds.length || currentIds.size !== desiredIds.size || [...currentIds].some((id) => !desiredIds.has(id))) {
    throw new CatalogLibraryError('MEMBERSHIP_MISMATCH', 'A ordenação precisa conter exatamente os produtos vinculados')
  }

  const order = new Map(desiredProductIds.map((productId, index) => [productId, index]))
  return clone(links.map((link) => {
    if (link.catalogId !== catalogId) return link
    return { ...link, sortOrder: order.get(link.productId) ?? link.sortOrder }
  }).sort(compareLinks))
}

/** Calcula uma sincronização idempotente entre a seleção do editor e a biblioteca mestre. */
export function buildCatalogSyncPlan(
  catalogId: string,
  desiredProductIds: string[],
  links: CatalogProductLink[],
): CatalogSyncPlan {
  ensureId(catalogId, 'Catálogo')
  if (new Set(desiredProductIds).size !== desiredProductIds.length) {
    throw new CatalogLibraryError('MEMBERSHIP_MISMATCH', 'A seleção não pode conter produtos duplicados')
  }

  const current = links.filter((link) => link.catalogId === catalogId)
  const currentIds = new Set(current.map((link) => link.productId))
  const desiredIds = new Set(desiredProductIds)
  return {
    toAttach: desiredProductIds
      .filter((productId) => !currentIds.has(productId))
      .map((productId) => ({ productId, sortOrder: desiredProductIds.indexOf(productId) })),
    toDetach: current
      .filter((link) => !desiredIds.has(link.productId))
      .map((link) => link.productId),
    toReorder: desiredProductIds
      .map((productId, sortOrder) => ({ productId, sortOrder, current: current.find((link) => link.productId === productId) }))
      .filter(({ current, sortOrder }) => current !== undefined && current.sortOrder !== sortOrder)
      .map(({ productId, sortOrder }) => ({ productId, sortOrder })),
  }
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function searchableData(data: unknown): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data)
  } catch {
    return ''
  }
}

/** Pesquisa a biblioteca mestre com ordenação previsível para o seletor do dashboard. */
export function searchMasterProducts(
  products: ProductRecord[],
  query: string,
  filters: { family?: string; status?: ProductStatus } = {},
): ProductRecord[] {
  const needle = normalize(query.trim())
  const family = filters.family ? normalize(filters.family) : null
  return products
    .filter((product) => !family || normalize(product.family) === family)
    .filter((product) => !filters.status || product.status === filters.status)
    .map((product) => {
      if (!needle) return { product, score: 10 }
      const sku = normalize(product.sku)
      const name = normalize(product.name)
      const productFamily = normalize(product.family)
      const data = normalize(searchableData(product.data))
      const score = sku === needle ? 0
        : name === needle ? 1
          : sku.startsWith(needle) ? 2
            : name.startsWith(needle) ? 3
              : sku.includes(needle) || name.includes(needle) ? 4
                : productFamily.includes(needle) ? 5
                  : data.includes(needle) ? 6
                    : null
      return { product, score }
    })
    .filter((item): item is { product: ProductRecord; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score || a.product.name.localeCompare(b.product.name) || a.product.sku.localeCompare(b.product.sku))
    .map(({ product }) => clone(product))
}
