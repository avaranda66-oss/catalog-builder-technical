import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryCatalogRepository, RevisionConflictError } from '../lib/domain/catalog-repository.ts'

const snapshot = {
  catalog: {
    id: 'catalog-1', name: 'Catálogo', locale: 'pt-BR', status: 'draft', template_key: 'presys-premium',
    brand: {}, version: 1, pages: [], updated_by: null, updated_at: '2026-08-31T12:00:00.000Z', created_at: '2026-08-31T12:00:00.000Z',
  },
  products: [],
  revision: 0,
  saved_at: '2026-08-31T12:00:00.000Z',
}

test('repositório em memória não expõe referência mutável', async () => {
  const repository = new MemoryCatalogRepository([snapshot])
  const loaded = await repository.load('catalog-1')
  loaded.catalog.name = 'Alterado fora do repositório'
  const loadedAgain = await repository.load('catalog-1')
  assert.equal(loadedAgain.catalog.name, 'Catálogo')
})

test('salvamento incrementa revisão somente após expectativa válida', async () => {
  const repository = new MemoryCatalogRepository([snapshot])
  const saved = await repository.save({ ...snapshot, catalog: { ...snapshot.catalog, name: 'Nova versão' } }, 0)
  assert.equal(saved.revision, 1)
  assert.equal((await repository.load('catalog-1')).catalog.name, 'Nova versão')
})

test('repositório devolve conflito sem sobrescrever o rascunho atual', async () => {
  const repository = new MemoryCatalogRepository([snapshot])
  await repository.save({ ...snapshot, catalog: { ...snapshot.catalog, name: 'Primeira alteração' } }, 0)
  await assert.rejects(
    () => repository.save({ ...snapshot, catalog: { ...snapshot.catalog, name: 'Segunda alteração' } }, 0),
    (error) => error instanceof RevisionConflictError && error.actualRevision === 1,
  )
  assert.equal((await repository.load('catalog-1')).catalog.name, 'Primeira alteração')
})

