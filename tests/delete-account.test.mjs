import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false },
})
const { handleDeleteAccount } = await server.ssrLoadModule(
  '/supabase/functions/delete-account/handler.ts',
)
after(() => server.close())

function fixture({
  invalid = false,
  anonymous = false,
  revokeError = false,
  deleteError = false,
} = {}) {
  const calls = []
  return {
    calls,
    auth: {
      getUser: async (token) => {
        calls.push(['getUser', token])
        return {
          data: { user: invalid ? null : { id: 'authenticated-user', is_anonymous: anonymous } },
          error: invalid,
        }
      },
      admin: {
        signOut: async (...args) => {
          calls.push(['signOut', ...args])
          return { error: revokeError }
        },
        deleteUser: async (id) => {
          calls.push(['deleteUser', id])
          return { error: deleteError }
        },
      },
    },
  }
}

const request = (options = {}) =>
  new Request('https://example.invalid/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer validated-token' },
    ...options,
  })

test('deletion requires POST and a valid, non-anonymous user', async () => {
  for (const [options, expected] of [
    [{ method: 'OPTIONS' }, 204],
    [{ method: 'GET' }, 405],
    [{ headers: {} }, 401],
  ]) {
    const { auth, calls } = fixture()
    const response = await handleDeleteAccount(request(options), auth)
    assert.equal(response.status, expected)
    assert.equal(calls.length, 0)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
  }
  for (const options of [{ invalid: true }, { anonymous: true }]) {
    const { auth, calls } = fixture(options)
    assert.equal((await handleDeleteAccount(request(), auth)).status, 401)
    assert.equal(calls.length, 1)
  }
})

test('revokes sessions and deletes only the verified user, ignoring a supplied target ID', async () => {
  const { auth, calls } = fixture()
  const response = await handleDeleteAccount(
    request({ body: JSON.stringify({ userId: 'another-user' }) }),
    auth,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { deleted: true })
  assert.deepEqual(calls, [
    ['getUser', 'validated-token'],
    ['signOut', 'validated-token', 'global'],
    ['deleteUser', 'authenticated-user'],
  ])
})

test('never reports deletion success on revocation, deletion or transport errors', async () => {
  for (const options of [{ revokeError: true }, { deleteError: true }]) {
    const { auth, calls } = fixture(options)
    const response = await handleDeleteAccount(request(), auth)
    assert.equal(response.status, 500)
    assert.equal((await response.json()).deleted, undefined)
    if (options.revokeError)
      assert.equal(
        calls.some(([name]) => name === 'deleteUser'),
        false,
      )
  }
  const { auth } = fixture()
  auth.getUser = async () => {
    throw new Error('network failure')
  }
  assert.equal((await handleDeleteAccount(request(), auth)).status, 500)
})
