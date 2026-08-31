const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { installTsHook, memoryStorage } = require('./helpers/load-ts.cjs')
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true })
installTsHook()
const { useEditorStore: store } = require('../features/editor/editor-store.ts')
const base = store.getInitialState()
beforeEach(() => { store.setState({ ...base, localMode: true }, true) })

test('first edit supports undo and redo; branching discards redo', () => {
  const id = store.getState().products[0].id
  const original = store.getState().products[0].name
  store.getState().updateProductField(id, { name: 'Alteração A' })
  assert.equal(store.getState().canUndo(), true)
  store.getState().undo()
  assert.equal(store.getState().products[0].name, original)
  store.getState().redo()
  assert.equal(store.getState().products[0].name, 'Alteração A')
  store.getState().undo()
  store.getState().updateProductField(id, { name: 'Alteração B' })
  assert.equal(store.getState().canRedo(), false)
})

test('acknowledgement does not mark a newer edit saved', () => {
  const id = store.getState().products[0].id
  store.getState().updateProductField(id, { name: 'A' })
  const sent = store.getState().localRevision
  store.getState().updateProductField(id, { name: 'B' })
  store.getState().acknowledgeSave(sent, { cloud: true })
  assert.equal(store.getState().saveStatus, 'unsaved')
  assert.ok(store.getState().localRevision > store.getState().syncedRevision)
  const persisted = JSON.parse(localStorage.getItem('pcon-catalog-builder-v3')).state
  assert.equal(persisted.saveStatus, 'unsaved')
  assert.equal(persisted.currentUser, undefined)
})

test('AI target is fixed and changed originals reject the whole patch', () => {
  const [a, b] = store.getState().products
  store.getState().setStagedPatch({ productId: a.id, baseVersion: a.version, summary: 'Test', changes: [{ path: 'marketing.title', fieldLabel: 'Título', oldValue: a.data.marketing.title, newValue: 'Título revisado', accepted: true }] })
  store.getState().setSelectedProductId(b.id)
  store.getState().applyStagedPatch()
  assert.equal(store.getState().products.find(p => p.id === a.id).data.marketing.title, 'Título revisado')
  assert.equal(store.getState().products.find(p => p.id === b.id).data.marketing.title, b.data.marketing.title)
  store.getState().setStagedPatch({ productId: a.id, baseVersion: a.version, summary: 'Stale', changes: [{ path: 'marketing.title', fieldLabel: 'Título', oldValue: 'old', newValue: 'bad', accepted: true }] })
  store.getState().applyStagedPatch()
  assert.equal(store.getState().products.find(p => p.id === a.id).data.marketing.title, 'Título revisado')
  assert.match(store.getState().lastError, /Conflito/)
})

test('AI changes start unaccepted and unsafe paths cannot be written', () => {
  const a = store.getState().products[0]
  store.getState().setStagedPatch({ productId: a.id, baseVersion: a.version, summary: 'Test', changes: [{ path: 'marketing.title', fieldLabel: 'Título', oldValue: a.data.marketing.title, newValue: 'New' }] })
  assert.equal(store.getState().stagedPatch.changes[0].accepted, false)
  store.getState().toggleChangeAccepted(0)
  assert.equal(store.getState().stagedPatch.changes[0].accepted, true)
  store.getState().updateProductData(a.id, '__proto__.polluted', true)
  assert.equal({}.polluted, undefined)
  assert.match(store.getState().lastError, /inválido/)
})

test('viewer cannot edit and unlink retains the master product', () => {
  const a = store.getState().products[0]
  store.getState().setCurrentUser({ id: 'viewer', name: 'Leitor', area: 'Teste', role: 'viewer', loggedAt: '' })
  store.getState().updateProductField(a.id, { name: 'Forbidden' })
  assert.equal(store.getState().products[0].name, a.name)
  store.getState().setLocalMode(true)
  store.getState().deleteProduct(a.id)
  assert.equal(store.getState().products.some(p => p.id === a.id), false)
  assert.equal(store.getState().libraryProducts.some(p => p.id === a.id), true)
})
