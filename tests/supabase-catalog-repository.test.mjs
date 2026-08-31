import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseCatalogRepository } from '../lib/adapters/supabase-catalog-repository.ts'
import { RevisionConflictError } from '../lib/domain/catalog-repository.ts'

class FakeQuery {
  constructor(table, db) {
    this.table = table
    this.db = db
    this.filters = []
    this.operation = 'select'
    this.values = null
  }

  select() { this.operation = this.operation === 'update' ? 'update-select' : 'select'; return this }
  eq(column, value) { this.filters.push([column, value]); return this }
  order() { return this }
  update(values) { this.operation = 'update'; this.values = values; return this }
  upsert(values) { this.operation = 'upsert'; this.values = values; return this }

  then(resolve, reject) {
    try {
      const rows = this.db[this.table]
      const matches = (row) => this.filters.every(([column, value]) => row[column] === value)
      if (this.operation === 'update-select') {
        const selected = rows.filter(matches)
        selected.forEach((row) => Object.assign(row, this.values, { updated_at: '2026-08-31T13:00:00.000Z' }))
        return Promise.resolve({ data: selected, error: null }).then(resolve, reject)
      }
      if (this.operation === 'upsert') {
        for (const value of this.values) {
          const existing = rows.find((row) => row.id === value.id)
          if (existing) Object.assign(existing, value)
          else rows.push({ ...value, created_at: '2026-08-31T12:00:00.000Z', updated_at: '2026-08-31T12:00:00.000Z' })
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      }
      return Promise.resolve({ data: rows.filter(matches).map((row) => ({ ...row })), error: null }).then(resolve, reject)
    } catch (error) {
      return Promise.reject(error).then(resolve, reject)
    }
  }
}

function fakeClient(db) {
  return { from: (table) => new FakeQuery(table, db) }
}

function database() {
  return {
    catalogs: [{
      id: 'catalog-1', name: 'Catálogo', locale: 'pt-BR', status: 'draft', template_key: 'presys-premium',
      brand: {}, version: 1, updated_by: null, updated_at: '2026-08-31T12:00:00.000Z', created_at: '2026-08-31T12:00:00.000Z',
    }],
    products: [{
      id: 'product-1', catalog_id: 'catalog-1', sku: 'PCON-Y17', name: 'Controlador', family: 'PCON', status: 'draft',
      sort_order: 0, data: {}, version: 1, updated_by: null, updated_at: '2026-08-31T12:00:00.000Z', created_at: '2026-08-31T12:00:00.000Z',
    }],
  }
}

test('carrega e valida catálogo e produtos pelo adaptador', async () => {
  const db = database()
  const repository = createSupabaseCatalogRepository(fakeClient(db))
  const snapshot = await repository.load('catalog-1')
  assert.equal(snapshot.revision, 1)
  assert.equal(snapshot.products[0].sku, 'PCON-Y17')
  assert.deepEqual(snapshot.catalog.pages, [])
})

test('salva catálogo e produtos com controle otimista de versão', async () => {
  const db = database()
  const repository = createSupabaseCatalogRepository(fakeClient(db))
  const loaded = await repository.load('catalog-1')
  const saved = await repository.save({
    ...loaded,
    catalog: { ...loaded.catalog, name: 'Catálogo atualizado', version: 2 },
  }, loaded.revision)
  assert.equal(saved.revision, 2)
  assert.equal(db.catalogs[0].name, 'Catálogo atualizado')
})

test('retorna conflito quando a versão esperada não corresponde', async () => {
  const db = database()
  const repository = createSupabaseCatalogRepository(fakeClient(db))
  await assert.rejects(
    () => repository.save({
      catalog: {
        id: 'catalog-1', name: 'Conflito', locale: 'pt-BR', status: 'draft', template_key: 'presys-premium',
        brand: {}, version: 1, pages: [], updated_by: null, updated_at: '2026-08-31T12:00:00.000Z', created_at: '2026-08-31T12:00:00.000Z',
      },
      products: [], revision: 0, saved_at: '2026-08-31T12:00:00.000Z',
    }, 0),
    (error) => error instanceof RevisionConflictError,
  )
})

