const test = require('node:test')
const assert = require('node:assert/strict')
const { installTsHook, memoryStorage } = require('./helpers/load-ts.cjs')

const restore = installTsHook()
const storage = require('../lib/storage/safe-storage.ts')
test.after(() => restore())

test('quota recovery removes optional duplicated caches and keeps the document', () => {
  const backing = memoryStorage()
  let first = true
  backing.setItem = (key, value) => {
    if (first) {
      first = false
      const error = new Error('Setting the value exceeded the quota')
      error.name = 'QuotaExceededError'
      throw error
    }
    backing.items.set(key, String(value))
  }
  const value = JSON.stringify({ state: { catalog: { id: 'c1' }, products: [{ id: 'p1' }], libraryProducts: [{ id: 'p1' }], localDocuments: [{ catalog: { id: 'old' } }] }, version: 4 })
  assert.equal(storage.setItemWithQuotaRecovery(backing, 'workspace', value), true)
  const saved = JSON.parse(backing.getItem('workspace'))
  assert.deepEqual(saved.state.products, [{ id: 'p1' }])
  assert.deepEqual(saved.state.libraryProducts, [])
  assert.deepEqual(saved.state.localDocuments, [])
})

test('unrecoverable quota reports failure without throwing', () => {
  const backing = memoryStorage()
  backing.setItem = () => { throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' }) }
  assert.equal(storage.setItemWithQuotaRecovery(backing, 'workspace', JSON.stringify({ state: { products: [] } })), false)
})
