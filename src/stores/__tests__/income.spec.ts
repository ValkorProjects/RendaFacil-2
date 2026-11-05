import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildTaxInput,
  estimateTax,
  incomeEntryError,
  useIncomeStore,
  type IncomeRegistration,
} from '@/stores/income'

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

const withDependents = (store: Store, count: number) => {
  store.setDraftHasDependents(true)
  store.setDraftDependentCount(count)
}

const registration = (fields: Partial<IncomeRegistration>): IncomeRegistration => ({
  id: 1,
  incomes: [],
  dependents: [],
  alimonyPaid: '',
  ...fields,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('income store · estimate from the income screen', () => {
  it('RF-08 case F1: 6.500 a month, 2 dependents without income and 800 of alimony', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    withDependents(store, 2)
    store.draftAlimony = 'R$ 800,00'

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

  it('keeps the estimate after saving, including dependents without income', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    withDependents(store, 2)
    store.draftAlimony = 'R$ 800,00'

    expect(store.saveDraft()).toBe(true)

    expect(store.dependentCount).toBe(2)
    expect(store.registrations[0]?.alimonyPaid).toBe('R$ 800,00')
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { resultado: -38_337 } })
    expect(store.summaryTaxEstimate).toEqual(store.taxEstimate)
  })

  it('RF-08 case F2: 6.000 a month without deductions gives a refund in the simplified model', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.000,00', inss: 'R$ 641,51', irrf: 'R$ 385,10' })

    expect(store.summaryTaxEstimate).toMatchObject({
      ok: true,
      result: { modelo: 'simplificado', resultado: 123_419, faltaParaCompleto: 670_188 },
    })
  })

  it('fills INSS and the tax withheld from the salary with the monthly payroll calculation', () => {
    const store = useIncomeStore()
    const income = fillDraft(store, { salary: 'R$ 6.500,00' })
    withDependents(store, 2)
    store.draftAlimony = 'R$ 800,00'

    expect(store.fillDraftIncomeFromSalary(income.id)).toBe('')

    expect(income).toMatchObject({ inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    // The payroll estimate and the annual adjustment agree with docs/calculo-irpf-2026.md.
    expect(store.summaryTaxEstimate).toMatchObject({ ok: true, result: { resultado: -38_337 } })
  })

  it('does not save a source with more withheld than its income', () => {
    const store = useIncomeStore()
    const income = fillDraft(store, { salary: 'R$ 1.000,00', irrf: 'R$ 1.000,01' })

    expect(incomeEntryError(income)).toBe('O IR retido não pode ser maior que o valor mensal.')
    expect(store.canSaveDraft).toBe(false)
    expect(store.saveDraft()).toBe(false)
  })

  it('reports an error instead of a wrong number when the engine refuses the values', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 99.999.999.999,99' })

    const estimate = store.summaryTaxEstimate
    expect(estimate?.ok).toBe(false)
    expect(estimate?.ok === false && estimate.error).toMatch('inteiros seguros')
  })
})

describe('buildTaxInput', () => {
  it('annualizes each source and leaves expenses empty', () => {
    expect(
      buildTaxInput([
        registration({
          incomes: [
            { id: 1, category: 'clt', amount: 'R$ 3.000,00', inss: 'R$ 253,41', irrf: '' },
            { id: 2, category: 'alugueis', amount: 'R$ 1.500,00', inss: '', irrf: '' },
          ],
          alimonyPaid: 'R$ 500,00',
        }),
      ]),
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

  it('counts every dependent and adds only their taxable income', () => {
    const input = buildTaxInput([
      registration({
        dependents: [
          { id: 1, incomeType: 'none', amount: '' },
          { id: 2, incomeType: 'estagio', amount: 'R$ 1.200,00' },
          { id: 3, incomeType: 'pensao', amount: 'R$ 900,00' }, // received alimony is exempt
        ],
      }),
    ])

    expect(input.dependentes).toBe(3)
    expect(input.fontes).toEqual([{ rendimentos: 1_440_000, previdencia: 0, irrf: 0 }])
  })

  it('adds up several saved registrations', () => {
    const input = buildTaxInput([
      registration({
        id: 1,
        incomes: [{ id: 1, category: 'clt', amount: 'R$ 1.000,00', inss: '', irrf: '' }],
        dependents: [{ id: 1, incomeType: 'none', amount: '' }],
      }),
      registration({ id: 2, alimonyPaid: 'R$ 100,00' }),
    ])

    expect(input).toMatchObject({ dependentes: 1, pensoes: 120_000 })
    expect(input.fontes).toHaveLength(1)
  })
})

describe('estimateTax', () => {
  it('has nothing to estimate without income', () => {
    expect(estimateTax([])).toBeNull()
    expect(estimateTax([registration({ alimonyPaid: 'R$ 800,00' })])).toBeNull()
  })
})
