import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildPayrollRows,
  buildTaxInput,
  estimateTax,
  incomeEntryError,
  incomeEntryWarnings,
  inssCeilingWarning,
  payrollEstimate,
  useIncomeStore,
  type IncomeRegistration,
  type RegisteredIncomeEntry,
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

  it('estimates INSS and IRRF for a CLT salary (6.500, 2 dependents, 800 of alimony)', () => {
    expect(payrollEstimate(clt({}), 2, 'R$ 800,00')).toMatchObject({ inss: 71_151, irrf: 24_842 })
  })

  it('has no estimate for other categories or without a salary', () => {
    expect(payrollEstimate(clt({ category: 'alugueis' }), 0, '')).toBeNull()
    expect(payrollEstimate(clt({ amount: '' }), 0, '')).toBeNull()
  })

  it('warns when the typed INSS is above the table: 6.500 with INSS of 1.300', () => {
    const warnings = incomeEntryWarnings(clt({ inss: 'R$ 1.300,00' }), 2, 'R$ 800,00')

    expect(warnings).toHaveLength(1)
    expect(plain(warnings[0])).toContain('INSS informado (R$ 1.300,00)')
    expect(plain(warnings[0])).toContain('R$ 711,51')
  })

  it('warns when the typed income tax differs from the payroll table', () => {
    const warnings = incomeEntryWarnings(
      clt({ inss: 'R$ 711,51', irrf: 'R$ 900,00' }),
      2,
      'R$ 800,00',
    )

    expect(warnings).toHaveLength(1)
    expect(plain(warnings[0])).toContain('IR retido informado (R$ 900,00)')
    expect(plain(warnings[0])).toContain('R$ 248,42')
  })

  it('stays quiet when the values match (to the cent) or are not typed yet', () => {
    expect(
      incomeEntryWarnings(clt({ inss: 'R$ 711,51', irrf: 'R$ 248,42' }), 2, 'R$ 800,00'),
    ).toEqual([])
    expect(incomeEntryWarnings(clt({}), 2, 'R$ 800,00')).toEqual([])
    // within the R$ 0,10 rounding tolerance
    expect(
      incomeEntryWarnings(clt({ inss: 'R$ 711,55', irrf: 'R$ 248,40' }), 2, 'R$ 800,00'),
    ).toEqual([])
  })

  it('does not warn about a lower INSS: a second employer shares the ceiling', () => {
    expect(incomeEntryWarnings(clt({ inss: 'R$ 400,00' }), 2, 'R$ 800,00')).toEqual([])
  })

  it('never blocks saving: the warnings are only advice', () => {
    const store = useIncomeStore()
    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 6.500,00', inss: 'R$ 1.300,00' })

    expect(store.canSaveDraft).toBe(true)
  })

  it('builds the monthly rows for the card, with the payroll only for CLT', () => {
    const rows = buildPayrollRows([
      registration({
        incomes: [
          { id: 1, category: 'clt', amount: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' },
          { id: 2, category: 'alugueis', amount: 'R$ 1.000,00', inss: '', irrf: '' },
          { id: 3, category: 'clt', amount: '', inss: '', irrf: '' },
        ],
        dependents: [
          { id: 1, incomeType: 'none', amount: '' },
          { id: 2, incomeType: 'none', amount: '' },
        ],
        alimonyPaid: 'R$ 800,00',
      }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      informado: { bruto: 650_000, inss: 71_151, irrf: 24_842 },
      dependentes: 2,
      deducaoDependentes: 37_918,
      pensao: 80_000,
      folha: { inss: 71_151, irrf: 24_842, base: 460_931 },
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

  it('stays quiet up to the yearly ceiling (12 × 988,09)', () => {
    expect(inssCeilingWarning([registration({ incomes: [source(1, 'R$ 988,09')] })])).toBe('')
  })

  it('warns when two sources together pass it: CLT plus a pró-labore', () => {
    const warning = inssCeilingWarning([
      registration({ incomes: [source(1, 'R$ 711,51'), source(2, 'R$ 330,00')] }),
    ]).replace(/\u00a0/g, ' ')

    expect(warning).toContain('R$ 12.498,12 por ano')
    expect(warning).toContain('R$ 11.857,08 por ano')
  })

  it('adds the form being filled to the saved registrations', () => {
    const store = useIncomeStore()
    store.addRegistration(registration({ incomes: [source(1, 'R$ 711,51')] }))
    expect(store.summaryInssWarning).toBe('')

    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 3.000,00', inss: 'R$ 330,00' })

    expect(store.summaryInssWarning).not.toBe('')
  })
})
