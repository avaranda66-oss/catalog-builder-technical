const test = require('node:test')
const assert = require('node:assert/strict')
const { installTsHook, memoryStorage } = require('./helpers/load-ts.cjs')

let configured = false
let verifiedUser = null
let response = { data: null, error: null }
const calls = []
const rpc = async (name, args) => { calls.push({ name, args }); return response }
installTsHook({ mockModules: {
  './client': { isSupabaseConfigured: () => configured, supabase: { rpc } },
  './auth': { getAuthenticatedUser: async () => verifiedUser },
} })
const api = require('../lib/supabase/api.ts')
const user = { id: 'employee-1', name: 'Editor', area: 'Edição', role: 'editor', loggedAt: '' }
function state() {
  return { catalog: { id: 'catalog-1', name: 'Engineering', version: 7, brand: {}, status: 'draft' },
    products: [], fieldDefinitions: [], pages: [], designTokens: {}, contact: {}, presets: [] }
}
test.beforeEach(() => { configured = false; verifiedUser = null; response = { data: null, error: null }; calls.length = 0; global.localStorage = memoryStorage() })

test('quota exhaustion never reports local persistence success', async () => {
  global.localStorage.setItem = () => { throw new Error('QuotaExceededError') }
  const result = await api.saveAll(state())
  assert.equal(result.localStorage, false)
  assert.equal(result.supabase, false)
  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'local_storage')
})

test('local-only mode works without inventing an authenticated identity', async () => {
  configured = true
  const result = await api.saveAll(state(), null)
  assert.equal(result.status, 'local')
  assert.equal(result.supabase, false)
  assert.equal(calls.length, 0)
})

test('CAS conflict keeps the submitted local draft and never acknowledges a cloud save', async () => {
  configured = true; verifiedUser = user
  response = { data: null, error: { code: '40001', message: 'stale version' } }
  const draft = state()
  const result = await api.saveAll(draft, user)
  assert.equal(result.status, 'conflict')
  assert.equal(result.supabase, false)
  assert.equal(result.localStorage, true)
  assert.equal(calls[0].args.p_expected_version, 7)
  assert.equal(api.loadFromLocalStorage('catalog-1', user.id).catalog.version, 7)
  assert.equal(draft.catalog.version, 7)
})

test('authorization errors explain the review rule returned by the server', async () => {
  configured = true; verifiedUser = user
  response = { data: null, error: { code: '42501', message: 'Aprovação exige administrador diferente do autor e revisão sem alterações' } }
  const result = await api.saveAll(state(), user)
  assert.equal(result.error.code, 'forbidden')
  assert.match(result.error.message, /administrador diferente/i)
})

test('server acknowledgement supplies committed revision; products are not hidden in brand JSON', async () => {
  configured = true; verifiedUser = user
  const draft = state()
  draft.catalog.brand = { products: [{ id: 'old' }], audit_trail: [{ user_name: 'spoof' }] }
  response = { data: { catalog: { ...draft.catalog, version: 8 }, products: [], fieldDefinitions: [] }, error: null }
  const result = await api.saveAll(draft, user)
  assert.equal(result.supabase, true)
  assert.equal(result.catalog.version, 8)
  assert.equal(calls[0].name, 'save_catalog_workspace')
  assert.deepEqual(calls[0].args.p_products, [])
  assert.equal('products' in calls[0].args.p_catalog.brand, false)
  assert.equal('audit_trail' in calls[0].args.p_catalog.brand, false)
  assert.equal(api.loadFromLocalStorage('catalog-1', user.id).catalog.version, 8)
})

test('verified viewer or different account cannot submit cloud mutations', async () => {
  configured = true; verifiedUser = { ...user, role: 'viewer' }
  assert.equal((await api.saveAll(state(), user)).error.code, 'forbidden')
  verifiedUser = { ...user, id: 'another-user' }
  assert.equal((await api.saveAll(state(), user)).error.code, 'unauthenticated')
  assert.equal(calls.length, 0)
})

test('empty products and pages remain empty when loading an explicit local catalog', async () => {
  const empty = state()
  api.saveToLocalStorage(empty)
  const loaded = await api.loadAll({ ...empty, products: [{ id: 'seed' }], pages: [{ id: 'seed-page' }] })
  assert.deepEqual(loaded.products, [])
  assert.deepEqual(loaded.pages, [])
  assert.equal(api.loadFromLocalStorage('another-catalog'), null)
})

test('cloud read failure does not silently replace the document with demo data', async () => {
  configured = true; verifiedUser = user
  response = { data: null, error: { code: 'PGRST202' } }
  await assert.rejects(api.syncFromCloud(state(), 'catalog-explicit'), (error) => error.code === 'migration_required')
  assert.equal(calls[0].args.p_catalog_id, 'catalog-explicit')
})

test('signed media tokens are not persisted in snapshots', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://unit-test.example'
  const original = { images: ['https://unit-test.example/storage/v1/object/sign/catalog-images/u/photo.png?token=temporary', 'https://another.example/image.png'] }
  const normalized = api.canonicalizeMediaUrls(original)
  assert.equal(normalized.images[0], 'storage://catalog-images/u/photo.png')
  assert.equal(normalized.images[1], original.images[1])
  assert.match(original.images[0], /token=temporary/)
})
