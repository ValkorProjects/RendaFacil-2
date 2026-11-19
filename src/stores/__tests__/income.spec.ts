import { emptyDependent } from '@/utils/dependents'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildPayrollRows,
  buildTaxInput,
  emptyHousehold,
  estimateTax,
  incomeEntryError,
  incomeEntryWarnings,
  inssCeilingWarning,
  payrollEstimate,
  sourceTitle,
  useIncomeStore,
  type Household,
  type IncomeRegistration,
  type RegisteredDependent,
  type RegisteredExpense,
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
  for (let index = 0; index < count; index++)
    store.saveDependent({ ...emptyDependent(), apelido: 'Pessoa ' + index })
}

const registration = (fields: Partial<IncomeRegistration>): IncomeRegistration => ({
  id: 1,
  incomes: [],
  ...fields,
})

const household = (fields: Partial<Household>): Household => ({ ...emptyHousehold(), ...fields })

const noIncomeDependents = (count: number): RegisteredDependent[] =>
  Array.from({ length: count }, (_, index) => ({
    ...emptyDependent(),
    id: index + 1,
    apelido: 'Pessoa ' + index,
  }))

// Alimony paid is an expense on the Despesas screen (RF-13): 800 a month is 9.600,00 a year.
const expense = (fields: Partial<RegisteredExpense> = {}): RegisteredExpense => ({
  id: 1,
  categoria: 'pensao',
  tipo: 'pensao_alimenticia',
  beneficiario: 'outra',
  dependente_id: null,
  valor_centavos: 960_000,
  reembolso_centavos: 0,
  base_legal_ok: true,
  data: '2026-01-01',
  descricao: '',
  recebedor: 'Pessoa beneficiária',
  pensaoIniciouEm2026: false,
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
    store.addExpense(expense())

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
    store.addExpense(expense())

    expect(store.saveDraft()).toBe(true)

    expect(store.dependentCount).toBe(2)
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { resultado: -38_337 } })
    expect(store.summaryTaxEstimate).toEqual(store.taxEstimate)
  })

  it('keeps dependents and alimony for the next registration instead of starting them over', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    withDependents(store, 2)
    store.addExpense(expense())
    store.saveDraft()

    expect(store.hasDependents).toBe(true)
    expect(store.dependents).toHaveLength(2)
    expect(store.expenses).toHaveLength(1)
    expect(store.draftIncomes[0]?.amount).toBe('')
  })

  it('counts dependents and alimony once with a second job (F1 + 2.000 a month)', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    withDependents(store, 2)
    store.addExpense(expense())
    store.saveDraft()
    fillDraft(store, { salary: 'R$ 2.000,00', inss: 'R$ 150,00' })
    store.saveDraft()

    // Before, a second registration kept its own copy: typing them again counted 4 dependents and
    // 19.200,00 of alimony, and the tax due came out R$ 3.891,29 too low.
    expect(store.registrations).toHaveLength(2)
    expect(store.dependentCount).toBe(2)
    expect(store.taxEstimate).toMatchObject({
      ok: true,
      result: { deducaoDependentes: 455_016, totalPensoes: 960_000, resultado: -743_002 },
    })
  })

  it('applies a change to dependents or alimony at once, with nothing to save', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    store.saveDraft()
    const without = store.taxEstimate

    withDependents(store, 2)
    store.addExpense(expense())

    expect(store.taxEstimate).not.toEqual(without)
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { resultado: -38_337 } })
  })

  it('clears dependents and alimony with the account data', () => {
    const store = useIncomeStore()
    withDependents(store, 2)
    store.addExpense(expense())

    store.clearAccountData()

    expect(store.hasDependents).toBe(false)
    expect(store.dependents).toEqual([])
    expect(store.expenses).toEqual([])
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
    store.addExpense(expense())

    expect(store.fillDraftIncomeFromSalary(income.id)).toBe('')

    // Alimony is entered once a year in Despesas and is not assumed in the monthly payroll.
    expect(income).toMatchObject({ inss: 'R$ 711,51', irrf: 'R$ 465,65' })
    expect(store.summaryTaxEstimate).toMatchObject({ ok: true, result: { totalPensoes: 960_000 } })
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

  it('has no expense effects, instead of throwing, when the engine refuses the saved values', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 99.999.999.999,99' })
    expect(store.saveDraft()).toBe(true)

    expect(() => store.deductionEffects).not.toThrow()
    expect(store.deductionEffects).toBeNull()
    expect(store.taxEstimate?.ok).toBe(false)
  })
})

describe('buildTaxInput', () => {
  it('annualizes each source and takes alimony from the expenses', () => {
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
        household({ expenses: [expense({ valor_centavos: 600_000 })] }),
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

  it('counts valid dependents and adds only their taxable income from Rendas', () => {
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

  it('adds up the sources of several registrations, with dependents and alimony once', () => {
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
        expenses: [expense({ valor_centavos: 120_000 })],
      }),
    )

    expect(input).toMatchObject({ dependentes: 1, pensoes: 120_000 })
    expect(input.fontes).toHaveLength(2)
  })
})

describe('estimateTax', () => {
  it('has nothing to estimate without income', () => {
    expect(estimateTax([], emptyHousehold())).toBeNull()
    expect(
      estimateTax(
        [registration({})],
        household({ dependents: noIncomeDependents(2), expenses: [expense()] }),
      ),
    ).toBeNull()
  })
})

describe('income store · deductible expenses (RF-13)', () => {
  const withSalary = (store: Store, salary: string) =>
    store.addRegistration(
      registration({ incomes: [{ id: 1, category: 'clt', amount: salary, inss: '', irrf: '' }] }),
    )

  it('registers non-deductible expenses, explains why, and leaves the tax estimate unchanged', () => {
    const store = useIncomeStore()
    withSalary(store, 'R$ 6.500,00')
    const estimateWithoutExpenses = store.taxEstimate
    store.addExpense(
      expense({
        categoria: 'saude',
        tipo: 'remedio_farmacia',
        beneficiario: 'titular',
        valor_centavos: 50_000,
        base_legal_ok: null,
      }),
    )
    store.addExpense(
      expense({
        categoria: 'educacao',
        tipo: 'curso_idiomas',
        beneficiario: 'titular',
        valor_centavos: 100_000,
        base_legal_ok: null,
      }),
    )

    expect(store.expenses).toHaveLength(2)
    expect(store.deductionEffects?.despesas.map((item) => item.mensagens[0])).toEqual([
      'Não deduz: remédio de farmácia (fora da conta do hospital)',
      'Não deduz: curso de idiomas',
    ])
    expect(store.taxEstimate).toEqual(estimateWithoutExpenses)
  })

  it('updates the education bar and removes the expenses of a removed dependent', () => {
    const store = useIncomeStore()
    withDependents(store, 1)
    const dependentId = String(store.dependents[0]!.id)
    store.addExpense(
      expense({
        categoria: 'educacao',
        tipo: 'graduacao',
        beneficiario: 'dependente',
        dependente_id: dependentId,
        valor_centavos: 200_000,
        base_legal_ok: null,
      }),
    )

    expect(store.deductionEffects?.educacaoPorPessoa).toMatchObject([
      { pessoa: dependentId, uso: 200_000, restante: 156_150 },
    ])

    store.removeDependent(store.dependents[0]!.id)
    expect(store.expenses).toEqual([])
    expect(store.deductionEffects?.educacaoPorPessoa).toEqual([])
  })

  it('does not count expenses or income for a dependent in another declaration', () => {
    const store = useIncomeStore()
    withSalary(store, 'R$ 5.000,00')
    store.saveDependent({ ...emptyDependent(), apelido: 'Duda', em_outra_declaracao: true })
    const dependent = store.dependents[0]!
    store.addRegistration(
      registration({
        id: 2,
        incomes: [
          {
            id: 3,
            category: 'clt',
            amount: 'R$ 1.000,00',
            inss: '',
            irrf: '',
            dependentId: dependent.id,
          },
        ],
      }),
    )
    store.addExpense(
      expense({
        categoria: 'educacao',
        tipo: 'graduacao',
        beneficiario: 'dependente',
        dependente_id: String(dependent.id),
        valor_centavos: 200_000,
        base_legal_ok: null,
      }),
    )

    expect(store.dependentCount).toBe(0)
    expect(store.taxEstimate).toMatchObject({
      ok: true,
      result: { rendimentos: 6_000_000, deducaoDependentes: 0 },
    })
    expect(store.deductionEffects?.educacaoPorPessoa).toEqual([])
    expect(store.deductionEffects?.despesas[0]?.situacao).toBe('nao_deduz')
  })

  it('refuses an invalid expense when adding and when editing', () => {
    const store = useIncomeStore()
    const health = {
      categoria: 'saude',
      tipo: 'consulta_medica',
      beneficiario: 'titular',
      base_legal_ok: null,
    } as const
    expect(store.addExpense(expense({ ...health, valor_centavos: 0 }))).toBe(false)
    expect(
      store.addExpense(expense({ ...health, valor_centavos: 10_000, reembolso_centavos: 10_001 })),
    ).toBe(false)
    expect(
      store.addExpense(expense({ ...health, beneficiario: 'dependente', dependente_id: '999' })),
    ).toBe(false)
    expect(store.expenses).toEqual([])

    expect(
      store.addExpense(expense({ ...health, valor_centavos: 10_000, descricao: '  Consulta  ' })),
    ).toBe(true)
    const saved = store.expenses[0]!
    expect(saved.descricao).toBe('Consulta')
    expect(store.updateExpense({ ...saved, reembolso_centavos: 20_000 })).toBe(false)
    expect(store.updateExpense({ ...saved, id: saved.id + 100 })).toBe(false)
    expect(store.updateExpense({ ...saved, valor_centavos: 12_000 })).toBe(true)
    expect(store.expenses).toMatchObject([{ id: saved.id, valor_centavos: 12_000 }])
  })

  it('does not deduct alimony without the legal basis confirmed', () => {
    const store = useIncomeStore()
    withSalary(store, 'R$ 6.500,00')
    store.addExpense(expense({ base_legal_ok: false }))

    expect(store.taxEstimate).toMatchObject({ ok: true, result: { totalPensoes: 0 } })
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

  it('estimates INSS and IRRF for a CLT salary without assuming alimony payments', () => {
    expect(payrollEstimate(clt({}), 2)).toMatchObject({ inss: 71_151, irrf: 46_565 })
  })

  it('has no estimate for other categories or without a salary', () => {
    expect(payrollEstimate(clt({ category: 'alugueis' }), 0)).toBeNull()
    expect(payrollEstimate(clt({ amount: '' }), 0)).toBeNull()
  })

  it('warns when the typed INSS is above the table: 6.500 with INSS of 1.300', () => {
    const warnings = incomeEntryWarnings(clt({ inss: 'R$ 1.300,00' }), 2)

    expect(warnings).toHaveLength(1)
    expect(plain(warnings[0])).toContain('INSS informado (R$ 1.300,00)')
    expect(plain(warnings[0])).toContain('R$ 711,51')
  })

  it('warns when the typed income tax differs from the payroll table', () => {
    const warnings = incomeEntryWarnings(clt({ inss: 'R$ 711,51', irrf: 'R$ 900,00' }), 2)

    expect(warnings).toHaveLength(1)
    expect(plain(warnings[0])).toContain('IR retido informado (R$ 900,00)')
    expect(plain(warnings[0])).toContain('R$ 465,65')
  })

  it('stays quiet when the values match (to the cent) or are not typed yet', () => {
    expect(incomeEntryWarnings(clt({ inss: 'R$ 711,51', irrf: 'R$ 465,65' }), 2)).toEqual([])
    expect(incomeEntryWarnings(clt({}), 2)).toEqual([])
    // within the R$ 0,10 rounding tolerance
    expect(incomeEntryWarnings(clt({ inss: 'R$ 711,55', irrf: 'R$ 465,63' }), 2)).toEqual([])
  })

  it('does not warn about a lower INSS: a second employer shares the ceiling', () => {
    expect(incomeEntryWarnings(clt({ inss: 'R$ 400,00' }), 2)).toEqual([])
  })

  it('never blocks saving: the warnings are only advice', () => {
    const store = useIncomeStore()
    Object.assign(store.draftIncomes[0]!, { amount: 'R$ 6.500,00', inss: 'R$ 1.300,00' })

    expect(store.canSaveDraft).toBe(true)
  })

  it('builds the monthly rows for the card, with the payroll only for CLT', () => {
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
      household({ dependents: noIncomeDependents(2) }),
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      informado: { bruto: 650_000, inss: 71_151, irrf: 24_842 },
      dependentes: 2,
      deducaoDependentes: 37_918,
      folha: { inss: 71_151, irrf: 46_565 },
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

describe('income store · companies, 13º and PLR (RF-12)', () => {
  it('counts the companies against the expected number and keeps the estimate provisional', () => {
    const store = useIncomeStore()
    store.setExpectedStatements(2)
    fillDraft(store, { salary: 'R$ 6.500,00' })
    store.saveDraft()

    expect(store.statementCount).toBe(1)
    expect(store.estimateStatus).toEqual(['Falta lançar 1 empresa que pagou salário.'])

    store.setExpectedStatements(3)
    expect(store.estimateStatus).toEqual(['Falta lançar 2 empresas que pagaram salário.'])

    store.setExpectedStatements(1)
    expect(store.estimateStatus).toEqual([])
  })

  it('counts only the companies that paid a salary (CLT and pró-labore)', () => {
    const store = useIncomeStore()
    store.setExpectedStatements(2)
    fillDraft(store, { salary: 'R$ 6.500,00' })
    store.saveDraft()
    Object.assign(store.draftIncomes[0]!, { category: 'alugueis', amount: 'R$ 1.000,00' })
    store.saveDraft()

    // Rent is not a company that paid a salary: one is still missing.
    expect(store.statementCount).toBe(1)
    expect(store.estimateStatus).toContain('Falta lançar 1 empresa que pagou salário.')

    Object.assign(store.draftIncomes[0]!, { category: 'proLabore', amount: 'R$ 3.000,00' })
    store.saveDraft()

    expect(store.statementCount).toBe(2)
    expect(store.estimateStatus).toEqual([
      'O resultado considera só salários. Você lançou: Aluguéis, Pró-labore.',
    ])
  })

  it('keeps the yearly 13º and PLR, shows them apart and leaves them out of the adjustment', () => {
    const store = useIncomeStore()
    const income = fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51' })
    const withoutExtras = store.summaryTaxEstimate
    Object.assign(income, {
      employer: 'Empresa A',
      thirteenth: 'R$ 6.500,00',
      thirteenthIrrf: 'R$ 400,00',
      profitSharing: 'R$ 3.000,00',
    })
    store.saveDraft()

    expect(store.registrations[0]?.incomes[0]).toMatchObject({
      employer: 'Empresa A',
      thirteenth: 'R$ 6.500,00',
      profitSharing: 'R$ 3.000,00',
    })
    // The 13º and the PLR are yearly amounts: not multiplied by 12.
    expect(store.exclusiveTaxationTotal).toBe(950_000)
    expect(store.taxableTotal).toBe(7_800_000)
    expect(store.taxEstimate).toEqual(withoutExtras)
  })

  it('does not accept more income tax on the 13º than the 13º itself', () => {
    const store = useIncomeStore()
    const income = fillDraft(store, { salary: 'R$ 6.500,00' })
    Object.assign(income, { thirteenth: 'R$ 500,00', thirteenthIrrf: 'R$ 500,01' })

    expect(incomeEntryError(income)).toBe('O IR sobre o 13º não pode ser maior que o 13º salário.')
    expect(store.saveDraft()).toBe(false)
  })
})

describe('income store · status of the estimate on the Home (RF-14)', () => {
  it('is complete with salary only, and follows each save without a reload', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    store.saveDraft()
    withDependents(store, 2)
    store.addExpense(expense())

    expect(store.estimateStatus).toEqual([])
    // F1: the saved estimate (what the Home shows) already counts the dependents and the alimony.
    expect(store.taxEstimate).toMatchObject({
      ok: true,
      result: {
        modelo: 'completo',
        impostoDevido: 336_441,
        irrfRetido: 298_104,
        resultado: -38_337,
      },
    })
    expect(store.payroll).toHaveLength(1)
  })

  it('lists a dependent with income of their own whose statement is missing', () => {
    const store = useIncomeStore()
    fillDraft(store, { salary: 'R$ 6.000,00' })
    store.saveDraft()
    store.saveDependent({ ...emptyDependent(), apelido: 'Lia', teve_renda_propria: true })

    expect(store.estimateStatus).toEqual(['Falta o informe de rendimentos de Lia.'])
  })

  it('says the result only considers salaries when other income was entered', () => {
    const store = useIncomeStore()
    store.setExpectedStatements(0)
    const [income] = store.draftIncomes
    Object.assign(income!, { category: 'alugueis', amount: 'R$ 1.500,00' })
    store.saveDraft()

    expect(store.estimateStatus).toEqual([
      'O resultado considera só salários. Você lançou: Aluguéis.',
    ])
  })
})

describe('INSS ceiling per person (RF-12)', () => {
  const source = (id: number, inss: string) => ({
    id,
    category: 'clt' as const,
    amount: 'R$ 6.500,00',
    inss,
    irrf: '',
  })

  it('checks the ceiling for each person, not for the household', () => {
    const store = useIncomeStore()
    store.saveDependent({ ...emptyDependent(), apelido: 'Lia', teve_renda_propria: true })
    const lia = store.dependents[0]!
    store.addRegistration(
      registration({
        incomes: [source(1, 'R$ 711,51'), { ...source(2, 'R$ 711,51'), dependentId: lia.id }],
      }),
    )
    // 17.076,24 a year for the household, but each person stays under 11.857,08.
    expect(store.summaryInssWarning).toBe('')

    store.addRegistration(registration({ id: 2, incomes: [source(3, 'R$ 330,00')] }))
    expect(store.summaryInssWarning).toMatch(/^Titular: /)
    expect(store.summaryInssWarning).not.toContain('Lia:')
  })
})

describe('income store · editing a saved lançamento (RF-12)', () => {
  const saveF1 = (store: Store) => {
    fillDraft(store, { salary: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' })
    store.saveDraft()
  }

  it('does not count the lançamento being edited twice in the summary', () => {
    const store = useIncomeStore()
    saveF1(store)
    const beforeEditing = store.summaryTaxEstimate

    store.beginEditRegistration(store.registrations[0]!.id)

    // The form holds a copy of the saved lançamento: the summary must still see one.
    expect(store.summaryTaxableTotal).toBe(7_800_000)
    expect(store.summaryTaxEstimate).toEqual(beforeEditing)
    expect(store.summaryInssWarning).toBe('')
    expect(store.summaryPayroll).toHaveLength(1)
  })

  it('follows what is typed while editing, instead of the saved values', () => {
    const store = useIncomeStore()
    saveF1(store)
    store.beginEditRegistration(store.registrations[0]!.id)

    store.draftIncomes[0]!.amount = 'R$ 7.000,00'

    expect(store.summaryTaxableTotal).toBe(8_400_000)
    expect(store.taxEstimate).toMatchObject({ ok: true, result: { rendimentos: 7_800_000 } })
    expect(store.summaryTaxEstimate).toMatchObject({ ok: true, result: { rendimentos: 8_400_000 } })
  })

  it('goes back to a new, empty form on cancel and keeps the saved lançamento', () => {
    const store = useIncomeStore()
    saveF1(store)
    store.beginEditRegistration(store.registrations[0]!.id)

    store.cancelEdit()

    expect(store.draftEditingRegistrationId).toBeNull()
    expect(store.draftIncomes).toHaveLength(1)
    expect(store.draftIncomes[0]!.amount).toBe('')
    expect(store.registrations).toHaveLength(1)
  })

  it('leaves edit mode when the lançamento being edited is deleted', () => {
    const store = useIncomeStore()
    saveF1(store)
    const id = store.registrations[0]!.id
    store.beginEditRegistration(id)

    store.removeRegistration(id)

    expect(store.draftEditingRegistrationId).toBeNull()
    // Nothing to save: "Salvar alterações" cannot bring the deleted lançamento back.
    expect(store.saveDraft()).toBe(false)
    expect(store.registrations).toHaveLength(0)
  })

  it('keeps editing when another lançamento is deleted', () => {
    const store = useIncomeStore()
    saveF1(store)
    fillDraft(store, { salary: 'R$ 3.000,00' })
    store.saveDraft()
    const [first, second] = store.registrations
    store.beginEditRegistration(first!.id)

    store.removeRegistration(second!.id)

    expect(store.draftEditingRegistrationId).toBe(first!.id)
    expect(store.draftIncomes[0]!.amount).toBe('R$ 6.500,00')
  })
})

describe('source titles (RF-12)', () => {
  const source = (id: number, employer?: string): RegisteredIncomeEntry => ({
    id,
    category: 'clt',
    amount: 'R$ 6.500,00',
    inss: '',
    irrf: '',
    ...(employer === undefined ? {} : { employer }),
  })

  it('names a source after its company, or after the category without one', () => {
    expect(sourceTitle(source(1, ' Empresa A '))).toBe('Empresa A')
    expect(sourceTitle(source(1, '  '))).toBe('Salário / CLT')
    expect(sourceTitle(source(1))).toBe('Salário / CLT')
  })

  it('tells two employers apart in the monthly view and in the summary', () => {
    const registrations = [
      registration({ incomes: [source(1, 'Empresa A'), source(2, 'Empresa B')] }),
    ]
    const rows = buildPayrollRows(registrations, emptyHousehold())

    expect(rows.map((row) => row.title)).toEqual(['Empresa A', 'Empresa B'])
    // The category stays as it was: the note "Tratado como salário" is written from it.
    expect(rows.map((row) => row.label)).toEqual(['Salário / CLT', 'Salário / CLT'])

    const store = useIncomeStore()
    store.addRegistration(registrations[0]!)
    expect(store.items.map((item) => item.label)).toEqual([
      'Empresa A · Titular',
      'Empresa B · Titular',
    ])
  })
})
