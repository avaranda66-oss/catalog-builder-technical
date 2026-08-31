import type { CatalogRepository, CatalogSnapshot } from '../domain/catalog-repository.ts'
import { RevisionConflictError } from '../domain/catalog-repository.ts'
import { validateDocument, validateProduct } from '../domain/contracts.ts'

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
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>
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

function errorMessage(error: QueryError | null, fallback: string): string {
  return error?.message ? `${fallback}: ${error.message}` : fallback
}

function requireOne<T>(data: T[] | null, message: string): T {
  const value = data?.[0]
  if (!value) throw new Error(message)
  return value
}

function toCatalogDocument(row: CatalogRow) {
  const result = validateDocument({ ...row, pages: [] })
  if (!result.success) throw new Error(`Catálogo inválido no Supabase: ${result.errors?.join('; ')}`)
  return result.data
}

function toProduct(row: ProductRow) {
  const result = validateProduct(row)
  if (!result.success) throw new Error(`Produto inválido no Supabase (${row.sku}): ${result.errors?.join('; ')}`)
  return result.data
}

/**
 * Adaptador mínimo para as tabelas do baseline (`catalogs` e `products`).
 * Páginas continuam vazias até a migration de documentos ser aprovada.
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

      return {
        catalog: toCatalogDocument(catalogRow),
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

      return {
        catalog: toCatalogDocument(catalogRow),
        products: snapshot.products,
        revision: catalogRow.version,
        saved_at: catalogRow.updated_at,
      }
    },
  }
}
