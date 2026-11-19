import { databaseMock, USER_A } from '@/data/__tests__/supabaseMock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildTaxInput, useIncomeStore } from '@/stores/income'
import { emptyDependent, type DependentFields } from '@/utils/dependents'

vi.mock('@/lib/supabase', () => ({ getSupabase: () => databaseMock.client }))

beforeEach(async () => {
  setActivePinia(createPinia())
  databaseMock.reset()
  await useIncomeStore().loadAccount(USER_A)
})

const setup = async () => {
  const store = useIncomeStore()
  await store.addRegistration({
    id: 100,
    incomes: [{ id: 101, category: 'clt', amount: 'R$ 10.000,00', inss: '', irrf: '' }],
  })
  return store
}
const addDependent = async (fields: Partial<DependentFields> = {}) => {
  const store = useIncomeStore()
  await store.saveDependent({ ...emptyDependent(), apelido: 'Lia', ...fields })
  return store.dependents.at(-1)!
}
const expense = (id: number | null, description = 'Escola') => ({
  descricao: description,
  categoria: 'educacao' as const,
  tipo: 'ensino_fundamental',
  beneficiario: id === null ? ('titular' as const) : ('dependente' as const),
  dependente_id: id === null ? null : String(id),
  valor_centavos: 500_000,
  reembolso_centavos: 0,
  base_legal_ok: null,
  recebedor: '',
  pensao_iniciou_em_2026: false,
})

describe('RF-11 · cadastro e cálculo de dependentes', () => {
  it('salva pessoa e múltiplas rendas pelo questionário sem afetar o rascunho do titular', async () => {
    const store = await setup()
    store.draftIncomes[0]!.amount = 'R$ 3.000,00'
    expect(
      await store.saveDependentWithIncomes(
        { ...emptyDependent(), apelido: 'Lia', teve_renda_propria: true },
        [
          { id: -1, category: 'clt', amount: 'R$ 2.000,00', inss: 'R$ 100,00', irrf: '' },
          { id: -2, category: 'pensaoAlimenticia', amount: 'R$ 500,00', inss: '', irrf: '' },
        ],
      ),
    ).toBe(true)
    const lia = store.dependents[0]!
    const incomes = store.incomesForDependent(lia.id)
    expect(incomes).toHaveLength(2)
    expect(incomes.every((income) => income.id > 0 && income.dependentId === lia.id)).toBe(true)
    expect(store.pendingDependents).toEqual([])
    expect(store.taxableTotal).toBe(14_400_000)
    expect(store.exemptTotal).toBe(600_000)
    expect(store.draftIncomes[0]!.amount).toBe('R$ 3.000,00')
  })

  it('reabre e edita as rendas existentes sem duplicar nem alterar rendas de outras pessoas', async () => {
    const store = await setup()
    const lia = await addDependent({ teve_renda_propria: true })
    await store.addRegistration({
      id: 200,
      incomes: [
        {
          id: 201,
          category: 'clt',
          amount: 'R$ 1.000,00',
          inss: '',
          irrf: '',
          dependentId: lia.id,
        },
        { id: 202, category: 'clt', amount: 'R$ 500,00', inss: '', irrf: '' },
      ],
    })
    const draft = store
      .incomesForDependent(lia.id)
      .map((income) => ({ ...income, amount: 'R$ 1.500,00' }))
    expect(store.incomesForDependent(lia.id)[0]!.amount).toBe('R$ 1.000,00')
    expect(await store.saveDependentWithIncomes({ ...lia, apelido: 'Lili' }, draft, lia.id)).toBe(
      true,
    )
    expect(store.incomesForDependent(lia.id)).toHaveLength(1)
    expect(store.incomesForDependent(lia.id)[0]).toMatchObject({ id: 201, amount: 'R$ 1.500,00' })
    expect(store.registrations[1]!.incomes[1]).toMatchObject({ id: 202, amount: 'R$ 500,00' })
    expect(store.dependents[0]!.apelido).toBe('Lili')
  })

  it('não salva parcialmente quando há rendimento inválido', async () => {
    const store = await setup()
    expect(
      await store.saveDependentWithIncomes(
        { ...emptyDependent(), apelido: 'Lia', teve_renda_propria: true },
        [{ id: -1, category: 'clt', amount: 'R$ 100,00', inss: 'R$ 101,00', irrf: '' }],
      ),
    ).toBe(false)
    expect(store.dependents).toEqual([])
    expect(store.registrations).toHaveLength(1)
    expect(
      await store.saveDependentWithIncomes(
        { ...emptyDependent(), apelido: 'Lia', teve_renda_propria: true },
        [{ id: 101, category: 'clt', amount: 'R$ 100,00', inss: '', irrf: '' }],
      ),
    ).toBe(false)
    expect(store.dependents).toEqual([])
  })

  it('permite preencher depois e mantém provisória até completar o questionário', async () => {
    const store = await setup()
    const fields = { ...emptyDependent(), apelido: 'Lia', teve_renda_propria: true }
    expect(await store.saveDependentWithIncomes(fields, [])).toBe(true)
    expect(store.taxEstimate).toMatchObject({ ok: true, provisional: true })
    const lia = store.dependents[0]!
    await store.saveDependentWithIncomes(
      fields,
      [{ id: -1, category: 'clt', amount: 'R$ 100,00', inss: '', irrf: '' }],
      lia.id,
    )
    expect(store.taxEstimate).toMatchObject({ ok: true, provisional: false })
  })

  it('cadastra o mínimo, valida o apelido e edita sem trocar o vínculo', async () => {
    const store = await setup()
    expect(await store.saveDependent(emptyDependent())).toBe(false)
    const dependent = await addDependent({ apelido: '  Lia  ' })
    expect(dependent.apelido).toBe('Lia')
    expect(Object.keys(dependent).sort()).toEqual([
      'apelido',
      'em_outra_declaracao',
      'id',
      'relacao',
      'teve_renda_propria',
    ])
    await store.addExpense(expense(dependent.id))
    await store.saveDependent({ ...dependent, apelido: 'Lili', relacao: 'outro' }, dependent.id)
    expect(store.dependents).toHaveLength(1)
    expect(store.dependents[0]).toMatchObject({
      id: dependent.id,
      apelido: 'Lili',
      relacao: 'outro',
    })
    expect(store.expensesForDependent(dependent.id)).toHaveLength(1)
  })

  it('exclui da conta dependente em outra declaração, incluindo renda e despesas', async () => {
    const store = await setup()
    await addDependent()
    const excluded = await addDependent({
      apelido: 'Teo',
      em_outra_declaracao: true,
      teve_renda_propria: true,
    })
    await store.addExpense(expense(excluded.id))
    await store.addRegistration({
      id: 200,
      incomes: [
        {
          id: 201,
          category: 'clt',
          amount: 'R$ 2.000,00',
          inss: '',
          irrf: '',
          dependentId: excluded.id,
        },
      ],
    })
    expect(store.dependentCount).toBe(1)
    expect(store.taxableTotal).toBe(12_000_000)
    expect(store.taxEstimate).toMatchObject({
      ok: true,
      provisional: false,
      result: { deducaoDependentes: 227_508, totalEducacao: 0 },
    })
    expect(store.summaryPayroll).toHaveLength(1)
    expect(store.pendingDependents).toEqual([])
    await store.saveDependent({ ...excluded, em_outra_declaracao: false }, excluded.id)
    expect(store.dependentCount).toBe(2)
    expect(store.taxableTotal).toBe(14_400_000)
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { deducaoDependentes: 455_016 } })
  })

  it('mantém provisória até salvar o informe da pessoa certa e reabre ao apagar', async () => {
    const store = await setup()
    const dependent = await addDependent({ teve_renda_propria: true })
    expect(store.taxEstimate).toMatchObject({ ok: true, provisional: true })
    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 1.000,00', dependentId: dependent.id })
    expect(store.summaryTaxEstimate).toMatchObject({ ok: true, provisional: true })
    await store.saveDraft()
    expect(store.taxEstimate).toMatchObject({
      ok: true,
      provisional: false,
      result: { rendimentos: 13_200_000 },
    })
    await store.removeRegistration(store.registrations.at(-1)!.id)
    expect(store.taxEstimate).toMatchObject({ ok: true, provisional: true })
  })

  it('informe de outra pessoa não resolve a pendência; renda isenta resolve sem tributar', async () => {
    const store = await setup()
    const lia = await addDependent({ teve_renda_propria: true })
    const teo = await addDependent({ apelido: 'Teo', teve_renda_propria: true })
    await store.addRegistration({
      id: 200,
      incomes: [
        {
          id: 201,
          category: 'pensaoAlimenticia',
          amount: 'R$ 900,00',
          inss: '',
          irrf: '',
          dependentId: teo.id,
        },
      ],
    })
    expect(store.pendingDependents.map((dependent) => dependent.id)).toEqual([lia.id])
    expect(store.exemptTotal).toBe(1_080_000)
    expect(store.taxableTotal).toBe(12_000_000)
    await store.saveDependent({ ...lia, teve_renda_propria: false }, lia.id)
    expect(store.taxEstimate).toMatchObject({ ok: true, provisional: false })
  })

  it('remove apenas despesas e rendas vinculadas, preservando os demais cadastros', async () => {
    const store = await setup()
    const lia = await addDependent()
    const teo = await addDependent({ apelido: 'Teo' })
    await store.addExpense(expense(lia.id, 'Escola Lia'))
    await store.addExpense(expense(lia.id, 'Material Lia'))
    await store.addExpense(expense(teo.id, 'Escola Teo'))
    await store.addExpense(expense(null, 'Faculdade titular'))
    await store.addRegistration({
      id: 200,
      incomes: [
        { id: 201, category: 'clt', amount: 'R$ 900,00', inss: '', irrf: '', dependentId: lia.id },
      ],
    })
    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 500,00', dependentId: lia.id })
    expect(store.expensesForDependent(lia.id).map((item) => item.descricao)).toEqual([
      'Escola Lia',
      'Material Lia',
    ])
    await store.removeDependent(lia.id)
    expect(store.expenses.map((item) => item.descricao)).toEqual([
      'Escola Teo',
      'Faculdade titular',
    ])
    expect(store.dependents.map((item) => item.id)).toEqual([teo.id])
    expect(store.registrations).toHaveLength(1)
    expect(store.draftIncomes[0]).toMatchObject({ amount: '', dependentId: null })
    expect(store.taxEstimate?.ok).toBe(true)
  })

  it('mantém o limite de educação separado por beneficiário', async () => {
    const store = await setup()
    const lia = await addDependent()
    const teo = await addDependent({ apelido: 'Teo' })
    await store.addExpense(expense(lia.id))
    await store.addExpense(expense(teo.id))
    const input = buildTaxInput(store.registrations, store.household)
    expect(input.educacao.map((item) => item.pessoa)).toEqual([String(lia.id), String(teo.id)])
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { totalEducacao: 712_300 } })
  })

  it('não aplica dependentes do titular à folha de um dependente', async () => {
    const store = await setup()
    const lia = await addDependent()
    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 6.500,00', dependentId: lia.id })
    expect(store.summaryPayroll.at(-1)).toMatchObject({
      dependentes: 0,
      deducaoDependentes: 0,
    })
  })

  it('limpa despesas, dependentes e pendências ao limpar a conta', async () => {
    const store = await setup()
    const lia = await addDependent({ teve_renda_propria: true })
    await store.addExpense(expense(lia.id))
    store.clearAccountData()
    expect(store.dependents).toEqual([])
    expect(store.expenses).toEqual([])
    expect(store.pendingDependents).toEqual([])
    expect(store.taxEstimate).toBeNull()
  })
})
