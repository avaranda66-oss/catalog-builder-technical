import type { CatalogRepository, CatalogSnapshot } from '../domain/catalog-repository.ts'
import { RevisionConflictError } from '../domain/catalog-repository.ts'
import { validateDocument, validateProduct } from '../domain/contracts.ts'
import type { CatalogDocument } from '../domain/contracts.ts'

interface QueryError {
  message: string
  code?: string
}

interface QueryResponse<T> {
  data: T[] | null
  error: QueryError | null
}

interface QueryBuilder<T> extends PromiseLike<QueryResponse<T>> {
  select(columns?: string): QueryBuilder<T>
  eq(column: string, value: string | number): QueryBuilder<T>
  in(column: string, values: string[]): QueryBuilder<T>
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>
  delete(): QueryBuilder<T>
  update(values: Record<string, unknown>): QueryBuilder<T>
  upsert(values: Record<string, unknown>[]): QueryBuilder<T>
}

export interface SupabaseCatalogClient {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>
}

interface CatalogRow {
  id: string
  name: string
  locale: string
  status: string
  template_key: string
  brand: Record<string, unknown>
  version: number
  updated_by: string | null
  updated_at: string
  created_at: string
}

interface ProductRow {
  id: string
  catalog_id: string
  sku: string
  name: string
  family: string
  status: string
  sort_order: number
  data: Record<string, unknown>
  version: number
  updated_by: string | null
  updated_at: string
  created_at: string
}

interface PageRow {
  id: string
  catalog_id: string
  title: string
  sort_order: number
  visible: boolean
}

interface SectionRow {
  id: string
  page_id: string
  type: string
  title: string
  config: Record<string, unknown>
  content: unknown
  style: Record<string, unknown> | null
  sort_order: number
  visible: boolean
}

type PageSection = CatalogDocument['pages'][number]['sections'][number]

function errorMessage(error: QueryError | null, fallback: string): string {
  return error?.message ? `${fallback}: ${error.message}` : fallback
}

function requireOne<T>(data: T[] | null, message: string): T {
  const value = data?.[0]
  if (!value) throw new Error(message)
  return value
}

function toCatalogDocument(row: CatalogRow, pages: CatalogDocument['pages']) {
  const result = validateDocument({ ...row, pages })
  if (!result.success) throw new Error(`Catálogo inválido no Supabase: ${result.errors?.join('; ')}`)
  return result.data
}

function toProduct(row: ProductRow) {
  const result = validateProduct(row)
  if (!result.success) throw new Error(`Produto inválido no Supabase (${row.sku}): ${result.errors?.join('; ')}`)
  return result.data
}

/**
 * Adaptador para o baseline e para a migration 00004 de documentos/workspace.
 * A leitura de páginas é separada para manter compatibilidade com clientes que
 * ainda não aplicaram a migration; nesse caso o erro é propagado para que o
 * chamador escolha fallback local conscientemente.
 */
export function createSupabaseCatalogRepository(client: SupabaseCatalogClient): CatalogRepository {
  return {
    async load(catalogId) {
      const catalogQuery = await client.from<CatalogRow>('catalogs').select('*').eq('id', catalogId)
      if (catalogQuery.error) throw new Error(errorMessage(catalogQuery.error, 'Falha ao carregar catálogo'))
      const catalogRow = catalogQuery.data?.[0]
      if (!catalogRow) return null

      const productsQuery = await client
        .from<ProductRow>('products')
        .select('*')
        .eq('catalog_id', catalogId)
        .order('sort_order', { ascending: true })
      if (productsQuery.error) throw new Error(errorMessage(productsQuery.error, 'Falha ao carregar produtos'))

      const pagesQuery = await client
        .from<PageRow>('catalog_pages')
        .select('*')
        .eq('catalog_id', catalogId)
        .order('sort_order', { ascending: true })
      if (pagesQuery.error) throw new Error(errorMessage(pagesQuery.error, 'Falha ao carregar páginas'))

      const pageRows = pagesQuery.data ?? []
      const sectionRows = pageRows.length > 0
        ? await client
          .from<SectionRow>('page_sections')
          .select('*')
          .in('page_id', pageRows.map((page) => page.id))
          .order('sort_order', { ascending: true })
        : { data: [], error: null }
      if (sectionRows.error) throw new Error(errorMessage(sectionRows.error, 'Falha ao carregar blocos'))

      const sectionsByPage = new Map<string, SectionRow[]>()
      for (const section of sectionRows.data ?? []) {
        const pageSections = sectionsByPage.get(section.page_id) ?? []
        pageSections.push(section)
        sectionsByPage.set(section.page_id, pageSections)
      }
      const pages = pageRows.map((page) => ({
        id: page.id,
        title: page.title,
        sort_order: page.sort_order,
        visible: page.visible,
        sections: (sectionsByPage.get(page.id) ?? []).map((section) => ({
          id: section.id,
          type: section.type as PageSection['type'],
          title: section.title,
          config: section.config ?? {},
          content: section.content ?? null,
          style: section.style ?? {},
          sort_order: section.sort_order,
          visible: section.visible,
        })),
      }))

      return {
        catalog: toCatalogDocument(catalogRow, pages),
        products: (productsQuery.data ?? []).map(toProduct),
        revision: catalogRow.version,
        saved_at: catalogRow.updated_at,
      }
    },

    async save(snapshot, expectedRevision) {
      const catalogQuery = await client
        .from<CatalogRow>('catalogs')
        .update({
          name: snapshot.catalog.name,
          locale: snapshot.catalog.locale,
          status: snapshot.catalog.status,
          template_key: snapshot.catalog.template_key,
          brand: snapshot.catalog.brand,
          version: expectedRevision + 1,
          updated_by: snapshot.catalog.updated_by,
        })
        .eq('id', snapshot.catalog.id)
        .eq('version', expectedRevision)
        .select('*')

      if (catalogQuery.error) throw new Error(errorMessage(catalogQuery.error, 'Falha ao salvar catálogo'))
      const catalogRow = catalogQuery.data?.[0]
      if (!catalogRow) throw new RevisionConflictError(expectedRevision, expectedRevision + 1)

      const products = snapshot.products.map((product) => ({
        id: product.id,
        catalog_id: product.catalog_id,
        sku: product.sku,
        name: product.name,
        family: product.family,
        status: product.status,
        sort_order: product.sort_order,
        data: product.data,
        version: product.version,
        updated_by: product.updated_by,
      }))

      if (products.length > 0) {
        const productsQuery = await client.from<ProductRow>('products').upsert(products)
        if (productsQuery.error) throw new Error(errorMessage(productsQuery.error, 'Falha ao salvar produtos'))
      }

      // Pages and sections are replaced as a set so removed blocks cannot
      // reappear after a reload. The migration's cascading FK removes sections
      // when their page is deleted.
      const deletePagesQuery = await client
        .from<PageRow>('catalog_pages')
        .delete()
        .eq('catalog_id', snapshot.catalog.id)
      if (deletePagesQuery.error) throw new Error(errorMessage(deletePagesQuery.error, 'Falha ao substituir páginas'))

      const pageRows = snapshot.catalog.pages.map((page) => ({
        id: page.id,
        catalog_id: snapshot.catalog.id,
        title: page.title,
        sort_order: page.sort_order,
        visible: page.visible,
      }))
      if (pageRows.length > 0) {
        const pagesQuery = await client.from<PageRow>('catalog_pages').upsert(pageRows)
        if (pagesQuery.error) throw new Error(errorMessage(pagesQuery.error, 'Falha ao salvar páginas'))

        const sectionRows = snapshot.catalog.pages.flatMap((page) => page.sections.map((section) => ({
          id: section.id,
          page_id: page.id,
          type: section.type,
          title: section.title,
          config: section.config,
          content: section.content,
          style: section.style ?? {},
          sort_order: section.sort_order,
          visible: section.visible,
        })))
        if (sectionRows.length > 0) {
          const sectionsQuery = await client.from<SectionRow>('page_sections').upsert(sectionRows)
          if (sectionsQuery.error) throw new Error(errorMessage(sectionsQuery.error, 'Falha ao salvar blocos'))
        }
      }

      return {
        catalog: toCatalogDocument(catalogRow, snapshot.catalog.pages),
        products: snapshot.products,
        revision: catalogRow.version,
        saved_at: catalogRow.updated_at,
      }
    },
  }
}
