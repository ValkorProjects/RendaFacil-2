import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  createDeclarationRepository,
  emptyDeclaration,
  montarEntradaDoBanco,
} from '../declarations'
import { createIncomeMapper } from '../incomeMapper'
import { databaseMock as db, USER_A, USER_B, declaration } from './supabaseMock'
import { useIncomeStore } from '@/stores/income'
import { emptyDependent } from '@/utils/dependents'

vi.mock('@/lib/supabase', () => ({ getSupabase: () => db.client }))
beforeEach(() => {
  db.reset()
  setActivePinia(createPinia())
})
afterEach(() => vi.restoreAllMocks())

const captureExpectedErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {})

const connect = async () => {
  const store = useIncomeStore()
  await store.loadAccount(USER_A)
  return store
}
const fill = (store: ReturnType<typeof useIncomeStore>, amount = 'R$ 6.500,00') => {
  Object.assign(store.draftIncomes[0]!, { amount, inss: 'R$ 711,51', irrf: 'R$ 248,42' })
}

describe('RF · persistence with a mocked Supabase client', () => {
  it('creates stable UUIDs without crypto.randomUUID', () => {
    const mapper = createIncomeMapper(() => 1)
    const state = {
      registrations: [
        {
          id: 1,
          incomes: [{ id: 2, category: 'clt' as const, amount: 'R$ 1.000,00', inss: '', irrf: '' }],
        },
      ],
      household: { dependents: [], expenses: [] },
    }
    const randomUuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto.randomUUID unavailable')
    })

    const first = mapper.toRows(state, emptyDeclaration(), USER_A)
    const retry = mapper.toRows(state, emptyDeclaration(), USER_A)

    expect(first.sources[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(retry.sources[0]!.id).toBe(first.sources[0]!.id)
    expect(randomUuid).not.toHaveBeenCalled()
  })

  it('scopes reads to the owner and 2026, without creating an empty declaration on entry', async () => {
    const repo = createDeclarationRepository(db.client)
    expect(await repo.load(USER_A)).toEqual(emptyDeclaration())
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0]).toMatchObject({
      table: 'declaracoes',
      filters: { user_id: USER_A, ano_calendario: 2026 },
      columns: '*, fontes_pagadoras(*), dependentes(*), despesas(*)',
    })
    expect(db.calls.some((call) => call.operation === 'upsert')).toBe(false)
    db.seed({ ...emptyDeclaration(), declaration: declaration(USER_A) })
    expect((await repo.load(USER_B)).declaration).toBeNull()
    expect(db.calls).toHaveLength(2)
  })

  it('creates a missing declaration for old accounts and writes integer annual cents', async () => {
    const store = await connect()
    fill(store)
    expect(await store.saveDraft()).toBe(true)
    expect(db.upsertOptions).toEqual([
      { onConflict: 'user_id,ano_calendario', ignoreDuplicates: true },
    ])
    expect(db.state.declaration).toMatchObject({ user_id: USER_A, ano_calendario: 2026 })
    expect(db.state.sources[0]).toMatchObject({
      user_id: USER_A,
      categoria: 'clt',
      rendimentos_centavos: 7_800_000,
      previdencia_centavos: 853_812,
      irrf_centavos: 298_104,
    })
    expect(db.rpc).toHaveBeenCalledWith(
      'salvar_lancamentos',
      expect.objectContaining({ p_declaracao_id: db.state.declaration!.id }),
    )
  })

  it('restores incomes, dependents and expenses after a fresh store and sign-out/sign-in', async () => {
    let store = await connect()
    await store.saveDependent({
      ...emptyDependent(),
      apelido: 'Lia',
      relacao: 'conjuge_companheiro',
    })
    const person = store.dependents[0]!
    fill(store)
    store.draftIncomes[0]!.dependentId = person.id
    await store.saveDraft()
    await store.addExpense({
      descricao: 'Consulta',
      categoria: 'saude',
      tipo: 'consulta_medica',
      beneficiario: 'dependente',
      dependente_id: String(person.id),
      valor_centavos: 12345,
      reembolso_centavos: 345,
      data: '2026-03-10',
      recebedor: '',
      pensao_iniciou_em_2026: false,
      base_legal_ok: null,
    })
    await store.addExpense({
      descricao: 'Pensão',
      categoria: 'pensao',
      tipo: 'pensao_alimenticia',
      beneficiario: 'dependente',
      dependente_id: String(person.id),
      recebedor: 'Lia',
      pensao_iniciou_em_2026: true,
      valor_centavos: 250000,
      reembolso_centavos: 0,
      data: '2026-07-01',
      base_legal_ok: true,
    })
    const estimate = store.taxEstimate
    store.clearAccountData()
    expect(store.registrations).toEqual([])
    setActivePinia(createPinia())
    store = useIncomeStore()
    await store.loadAccount(USER_A)
    expect(store.registrations).toHaveLength(1)
    expect(store.dependents[0]).toMatchObject({ apelido: 'Lia', relacao: 'conjuge_companheiro' })
    // The payment date and the alimony fields survive the round trip through the database.
    expect(store.expenses[0]).toMatchObject({
      valor_centavos: 12345,
      reembolso_centavos: 345,
      data: '2026-03-10',
      descricao: 'Consulta',
    })
    expect(store.expenses[1]).toMatchObject({
      categoria: 'pensao',
      recebedor: 'Lia',
      pensao_iniciou_em_2026: true,
      data: '2026-07-01',
    })
    expect(store.taxEstimate).toEqual(estimate)
    expect(store.registrations[0]!.incomes[0]!.dependentId).toBe(store.dependents[0]!.id)
  })

  it('updates the Home estimate immediately after confirmed edit and deletion', async () => {
    const store = await connect()
    fill(store)
    await store.saveDraft()
    const registration = store.registrations[0]!
    const original = store.taxEstimate
    expect(
      await store.updateRegistration({
        ...registration,
        incomes: registration.incomes.map((row) => ({ ...row, amount: 'R$ 9.000,00' })),
      }),
    ).toBe(true)
    expect(store.taxEstimate).not.toEqual(original)
    expect(db.state.sources).toHaveLength(1)
    expect(db.state.sources[0]!.rendimentos_centavos).toBe(10_800_000)
    expect(await store.removeRegistration(registration.id)).toBe(true)
    expect(store.taxEstimate).toBeNull()
    expect(db.state.sources).toEqual([])
  })

  it('preserves the form and saved estimate on network failure; retry does not duplicate sources', async () => {
    const store = await connect()
    const errors = captureExpectedErrors()
    fill(store)
    const draft = structuredClone(JSON.parse(JSON.stringify(store.draftIncomes)))
    db.fail('write')
    expect(await store.saveDraft()).toBe(false)
    expect(store.draftIncomes).toEqual(draft)
    expect(store.registrations).toEqual([])
    expect(store.saveError).toContain('campos foram mantidos')
    db.fail(null)
    expect(await store.saveDraft()).toBe(true)
    const estimate = store.taxEstimate
    db.fail('write')
    expect(await store.removeRegistration(store.registrations[0]!.id)).toBe(false)
    expect(store.taxEstimate).toEqual(estimate)
    db.fail(null)
    expect(db.state.sources).toHaveLength(1)
    expect(errors).toHaveBeenCalledTimes(2)
  })

  it('retries with the same UUID when the server committed but its response was lost', async () => {
    const store = await connect()
    const errors = captureExpectedErrors()
    fill(store)
    const implementation = db.rpc.getMockImplementation()!
    db.rpc.mockImplementationOnce(async (...args) => {
      await implementation(...args)
      throw new Error('response lost')
    })
    expect(await store.saveDraft()).toBe(false)
    const id = db.state.sources[0]!.id
    expect(await store.saveDraft()).toBe(true)
    expect(db.state.sources.map((row) => row.id)).toEqual([id])
    expect(errors).toHaveBeenCalledTimes(1)
  })

  it('keeps drafts on a load error and allows an explicit retry', async () => {
    const store = useIncomeStore()
    const errors = captureExpectedErrors()
    fill(store)
    // First account connection clears previous account data, then fields can be typed while loading.
    db.fail('read')
    await store.loadAccount(USER_A)
    fill(store)
    expect(store.loaded).toBe(false)
    expect(store.loadError).toBeTruthy()
    expect(await store.saveDraft()).toBe(false)
    db.fail(null)
    await store.retryLoad()
    expect(store.draftIncomes[0]!.amount).toBe('R$ 6.500,00')
    expect(store.loaded).toBe(true)
    expect(errors).toHaveBeenCalledTimes(1)
  })

  it('ignores a late save response after switching account and blocks repeated saves', async () => {
    const store = await connect()
    fill(store)
    let release!: () => void
    db.delayWrite(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const pending = store.saveDraft()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(await store.saveDraft()).toBe(false)
    store.clearAccountData()
    await store.loadAccount(USER_B)
    release()
    expect(await pending).toBe(false)
    expect(store.accountId).toBe(USER_B)
    expect(store.registrations).toEqual([])
    expect(store.draftIncomes[0]!.amount).toBe('')
    expect(store.saveError).toBe('')
  })

  it('ignores a late load after logout', async () => {
    const store = useIncomeStore()
    let release!: () => void
    db.delayRead(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const pending = store.loadAccount(USER_A)
    store.clearAccountData()
    release()
    await pending
    expect(store.accountId).toBeNull()
    expect(store.loaded).toBe(false)
    expect(store.registrations).toEqual([])
  })

  it('preserves exact annual cents and other source fields when the monthly display rounds', async () => {
    const store = await connect()
    fill(store)
    await store.saveDraft()
    const data = db.state
    data.sources[0]!.rendimentos_centavos = 7_800_001
    data.sources[0]!.decimo_terceiro_centavos = 43210
    data.sources[0]!.plr_centavos = 12345
    let counter = 0
    const mapper = createIncomeMapper(() => ++counter)
    const state = mapper.fromRows(data)
    const roundtrip = mapper.toRows(state, data, USER_A)
    expect(roundtrip.sources).toEqual(data.sources)
    expect(montarEntradaDoBanco(roundtrip).fontes[0]!.rendimentos).toBe(7_800_001)
    await createDeclarationRepository(db.client).save(USER_A, data, roundtrip)
    expect(db.rpc.mock.lastCall![1].p_alteracoes).toMatchObject({ fontes: [] })
  })

  it('keeps 13th salary, tax and profit-sharing fields when updating a source', async () => {
    const store = await connect()
    fill(store)
    await store.saveDraft()
    const data = db.state
    data.sources[0]!.decimo_terceiro_centavos = 43210
    data.sources[0]!.irrf_13_centavos = 9876
    data.sources[0]!.plr_centavos = 12345
    db.seed(data)

    let counter = 0
    const mapper = createIncomeMapper(() => ++counter)
    const state = mapper.fromRows(data)
    state.registrations[0]!.incomes[0]!.amount = 'R$ 8.000,00'
    const updated = mapper.toRows(state, data, USER_A)
    await createDeclarationRepository(db.client).save(USER_A, data, updated)

    expect(db.state.sources[0]).toMatchObject({
      decimo_terceiro_centavos: 43210,
      irrf_13_centavos: 9876,
      plr_centavos: 12345,
    })
  })

  it('persists changes to fontes_esperadas without resetting it on unrelated saves', async () => {
    const store = await connect()
    fill(store)
    await store.saveDraft()
    const before = db.state
    const after = structuredClone(before)
    after.declaration!.fontes_esperadas = 3

    await createDeclarationRepository(db.client).save(USER_A, before, after)
    expect(db.state.declaration?.fontes_esperadas).toBe(3)
  })

  it('saves a dependent and their incomes in one transaction and preserves the holder draft', async () => {
    const store = await connect()
    const errors = captureExpectedErrors()
    fill(store)
    const fields = { ...emptyDependent(), apelido: 'Lia', teve_renda_propria: true }
    const incomes = [
      { id: -1, category: 'clt' as const, amount: 'R$ 1.000,00', inss: '', irrf: '' },
    ]
    db.fail('write')
    expect(await store.saveDependentWithIncomes(fields, incomes)).toBe(false)
    expect(store.dependents).toEqual([])
    db.fail(null)
    expect(await store.saveDependentWithIncomes(fields, incomes)).toBe(true)
    expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(db.state.sources[0]!.dependente_id).toBe(db.state.dependents[0]!.id)
    expect(store.draftIncomes[0]!.amount).toBe('R$ 6.500,00')
    expect(errors).toHaveBeenCalledTimes(1)
  })

  it('rejects unsafe monetary integers before invoking the RPC', async () => {
    const store = await connect()
    const errors = captureExpectedErrors()
    fill(store, 'R$ 999.999.999.999.999,99')
    expect(await store.saveDraft()).toBe(false)
    expect(db.rpc).not.toHaveBeenCalled()
    expect(errors).toHaveBeenCalledTimes(1)
  })
})
