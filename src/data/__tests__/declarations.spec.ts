import { beforeEach, describe, expect, it, vi } from 'vitest'
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
const connect = async () => {
  const store = useIncomeStore()
  await store.loadAccount(USER_A)
  return store
}
const fill = (store: ReturnType<typeof useIncomeStore>, amount = 'R$ 6.500,00') => {
  Object.assign(store.draftIncomes[0]!, { amount, inss: 'R$ 711,51', irrf: 'R$ 248,42' })
}

describe('RF · persistence with a mocked Supabase client', () => {
  it('scopes reads to the owner and 2026, without creating an empty declaration on entry', async () => {
    const repo = createDeclarationRepository(db.client)
    expect(await repo.load(USER_A)).toEqual(emptyDeclaration())
    expect(db.calls[0]).toMatchObject({
      table: 'declaracoes',
      filters: { user_id: USER_A, ano_calendario: 2026 },
    })
    expect(db.calls.some((call) => call.operation === 'upsert')).toBe(false)
    db.seed({ ...emptyDeclaration(), declaration: declaration(USER_A) })
    expect((await repo.load(USER_B)).declaration).toBeNull()
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
      base_legal_ok: null,
    })
    const estimate = store.taxEstimate
    store.clearAccountData()
    expect(store.registrations).toEqual([])
    setActivePinia(createPinia())
    store = useIncomeStore()
    await store.loadAccount(USER_A)
    expect(store.registrations).toHaveLength(1)
    expect(store.dependents[0]).toMatchObject({ apelido: 'Lia', relacao: 'conjuge_companheiro' })
    expect(store.expenses[0]).toMatchObject({ valor_centavos: 12345, reembolso_centavos: 345 })
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
  })

  it('retries with the same UUID when the server committed but its response was lost', async () => {
    const store = await connect()
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
  })

  it('keeps drafts on a load error and allows an explicit retry', async () => {
    const store = useIncomeStore()
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

  it('saves a dependent and their incomes in one transaction and preserves the holder draft', async () => {
    const store = await connect()
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
  })

  it('rejects unsafe monetary integers before invoking the RPC', async () => {
    const store = await connect()
    fill(store, 'R$ 999.999.999.999.999,99')
    expect(await store.saveDraft()).toBe(false)
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
