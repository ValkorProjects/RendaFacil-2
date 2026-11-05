import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// Execute the real migrations in isolated PostgreSQL; never use a hosted project.
const db = new PGlite()
after(() => db.close())
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
`)
const migration = (name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
await db.exec(await migration('20261103230000_create_profiles.sql'))
const legacyId = '00000000-0000-4000-8000-000000000001'
const newId = '00000000-0000-4000-8000-000000000002'
await db.query('insert into auth.users values ($1, $2)', [legacyId, { full_name: 'Legacy' }])
await db.exec(await migration('20261105033409_add_privacy_consent.sql'))

test('legacy profiles are preserved without fabricated consent', async () => {
  const { rows } = await db.query('select * from public.perfis where id = $1', [legacyId])
  assert.equal(rows[0].name, 'Legacy')
  assert.equal(rows[0].consentimento_versao, null)
  assert.equal(rows[0].consentimento_em, null)
})

test('database rejects absent, false, malformed or outdated consent atomically', async () => {
  for (const metadata of [
    {},
    { privacy_consent: false, privacy_policy_version: '2026-11-05' },
    { privacy_consent: 'true', privacy_policy_version: '2026-11-05' },
    { privacy_consent: true },
    { privacy_consent: true, privacy_policy_version: 'old-version' },
  ]) {
    await assert.rejects(
      db.query('insert into auth.users values ($1, $2)', [newId, metadata]),
      /Explicit consent/,
    )
  }
  assert.equal((await db.query('select id from auth.users where id = $1', [newId])).rows.length, 0)
})

test('signup records server time before email confirmation; later metadata cannot overwrite it', async () => {
  const { rows: before } = await db.query('select clock_timestamp() as now')
  await db.query('insert into auth.users values ($1, $2)', [
    newId,
    {
      full_name: 'Ana',
      privacy_consent: true,
      privacy_policy_version: '2026-11-05',
      consentimento_em: '2000-01-01T00:00:00Z',
    },
  ])
  const { rows } = await db.query('select * from public.perfis where id = $1', [newId])
  assert.equal(rows[0].consentimento_versao, '2026-11-05')
  assert.ok(new Date(rows[0].consentimento_em) >= new Date(before[0].now))
  await db.query('update auth.users set raw_user_meta_data = $1 where id = $2', [
    { privacy_consent: false, privacy_policy_version: 'tampered' },
    newId,
  ])
  const { rows: updated } = await db.query('select * from public.perfis where id = $1', [newId])
  assert.deepEqual(updated, rows)
})

test('RLS isolates profiles and clients cannot forge, change or delete consent evidence', async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${newId}'`)
  try {
    assert.deepEqual((await db.query('select id from public.perfis')).rows, [{ id: newId }])
    await db.query('update public.perfis set name = $1 where id = $2', ['Ana Souza', newId])
    for (const sql of [
      "update public.perfis set consentimento_versao = 'forged'",
      'update public.perfis set consentimento_em = now()',
      'delete from public.perfis',
      `insert into public.perfis (id) values ('${legacyId}')`,
      'select private.handle_new_user()',
    ]) {
      await assert.rejects(db.exec(sql), /permission denied/)
    }
  } finally {
    await db.exec('reset role')
  }
  assert.equal(
    (await db.query('select name from public.perfis where id = $1', [legacyId])).rows[0].name,
    'Legacy',
  )
})

test('deleting the Auth account also deletes its profile and consent', async () => {
  await db.query('delete from auth.users where id = $1', [newId])
  assert.equal(
    (await db.query('select id from public.perfis where id = $1', [newId])).rows.length,
    0,
  )
})
