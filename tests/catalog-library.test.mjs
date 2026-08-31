import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attachProductToCatalog,
  buildCatalogSyncPlan,
  detachProductFromCatalog,
  reorderCatalogProducts,
  searchMasterProducts,
  CatalogLibraryError,
} from '../lib/domain/catalog-library.ts'

const links = [
  { catalogId: 'cat-1', productId: 'prod-a', sortOrder: 0, visible: true },
  { catalogId: 'cat-1', productId: 'prod-b', sortOrder: 1, visible: true },
  { catalogId: 'cat-2', productId: 'prod-c', sortOrder: 0, visible: true },
]

const product = (id, sku, name, data = {}, family = 'PCON') => ({
  id, catalog_id: 'cat-1', sku, name, family, status: 'published', sort_order: 0,
  data, version: 1, updated_by: null, updated_at: '2026-08-31T12:00:00.000Z', created_at: '2026-08-31T12:00:00.000Z',
})

test('anexa e remove vínculo sem alterar a lista original', () => {
  const next = attachProductToCatalog('cat-1', 'prod-d', links)
  assert.equal(next.find((link) => link.productId === 'prod-d').sortOrder, 2)
  assert.equal(links.some((link) => link.productId === 'prod-d'), false)
  const detached = detachProductFromCatalog('cat-1', 'prod-a', next)
  assert.equal(detached.some((link) => link.productId === 'prod-a'), false)
  assert.equal(next.some((link) => link.productId === 'prod-a'), true)
})

test('impede vínculo duplicado e ordenação com conjunto diferente', () => {
  assert.throws(() => attachProductToCatalog('cat-1', 'prod-a', links), (error) => error instanceof CatalogLibraryError && error.code === 'DUPLICATE_LINK')
  assert.throws(() => reorderCatalogProducts('cat-1', ['prod-a'], links), (error) => error instanceof CatalogLibraryError && error.code === 'MEMBERSHIP_MISMATCH')
})

test('gera plano idempotente de sincronização da composição', () => {
  const plan = buildCatalogSyncPlan('cat-1', ['prod-b', 'prod-d'], links)
  assert.deepEqual(plan.toAttach, [{ productId: 'prod-d', sortOrder: 1 }])
  assert.deepEqual(plan.toDetach, ['prod-a'])
  assert.deepEqual(plan.toReorder, [{ productId: 'prod-b', sortOrder: 0 }])
})

test('reordena somente o catálogo solicitado', () => {
  const reordered = reorderCatalogProducts('cat-1', ['prod-b', 'prod-a'], links)
  assert.deepEqual(reordered.filter((link) => link.catalogId === 'cat-1').map((link) => link.productId), ['prod-b', 'prod-a'])
  assert.equal(reordered.find((link) => link.catalogId === 'cat-2').sortOrder, 0)
})

test('pesquisa biblioteca por SKU, nome, família e dados técnicos', () => {
  const products = [
    product('a', 'PCON-Y17', 'Controlador de Bancada'),
    product('b', 'PCON-X1', 'Calibrador Portátil', { marketing: { overview: 'alta precisão' } }),
    product('c', 'TA-10', 'Transmissor', {}, 'TA'),
  ]
  assert.deepEqual(searchMasterProducts(products, 'y17').map((item) => item.id), ['a'])
  assert.deepEqual(searchMasterProducts(products, 'precisao').map((item) => item.id), ['b'])
  assert.deepEqual(searchMasterProducts(products, '', { family: 'pcon' }).map((item) => item.id), ['b', 'a'])
})
