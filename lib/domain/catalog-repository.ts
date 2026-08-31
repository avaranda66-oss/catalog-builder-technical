import type { CatalogDocument, ProductRecord } from './contracts'

export interface CatalogSnapshot {
  catalog: CatalogDocument
  products: ProductRecord[]
  revision: number
  saved_at: string
}

export class RevisionConflictError extends Error {
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(expectedRevision: number, actualRevision: number) {
    super(`Conflito de revisão: esperado ${expectedRevision}, atual ${actualRevision}`)
    this.name = 'RevisionConflictError'
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

export interface CatalogRepository {
  load(catalogId: string): Promise<CatalogSnapshot | null>
  save(snapshot: CatalogSnapshot, expectedRevision: number): Promise<CatalogSnapshot>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Adaptador determinístico para testes, modo local e desenvolvimento CLI.
 * O adaptador Supabase implementará a mesma porta sem vazar SQL para o domínio.
 */
export class MemoryCatalogRepository implements CatalogRepository {
  private readonly snapshots = new Map<string, CatalogSnapshot>()

  constructor(initial: CatalogSnapshot[] = []) {
    for (const snapshot of initial) this.snapshots.set(snapshot.catalog.id, clone(snapshot))
  }

  async load(catalogId: string): Promise<CatalogSnapshot | null> {
    const snapshot = this.snapshots.get(catalogId)
    return snapshot ? clone(snapshot) : null
  }

  async save(snapshot: CatalogSnapshot, expectedRevision: number): Promise<CatalogSnapshot> {
    const current = this.snapshots.get(snapshot.catalog.id)
    const actualRevision = current?.revision ?? 0
    if (actualRevision !== expectedRevision) throw new RevisionConflictError(expectedRevision, actualRevision)

    const next = clone({
      ...snapshot,
      revision: actualRevision + 1,
      saved_at: new Date().toISOString(),
    })
    this.snapshots.set(next.catalog.id, next)
    return clone(next)
  }
}

