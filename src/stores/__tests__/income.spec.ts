import { databaseMock, USER_A } from '@/data/__tests__/supabaseMock'
import { emptyDependent } from '@/utils/dependents'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildPayrollRows,
  buildTaxInput,
  emptyHousehold,
  estimateTax,
  incomeEntryError,
  incomeEntryWarnings,
  inssCeilingWarning,
  payrollEstimate,
  useIncomeStore,
  type Household,
  type IncomeRegistration,
  type RegisteredDependent,
  type RegisteredExpense,
  type RegisteredIncomeEntry,
} from '@/stores/income'

vi.mock('@/lib/supabase', () => ({ getSupabase: () => databaseMock.client }))

// The income screen works with monthly amounts typed into masked inputs ("R$ 6.500,00"); the
// store annualizes them and passes them to the tax engine.

type Store = ReturnType<typeof useIncomeStore>

const fillDraft = (
  store: Store,
  { salary, inss = '', irrf = '' }: { salary: string; inss?: string; irrf?: string },
) => {
  const [income] = store.draftIncomes
  if (!income) throw new Error('The form starts with one income source')
  Object.assign(income, { amount: salary, inss, irrf })
  return income
}

const withDependents = async (store: Store, count: number) => {
  for (let index = 0; index < count; index++)
    await store.saveDependent({ ...emptyDependent(), apelido: 'Pessoa ' + index })
}

const registration = (fields: Partial<IncomeRegistration>): IncomeRegistration => ({
  id: 1,
  incomes: [],
  ...fields,
})

const household = (fields: Partial<Household>): Household => ({ ...emptyHousehold(), ...fields })

const pensionExpense = (
  fields: Partial<Omit<RegisteredExpense, 'id'>> = {},
): Omit<RegisteredExpense, 'id'> => ({
  descricao: 'Pensão alimentícia',
  categoria: 'pensao',
  tipo: 'pensao_alimenticia',
  beneficiario: 'outra',
  dependente_id: null,
  recebedor: 'Pessoa beneficiada',
  pensao_iniciou_em_2026: false,
  valor_centavos: 960_000,
  reembolso_centavos: 0,
  base_legal_ok: true,
  ...fields,
})

const savedPensionExpense = (
  fields: Partial<Omit<RegisteredExpense, 'id'>> = {},
): RegisteredExpense => ({ ...pensionExpense(fields), id: 'pension' })

const noIncomeDependents = (count: number): RegisteredDependent[] =>
  Array.from({ length: count }, (_, index) => ({
    ...emptyDependent(),
    id: index + 1,
    apelido: 'Pessoa ' + index,
  }))

beforeEach(async () => {
  setActivePinia(createPinia())
  databaseMock.reset()
  await useIncomeStore().loadAccount(USER_A)
})

describe('income store · estimate from the income screen', () => {
  it('requires a named recipient for an alimony expense', async () => {
    const store = useIncomeStore()

    expect(await store.addExpense(pensionExpense({ recebedor: '' }))).toBe(false)
    expect(databaseMock.state.expenses).toEqual([])
  })

  it('RF-08 case F1: 6.500 a month, 2 dependents without income and 800 of alimony', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    await withDependents(store, 2)
    await store.addExpense(pensionExpense())

    expect(store.summaryTaxEstimate).toMatchObject({
      ok: true,
      result: {
        rendimentos: 7_800_000,
        totalPrevidencia: 853_812,
        irrfRetido: 298_104,
        deducaoDependentes: 455_016,
        totalPensoes: 960_000,
        modelo: 'completo',
        impostoDevido: 336_441,
        resultado: -38_337,
      },
    })
  })

  it('keeps the estimate after saving, including dependents without income', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    await withDependents(store, 2)
    expect(await store.saveDraft()).toBe(true)
    await store.addExpense(pensionExpense())

    expect(store.dependentCount).toBe(2)
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { resultado: -38_337 } })
    expect(store.summaryTaxEstimate).toEqual(store.taxEstimate)
  })

  it('keeps dependents and pension expenses for the next registration instead of starting them over', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    await withDependents(store, 2)
    await store.saveDraft()
    await store.addExpense(pensionExpense())

    expect(store.hasDependents).toBe(true)
    expect(store.dependents).toHaveLength(2)
    expect(store.expenses).toHaveLength(1)
    expect(store.draftIncomes[0]?.amount).toBe('')
  })

  it('counts dependents and alimony once with a second job (F1 + 2.000 a month)', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    await withDependents(store, 2)
    await store.saveDraft()
    await store.addExpense(pensionExpense())
    fillDraft(store, { salary: 'R$ 2.000,00', inss: 'R$ 150,00' })
    await store.saveDraft()

    // Dependents and pension expenses are tied to the declaration, not duplicated by another job.
    expect(store.registrations).toHaveLength(2)
    expect(store.dependentCount).toBe(2)
    expect(store.taxEstimate).toMatchObject({
      ok: true,
      result: { deducaoDependentes: 455_016, totalPensoes: 960_000, resultado: -743_002 },
    })
  })

  it('updates the confirmed estimate after saving dependents and a pension expense', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    await store.saveDraft()
    const without = store.taxEstimate

    await withDependents(store, 2)
    await store.addExpense(pensionExpense())
    expect(store.taxEstimate).not.toEqual(without)
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { resultado: -38_337 } })
  })

  it('clears dependents and pension expenses with the account data', async () => {
    const store = useIncomeStore()
    await withDependents(store, 2)
    await store.addExpense(pensionExpense())

    store.clearAccountData()

    expect(store.hasDependents).toBe(false)
    expect(store.dependents).toEqual([])
    expect(store.expenses).toEqual([])
    expect(store.monthlyPensionPaid).toBe(0)
  })

  it('RF-08 case F2: 6.000 a month without deductions gives a refund in the simplified model', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.000,00', inss: 'R$ 641,51', irrf: 'R$ 385,10' })

    expect(store.summaryTaxEstimate).toMatchObject({
      ok: true,
      result: { modelo: 'simplificado', resultado: 123_419, faltaParaCompleto: 670_188 },
    })
  })

  it('fills INSS and the tax withheld from the salary with the monthly payroll calculation', async () => {
    const store = useIncomeStore()
    const income = fillDraft(store, { salary: 'R$ 6.500,00' })
    await withDependents(store, 2)
    await store.addExpense(pensionExpense())

    expect(store.fillDraftIncomeFromSalary(income.id)).toBe('')

    expect(income).toMatchObject({ inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    expect(store.summaryTaxEstimate).toMatchObject({ ok: true, result: { totalPensoes: 960_000 } })
  })

  it('does not count a pension recipient as a dependent when the pension predates 2026', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    await store.saveDraft()
    await store.saveDependent({ ...emptyDependent(), apelido: 'Lia' })
    const dependent = store.dependents[0]!
    await store.addExpense(
      pensionExpense({
        beneficiario: 'dependente',
        dependente_id: String(dependent.id),
        recebedor: 'Lia',
        pensao_iniciou_em_2026: false,
      }),
    )

    expect(store.dependentCount).toBe(0)
    expect(store.taxEstimate).toMatchObject({
      ok: true,
      result: { deducaoDependentes: 0, totalPensoes: 960_000 },
    })
  })

  it('does not save a source with more withheld than its income', async () => {
    const store = useIncomeStore()
    const income = fillDraft(store, { salary: 'R$ 1.000,00', irrf: 'R$ 1.000,01' })

    expect(incomeEntryError(income)).toBe('O IR retido não pode ser maior que o valor mensal.')
    expect(store.canSaveDraft).toBe(false)
    expect(await store.saveDraft()).toBe(false)
  })

  it('reports an error instead of a wrong number when the engine refuses the values', async () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 99.999.999.999,99' })

    const estimate = store.summaryTaxEstimate
    expect(estimate?.ok).toBe(false)
    expect(estimate?.ok === false && estimate.error).toMatch('inteiros seguros')
  })

})

describe('buildTaxInput', () => {
  it('annualizes each source and counts pension only from expense rows', async () => {
    expect(
      buildTaxInput(
        [
          registration({
            incomes: [
              { id: 1, category: 'clt', amount: 'R$ 3.000,00', inss: 'R$ 253,41', irrf: '' },
              { id: 2, category: 'alugueis', amount: 'R$ 1.500,00', inss: '', irrf: '' },
            ],
          }),
        ],
        household({
          expenses: [savedPensionExpense({ valor_centavos: 600_000 })],
        }),
      ),
    ).toEqual({
      fontes: [
        { rendimentos: 3_600_000, previdencia: 304_092, irrf: 0 },
        { rendimentos: 1_800_000, previdencia: 0, irrf: 0 },
      ],
      dependentes: 0,
      pensoes: 600_000,
      saude: [],
      educacao: [],
    })
  })

  it('counts valid dependents and adds only their taxable income from Rendas', async () => {
    const input = buildTaxInput(
      [
        registration({
          incomes: [
            {
              id: 1,
              category: 'autonomo',
              amount: 'R$ 1.200,00',
              inss: '',
              irrf: '',
              dependentId: 2,
            },
            {
              id: 2,
              category: 'pensaoAlimenticia',
              amount: 'R$ 900,00',
              inss: '',
              irrf: '',
              dependentId: 3,
            },
          ],
        }),
      ],
      household({ dependents: noIncomeDependents(3) }),
    )
    expect(input.dependentes).toBe(3)
    expect(input.fontes).toEqual([{ rendimentos: 1_440_000, previdencia: 0, irrf: 0 }])
  })

  it('adds up the sources of several registrations, with dependents and pension once', async () => {
    const input = buildTaxInput(
      [
        registration({
          id: 1,
          incomes: [{ id: 1, category: 'clt', amount: 'R$ 1.000,00', inss: '', irrf: '' }],
        }),
        registration({
          id: 2,
          incomes: [{ id: 2, category: 'clt', amount: 'R$ 2.000,00', inss: '', irrf: '' }],
        }),
      ],
      household({
        dependents: noIncomeDependents(1),
        expenses: [savedPensionExpense({ valor_centavos: 120_000 })],
      }),
    )

    expect(input).toMatchObject({ dependentes: 1, pensoes: 120_000 })
    expect(input.fontes).toHaveLength(2)
  })
})

describe('estimateTax', () => {
  it('has nothing to estimate without income', async () => {
    expect(estimateTax([], emptyHousehold())).toBeNull()
    expect(
      estimateTax(
        [registration({})],
        household({
          dependents: noIncomeDependents(2),
          expenses: [savedPensionExpense()],
        }),
      ),
    ).toBeNull()
  })
})

// Intl puts a non-breaking space after "R$".
const plain = (text: string | undefined) => (text ?? '').replace(/\u00a0/g, ' ')

describe('INSS and income tax checks against the payslip calculation', () => {
  const clt = (fields: Partial<RegisteredIncomeEntry>): RegisteredIncomeEntry => ({
    id: 1,
    category: 'clt',
    amount: 'R$ 6.500,00',
    inss: '',
    irrf: '',
    ...fields,
  })

  it('estimates INSS and IRRF for a CLT salary (6.500, 2 dependents, 800 of alimony)', async () => {
    expect(payrollEstimate(clt({}), 2, 80_000)).toMatchObject({ inss: 71_151, irrf: 24_842 })
  })

  it('has no estimate for other categories or without a salary', async () => {
    expect(payrollEstimate(clt({ category: 'alugueis' }), 0)).toBeNull()
    expect(payrollEstimate(clt({ amount: '' }), 0)).toBeNull()
  })

  it('warns when the typed INSS is above the table: 6.500 with INSS of 1.300', async () => {
    const warnings = incomeEntryWarnings(clt({ inss: 'R$ 1.300,00' }), 2, 80_000)

    expect(warnings).toHaveLength(1)
    expect(plain(warnings[0])).toContain('INSS informado (R$ 1.300,00)')
    expect(plain(warnings[0])).toContain('R$ 711,51')
  })

  it('warns when the typed income tax differs from the payroll table', async () => {
    const warnings = incomeEntryWarnings(clt({ inss: 'R$ 711,51', irrf: 'R$ 900,00' }), 2, 80_000)

    expect(warnings).toHaveLength(1)
    expect(plain(warnings[0])).toContain('IR retido informado (R$ 900,00)')
    expect(plain(warnings[0])).toContain('R$ 248,42')
  })

  it('stays quiet when the values match (to the cent) or are not typed yet', async () => {
    expect(incomeEntryWarnings(clt({ inss: 'R$ 711,51', irrf: 'R$ 248,42' }), 2, 80_000)).toEqual(
      [],
    )
    expect(incomeEntryWarnings(clt({}), 2, 80_000)).toEqual([])
    // within the R$ 0,10 rounding tolerance
    expect(incomeEntryWarnings(clt({ inss: 'R$ 711,55', irrf: 'R$ 248,40' }), 2, 80_000)).toEqual(
      [],
    )
  })

  it('does not warn about a lower INSS: a second employer shares the ceiling', async () => {
    expect(incomeEntryWarnings(clt({ inss: 'R$ 400,00' }), 2, 80_000)).toEqual([])
  })

  it('never blocks saving: the warnings are only advice', async () => {
    const store = useIncomeStore()
    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 6.500,00', inss: 'R$ 1.300,00' })

    expect(store.canSaveDraft).toBe(true)
  })

  it('builds the monthly rows for the card, with the payroll only for CLT', async () => {
    const rows = buildPayrollRows(
      [
        registration({
          incomes: [
            { id: 1, category: 'clt', amount: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' },
            { id: 2, category: 'alugueis', amount: 'R$ 1.000,00', inss: '', irrf: '' },
            { id: 3, category: 'clt', amount: '', inss: '', irrf: '' },
          ],
        }),
      ],
      household({
        dependents: noIncomeDependents(2),
        expenses: [savedPensionExpense()],
      }),
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      informado: { bruto: 650_000, inss: 71_151, irrf: 24_842 },
      dependentes: 2,
      deducaoDependentes: 37_918,
      folha: { inss: 71_151, irrf: 24_842 },
    })
    expect(rows[1]?.folha).toBeNull()
  })
})

describe('INSS ceiling warning (RF-12)', () => {
  const source = (id: number, inss: string) => ({
    id,
    category: 'clt' as const,
    amount: 'R$ 6.500,00',
    inss,
    irrf: '',
  })

  it('stays quiet up to the yearly ceiling (12 × 988,09)', async () => {
    expect(inssCeilingWarning([registration({ incomes: [source(1, 'R$ 988,09')] })])).toBe('')
  })

  it('warns when two sources together pass it: CLT plus a pró-labore', async () => {
    const warning = inssCeilingWarning([
      registration({ incomes: [source(1, 'R$ 711,51'), source(2, 'R$ 330,00')] }),
    ]).replace(/\u00a0/g, ' ')

    expect(warning).toContain('R$ 12.498,12 por ano')
    expect(warning).toContain('R$ 11.857,08 por ano')
  })

  it('adds the form being filled to the saved registrations', async () => {
    const store = useIncomeStore()
    await store.addRegistration(registration({ incomes: [source(1, 'R$ 711,51')] }))
    expect(store.summaryInssWarning).toBe('')

    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 3.000,00', inss: 'R$ 330,00' })

    expect(store.summaryInssWarning).not.toBe('')
  })
})
