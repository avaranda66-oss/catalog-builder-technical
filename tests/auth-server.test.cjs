const test = require('node:test')
const assert = require('node:assert/strict')
const { installTsHook } = require('./helpers/load-ts.cjs')
let authResult
let profileResult
let verifiedToken
let selectedId
installTsHook({ mockModules: {
  '@supabase/supabase-js': { createClient: () => ({
    auth: { getUser: async (token) => { verifiedToken = token; return authResult } },
    from: () => ({ select: () => ({ eq: (_column, id) => { selectedId = id; return { single: async () => profileResult } } }) }),
  }) },
} })
const { requireAuthenticatedUser, AuthError } = require('../lib/auth/server.ts')
test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://unit-test.example'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key'
  authResult = { data: { user: { id: 'real-user', email: 'editor@example.test' } }, error: null }
  profileResult = { data: { id: 'real-user', role: 'editor', full_name: 'Real editor', is_active: true }, error: null }
  verifiedToken = null; selectedId = null
})
test('missing bearer token fails before any provider call', async () => {
  await assert.rejects(requireAuthenticatedUser(new Request('http://localhost/api')), (error) => error instanceof AuthError && error.status === 401)
  assert.equal(verifiedToken, null)
})
test('server validates token with Auth and gets role for verified user, ignoring body identity', async () => {
  const request = new Request('http://localhost/api', { method: 'POST', headers: { Authorization: 'Bearer session-token' }, body: JSON.stringify({ userId: 'admin', role: 'admin' }) })
  const { user } = await requireAuthenticatedUser(request)
  assert.equal(verifiedToken, 'session-token')
  assert.equal(selectedId, 'real-user')
  assert.equal(user.id, 'real-user')
  assert.equal(user.role, 'editor')
})
test('a valid viewer token cannot invoke editing operations', async () => {
  profileResult.data.role = 'viewer'
  await assert.rejects(requireAuthenticatedUser(new Request('http://localhost/api', { headers: { Authorization: 'Bearer valid-viewer' } })), (error) => error.status === 403)
})
test('a registered account needs explicit company activation', async () => {
  profileResult.data.is_active = false
  await assert.rejects(requireAuthenticatedUser(new Request('http://localhost/api', { headers: { Authorization: 'Bearer registered-but-unapproved' } })), (error) => error.status === 403)
})
test('expired tokens never reach profile authorization', async () => {
  authResult = { data: { user: null }, error: { message: 'expired' } }
  await assert.rejects(requireAuthenticatedUser(new Request('http://localhost/api', { headers: { Authorization: 'Bearer expired' } })), (error) => error.status === 401)
  assert.equal(selectedId, null)
})
test('unconfigured authentication is explicitly unavailable', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  await assert.rejects(requireAuthenticatedUser(new Request('http://localhost/api')), (error) => error.status === 503)
})
