import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

// Exercise the real store and Supabase SDK, replacing only HTTP with an isolated fixture.
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://profile-test.invalid'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('test-publishable-key'),
  },
})
const { readProfile, normalizeProfile, validateProfile, formatPhone, validatePasswordChange } =
  await server.ssrLoadModule('/src/utils/profile.ts')
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const requests = []
let failUpdate = false
let failDelete = false
let fixtureUser = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  phone: '',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Ana Silva' },
  created_at: '2026-01-01T00:00:00Z',
}
globalThis.window = { location: { origin: 'http://localhost:5173' } }
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  assert.equal(
    url.origin,
    'https://profile-test.invalid',
    'Tests must never contact a real account',
  )
  const body = options.body ? JSON.parse(options.body) : null
  requests.push({ path: url.pathname, body })
  if (url.pathname.endsWith('/token')) {
    if (body.password === 'incorrect-password') {
      return Response.json(
        { code: 'invalid_credentials', msg: 'Invalid credentials' },
        { status: 400 },
      )
    }
    return Response.json({
      access_token: 'fixture-access-token',
      token_type: 'bearer',
      refresh_token: 'fixture-refresh-token',
      expires_in: 3600,
      user: fixtureUser,
    })
  }
  if (url.pathname.endsWith('/signup')) return Response.json({ ...fixtureUser, email: body.email })
  if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 })
  if (url.pathname.endsWith('/delete-account')) {
    return failDelete
      ? Response.json({ error: 'Deletion failed' }, { status: 500 })
      : Response.json({ deleted: true })
  }
  if (url.pathname.endsWith('/user') && options.method === 'PUT') {
    if (failUpdate) {
      return Response.json(
        { code: 'email_exists', msg: 'Email already registered' },
        { status: 422 },
      )
    }
    fixtureUser = {
      ...fixtureUser,
      user_metadata: { ...fixtureUser.user_metadata, ...body.data },
      ...(body.email ? { new_email: body.email } : {}),
    }
  }
  return Response.json(fixtureUser)
}
const { useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts')
const { getSupabase } = await server.ssrLoadModule('/src/lib/supabase.ts')
const pinia = createPinia()
setActivePinia(pinia)
const auth = useAuthStore()
const { useIncomeStore } = await server.ssrLoadModule('/src/stores/income.ts')
const income = useIncomeStore()

after(async () => {
  auth.$dispose()
  getSupabase().auth.stopAutoRefresh()
  globalThis.fetch = originalFetch
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
  await server.close()
})

test('reads existing names and phones without treating a missing phone as an error', () => {
  assert.deepEqual(readProfile(null), { name: '', email: '', phone: '' })
  assert.deepEqual(
    readProfile({
      email: 'ana@example.com',
      user_metadata: { name: 'Ana', phone_number: '11999998888' },
    }),
    { name: 'Ana', email: 'ana@example.com', phone: '11999998888' },
  )
  assert.equal(readProfile({ phone: '+5511999998888', user_metadata: { phone: '' } }).phone, '')
  assert.equal(readProfile({ user_metadata: { full_name: 123, phone: {} } }).name, '')
})

test('validates names, emails and optional domestic or international phones', () => {
  const profile = { name: ' Ana Silva ', email: ' ana@example.com ', phone: '+55 (11) 99999-8888' }
  assert.equal(validateProfile(profile), null)
  assert.deepEqual(normalizeProfile(profile), {
    name: 'Ana Silva',
    email: 'ana@example.com',
    phone: '+5511999998888',
  })
  for (const invalid of [
    { name: '   ' },
    { email: 'invalid' },
    { email: '' },
    { phone: '123' },
    { phone: 'abc11999998888' },
    { phone: '+1234567890123456' },
  ])
    assert.ok(validateProfile({ ...profile, ...invalid }))
  assert.equal(validateProfile({ ...profile, phone: '' }), null)
  assert.equal(validateProfile({ ...profile, email: '' }, false), null)
  assert.equal(formatPhone('11999998888'), '(11) 99999-8888')
  assert.equal(formatPhone('+551133334444'), '+55 (11) 3333-4444')
})

test('account lifecycle persists edits, handles pending email and preserves data after a failed save', async () => {
  await getSupabase().auth.getSession()
  assert.equal(auth.ready, true)
  assert.equal(auth.isGuest, true)
  await assert.rejects(auth.updateProfile({ name: 'Ana', email: 'ana@example.com', phone: '' }))

  const signup = await auth.signUp(
    { name: 'Ana', email: 'ana@example.com', phone: '' },
    'test-password',
  )
  assert.equal(signup.needsConfirmation, true)
  assert.equal(auth.isGuest, true, 'Signup without confirmation must not sign in')
  assert.equal(
    requests.find((request) => request.path.endsWith('/signup')).body.data.full_name,
    'Ana',
  )

  await auth.signIn('ana@example.com', 'test-password')
  assert.equal(auth.isGuest, false)
  await auth.updateProfile({
    name: 'Ana Souza',
    email: 'ana@example.com',
    phone: '(11) 99999-8888',
  })
  assert.equal(auth.user.user_metadata.full_name, 'Ana Souza')
  assert.equal(auth.user.user_metadata.phone, '11999998888')
  assert.equal(
    requests.at(-1).body.phone,
    undefined,
    'Contact edits must not change SMS credentials',
  )
  assert.equal(
    requests.at(-1).body.email,
    undefined,
    'Unchanged email must not send a confirmation',
  )

  const pending = await auth.updateProfile({
    name: 'Ana Souza',
    email: 'novo@example.com',
    phone: '',
  })
  assert.equal(pending.emailConfirmationPending, true)
  assert.equal(auth.user.email, 'ana@example.com', 'Keep the confirmed email until verification')
  assert.equal(auth.user.new_email, 'novo@example.com')
  assert.equal(auth.user.user_metadata.phone, '', 'A phone can be removed')

  await auth.updateProfile({ name: 'Ana Souza', email: 'novo@example.com', phone: '' })
  assert.equal(requests.at(-1).body.email, undefined, 'Do not resend an already pending change')
  failUpdate = true
  await assert.rejects(
    auth.updateProfile({ name: 'Unsaved', email: 'novo@example.com', phone: '' }),
  )
  assert.equal(auth.user.user_metadata.full_name, 'Ana Souza')
  failUpdate = false

  auth.session = { ...auth.session, user: { ...auth.user, is_anonymous: true } }
  assert.equal(auth.isGuest, true)
  await assert.rejects(auth.updateProfile({ name: 'Ana', email: 'ana@example.com', phone: '' }))
  await auth.signOut()
  assert.equal(auth.isGuest, true)
  assert.equal(auth.user, null)
})

test('password changes reject invalid inputs and incorrect current passwords before updating', async () => {
  assert.ok(validatePasswordChange('', 'new-password', 'new-password'))
  assert.ok(validatePasswordChange('old-password', 'short', 'short'))
  assert.ok(validatePasswordChange('old-password', 'new-password', 'different-password'))
  assert.ok(validatePasswordChange('old-password', 'old-password', 'old-password'))
  assert.equal(validatePasswordChange('old-password', 'new-password', 'new-password'), null)
  await assert.rejects(auth.changePassword('old-password', 'new-password', 'new-password'))
  await auth.signIn('ana@example.com', 'old-password')
  const start = requests.length
  await assert.rejects(auth.changePassword('incorrect-password', 'new-password', 'new-password'))
  assert.equal(
    requests.slice(start).some((request) => request.body?.password === 'new-password'),
    false,
  )
  await auth.changePassword('old-password', 'new-password', 'new-password')
  assert.equal(requests.at(-1).body.password, 'new-password')
  assert.equal(requests.at(-1).body.current_password, 'old-password')
})

test('dependents without income survive saving and account data is cleared on sign-out', async () => {
  income.draftIncomes[0].amount = '100000'
  income.setDraftHasDependents(true)
  income.setDraftDependentCount(2)
  income.draftDependents[1].incomeType = 'estagio'
  income.draftDependents[1].amount = '50000'
  assert.equal(income.saveDraft(), true)
  assert.equal(income.dependentCount, 2)
  assert.equal(income.registrations[0].dependents[0].incomeType, 'none')
  assert.equal(income.taxableTotal, 1800000)
  income.draftIncomes[0].amount = '20000'
  await auth.signOut()
  assert.equal(income.registrations.length, 0)
  assert.equal(income.draftIncomes[0].amount, '')
})

test('deletion failure preserves the account and data; confirmed deletion signs out and clears them', async () => {
  await assert.rejects(auth.deleteAccount())
  await auth.signIn('ana@example.com', 'new-password')
  income.draftIncomes[0].amount = '100000'
  income.saveDraft()
  failDelete = true
  await assert.rejects(auth.deleteAccount())
  assert.equal(auth.isGuest, false)
  assert.equal(income.registrations.length, 1)
  failDelete = false
  await auth.deleteAccount()
  assert.equal(auth.isGuest, true)
  assert.equal(income.registrations.length, 0)
  assert.deepEqual(requests.find((request) => request.path.endsWith('/delete-account')).body, {})
})
