import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  calcularAjusteAnual,
  calcularEfeitos,
  calcularFolhaMensal,
  montarEntrada,
  parametros,
  type DadosDeclaracao,
  type Entrada,
  type RegistroDespesa,
  type Resultado,
  type ResultadoMensal,
} from '@/irpf'
import { cents, formatCurrency, formatMoneyInput } from '@/utils/currency'

const MONTHS_PER_YEAR = 12
const annualize = (amountInCents: number) => amountInCents * MONTHS_PER_YEAR

export type IncomeCategory = 'clt' | 'proLabore' | 'autonomo' | 'aposentadoria' | 'alugueis'
export type DependentIncome = 'none' | 'estagio' | 'pensao' | 'outros'

export interface RegisteredDependent {
  id: number
  incomeType: DependentIncome
  amount: string
  name?: string
  // RF-11: a dependent can only count in one declaration. In someone else's, they don't count
  // here, nor do their income and expenses.
  emOutraDeclaracao?: boolean
}

// RF-13: an expense typed on the Dedutíveis screen. The engine decides whether it deducts.
export interface RegisteredExpense extends RegistroDespesa {
  id: number
  data: string
  descricao: string
  recebedor: string
  pensaoIniciouEm2026: boolean
}

export interface RegisteredIncomeEntry {
  id: number
  category: IncomeCategory
  amount: string
  // INSS and income tax withheld from `amount` each month (payslip, or the annual statement ÷ 12)
  inss: string
  irrf: string
}

// One "Adicionar" on the income screen: the income sources typed together.
export interface IncomeRegistration {
  id: number
  incomes: RegisteredIncomeEntry[]
}

// Dependents belong to the whole declaration, not to an income source: they are entered once and
// counted once, however many sources there are. Alimony paid is an expense on the Dedutíveis
// screen (RF-13), with its legal-basis confirmation, entered once there.
export interface Household {
  dependents: RegisteredDependent[]
}

export const emptyHousehold = (): Household => ({ dependents: [] })

// The tax engine's result, or why it could not calculate one.
export type TaxEstimate = { ok: true; result: Resultado } | { ok: false; error: string }

const newIncomeEntry = (id: number): RegisteredIncomeEntry => ({
  id,
  category: 'clt',
  amount: '',
  inss: '',
  irrf: '',
})

// RF-12: nothing can be withheld beyond the income it was withheld from.
export const incomeEntryError = (entry: RegisteredIncomeEntry) => {
  const amount = cents(entry.amount)
  if (cents(entry.inss) > amount) return 'O INSS não pode ser maior que o valor mensal.'
  if (cents(entry.irrf) > amount) return 'O IR retido não pode ser maior que o valor mensal.'
  return ''
}

// Payslip figures can differ by a few cents from the table (rounding), so smaller differences
// are not flagged. Same R$ 0,10 tolerance as RF-18.
const PAYROLL_TOLERANCE = 10

// What the monthly payroll calculation gives for a CLT source, assuming the same salary every
// month. Null for other categories (they have their own rules, outside the MVP) or when the
// engine can't calculate it.
export const payrollEstimate = (
  entry: RegisteredIncomeEntry,
  dependents: number,
): ResultadoMensal | null => {
  if (entry.category !== 'clt' || cents(entry.amount) === 0) return null
  try {
    return calcularFolhaMensal({
      bruto: cents(entry.amount),
      dependentes: dependents,
      pensao: 0,
    })
  } catch {
    return null
  }
}

// Warnings (never blocking) when the typed INSS or income tax doesn't match the payslip
// calculation. The informe de rendimentos is what counts, and it can differ for real reasons:
// férias, a second employer sharing the INSS ceiling, extra deductions.
export const incomeEntryWarnings = (entry: RegisteredIncomeEntry, dependents: number): string[] => {
  const folha = payrollEstimate(entry, dependents)
  if (!folha) return []
  const warnings: string[] = []
  if (entry.inss.trim() && cents(entry.inss) > folha.inss + PAYROLL_TOLERANCE) {
    warnings.push(
      `O INSS informado (${formatCurrency(cents(entry.inss))}) é maior que o estimado pela tabela do INSS para esse salário (${formatCurrency(folha.inss)}). Confira o holerite.`,
    )
  }
  if (entry.irrf.trim() && Math.abs(cents(entry.irrf) - folha.irrf) > PAYROLL_TOLERANCE) {
    warnings.push(
      `O IR retido informado (${formatCurrency(cents(entry.irrf))}) difere do estimado pela tabela da folha (${formatCurrency(folha.irrf)}). Pensão descontada em folha, férias, 13º ou outras deduções podem explicar a diferença; confira o holerite.`,
    )
  }
  return warnings
}

// RF-12: warns, without blocking, when the INSS of all sources adds up to more than the yearly
// ceiling (12 × the monthly ceiling). It happens with more than one employer, since each one
// withholds on its own, and it is also the first sign of a typing mistake.
export const inssCeilingWarning = (registrations: readonly IncomeRegistration[]) => {
  const total = annualize(
    registrations.reduce(
      (sum, registration) =>
        sum + registration.incomes.reduce((subtotal, income) => subtotal + cents(income.inss), 0),
      0,
    ),
  )
  const ceiling = annualize(parametros(2026).tetoPrevidenciaMensal)
  if (total <= ceiling) return ''
  return `A soma do INSS das fontes (${formatCurrency(total)} por ano) passa do teto da previdência (${formatCurrency(ceiling)} por ano). Isso acontece com mais de um empregador, porque cada um desconta por conta própria. Confira os valores nos informes.`
}

// One row per income source for the monthly view of the estimate card.
export interface PayrollRow {
  id: string
  label: string
  informado: { bruto: number; inss: number; irrf: number }
  dependentes: number
  deducaoDependentes: number
  folha: ResultadoMensal | null
}

// Every CLT source is checked with the declaration's dependents, as each employer's
// payslip would be if the employee told them about the dependents.
export const buildPayrollRows = (
  registrations: readonly IncomeRegistration[],
  household: Household,
): PayrollRow[] =>
  registrations.flatMap((registration) =>
    registration.incomes
      .filter((income) => cents(income.amount) > 0)
      .map((income) => {
        const dependentes = countDeclaredDependents(household.dependents)
        return {
          id: `${registration.id}-${income.id}`,
          label: incomeCategoryLabels[income.category],
          informado: {
            bruto: cents(income.amount),
            inss: cents(income.inss),
            irrf: cents(income.irrf),
          },
          dependentes,
          deducaoDependentes: dependentes * parametros(2026).mensal.dependente,
          folha: payrollEstimate(income, dependentes),
        }
      }),
  )

const isTaxableDependentIncome = (dependent: RegisteredDependent) =>
  dependent.incomeType === 'estagio' || dependent.incomeType === 'outros'
const isDeclaredDependent = (dependent: RegisteredDependent) => !dependent.emOutraDeclaracao
export const countDeclaredDependents = (dependents: readonly RegisteredDependent[]) =>
  dependents.filter(isDeclaredDependent).length

// Converts the monthly values of the income screen, the declaration's dependents and the saved
// expenses into the engine's declaration model. Dependent income (internship, other) is taxable
// with nothing withheld; alimony a dependent receives is exempt and stays out.
export const buildDeclarationData = (
  registrations: readonly IncomeRegistration[],
  household: Household,
  expenses: readonly RegisteredExpense[] = [],
): DadosDeclaracao => ({
  fontes: [
    ...registrations.flatMap((registration) =>
      registration.incomes.map((income) => ({
        dependente_id: null,
        rendimentos_centavos: annualize(cents(income.amount)),
        previdencia_centavos: annualize(cents(income.inss)),
        irrf_centavos: annualize(cents(income.irrf)),
      })),
    ),
    ...household.dependents
      .filter((dependent) => isTaxableDependentIncome(dependent) && isDeclaredDependent(dependent))
      .map((dependent) => ({
        dependente_id: String(dependent.id),
        rendimentos_centavos: annualize(cents(dependent.amount)),
        previdencia_centavos: 0,
        irrf_centavos: 0,
      })),
  ],
  dependentes: household.dependents.map((dependent) => ({
    id: String(dependent.id),
    em_outra_declaracao: Boolean(dependent.emOutraDeclaracao),
  })),
  despesas: expenses.map(
    ({
      categoria,
      tipo,
      beneficiario,
      dependente_id,
      valor_centavos,
      reembolso_centavos,
      base_legal_ok,
    }) => ({
      categoria,
      tipo,
      beneficiario,
      dependente_id,
      valor_centavos,
      reembolso_centavos,
      base_legal_ok,
    }),
  ),
})

export const buildTaxInput = (
  registrations: readonly IncomeRegistration[],
  household: Household,
  expenses: readonly RegisteredExpense[] = [],
): Entrada => montarEntrada(buildDeclarationData(registrations, household, expenses))

// No estimate without income. The engine rejects values it can't calculate exactly (for
// example, amounts too large for integer cents) instead of returning a wrong number.
export const estimateTax = (
  registrations: readonly IncomeRegistration[],
  household: Household,
  expenses: readonly RegisteredExpense[] = [],
): TaxEstimate | null => {
  const input = buildTaxInput(registrations, household, expenses)
  if (!input.fontes.some((fonte) => fonte.rendimentos > 0)) return null
  try {
    return { ok: true, result: calcularAjusteAnual(input) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const incomeCategoryLabels: Record<IncomeCategory, string> = {
  clt: 'Salário / CLT',
  proLabore: 'Pró-labore',
  autonomo: 'Autônomo / Freelance',
  aposentadoria: 'Aposentadoria / Pensão',
  alugueis: 'Aluguéis',
}

export const dependentIncomeLabels: Record<DependentIncome, string> = {
  none: 'Sem renda própria',
  estagio: 'Bolsa de Estágio',
  pensao: 'Pensão Alimentícia (Isento)',
  outros: 'Outros Rendimentos Tributáveis',
}

export const useIncomeStore = defineStore('income', () => {
  const registrations = ref<IncomeRegistration[]>([])
  const expenses = ref<RegisteredExpense[]>([])
  let nextDraftId = 1
  let nextExpenseId = 1

  // The income sources being typed, saved as one registration by "Adicionar".
  const draftIncomes = ref<RegisteredIncomeEntry[]>([newIncomeEntry(nextDraftId++)])
  const draftEditingRegistrationId = ref<number | null>(null)

  // The declaration's dependents (see `Household`): edited in place, they count at once and stay
  // when a registration is saved.
  const hasDependents = ref(false)
  const dependents = ref<RegisteredDependent[]>([])
  const household = computed<Household>(() => ({
    dependents: hasDependents.value ? dependents.value : [],
  }))

  // An expense can't point to a dependent that no longer exists.
  const dropExpensesOfRemovedDependents = () => {
    const ids = new Set(household.value.dependents.map((dependent) => String(dependent.id)))
    expenses.value = expenses.value.filter(
      (expense) => !expense.dependente_id || ids.has(expense.dependente_id),
    )
  }

  const addRegistration = (registration: IncomeRegistration) => {
    registrations.value.push({
      id: registration.id,
      incomes: registration.incomes.map((income) => ({ ...income })),
    })
  }

  const removeRegistration = (id: number) => {
    registrations.value = registrations.value.filter((registration) => registration.id !== id)
  }

  const updateRegistration = (registration: IncomeRegistration) => {
    const index = registrations.value.findIndex((item) => item.id === registration.id)
    if (index < 0) return

    registrations.value[index] = {
      id: registration.id,
      incomes: registration.incomes.map((income) => ({ ...income })),
    }
  }

  const beginEditRegistration = (id: number) => {
    const registration = registrations.value.find((item) => item.id === id)
    if (!registration) return false

    draftIncomes.value = registration.incomes.map((income) => ({ ...income }))
    draftEditingRegistrationId.value = id
    return true
  }

  const addDraftIncome = () => {
    draftIncomes.value.push(newIncomeEntry(nextDraftId++))
  }

  // Fills INSS and the tax withheld from the monthly payroll calculation, assuming a CLT salary
  // that is the same every month. Returns an error message when the engine can't calculate it.
  const fillDraftIncomeFromSalary = (id: number) => {
    const income = draftIncomes.value.find((item) => item.id === id)
    if (!income) return ''
    try {
      const payroll = calcularFolhaMensal({
        bruto: cents(income.amount),
        dependentes: countDeclaredDependents(household.value.dependents),
        pensao: 0,
      })
      income.inss = formatMoneyInput(payroll.inss)
      income.irrf = formatMoneyInput(payroll.irrf)
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  const removeDraftIncome = (id: number) => {
    if (draftIncomes.value.length > 1) {
      draftIncomes.value = draftIncomes.value.filter((income) => income.id !== id)
    }
  }

  const setHasDependents = (enabled: boolean) => {
    hasDependents.value = enabled
    if (!enabled) dependents.value = []
    dropExpensesOfRemovedDependents()
  }

  const setDependentCount = (count: number) => {
    const safeCount = Math.max(0, Math.min(20, Math.floor(Number(count) || 0)))

    while (dependents.value.length < safeCount) {
      dependents.value.push({
        id: nextDraftId++,
        incomeType: 'none',
        amount: '',
        name: '',
        emOutraDeclaracao: false,
      })
    }
    if (dependents.value.length > safeCount) dependents.value.splice(safeCount)
    dropExpensesOfRemovedDependents()
  }

  const draftTaxableTotal = computed(() =>
    annualize(draftIncomes.value.reduce((total, income) => total + cents(income.amount), 0)),
  )

  const canSaveDraft = computed(
    () =>
      draftIncomes.value.some((income) => cents(income.amount) > 0) &&
      draftIncomes.value.every((income) => !incomeEntryError(income)),
  )

  const resetDraft = () => {
    draftIncomes.value = [newIncomeEntry(nextDraftId++)]
    draftEditingRegistrationId.value = null
  }

  const clearAccountData = () => {
    registrations.value = []
    expenses.value = []
    resetDraft()
    setHasDependents(false)
  }

  const addExpense = (expense: Omit<RegisteredExpense, 'id'>) => {
    expenses.value.push({ ...expense, id: nextExpenseId++ })
  }

  const updateExpense = (expense: RegisteredExpense) => {
    const index = expenses.value.findIndex((item) => item.id === expense.id)
    if (index >= 0) expenses.value[index] = { ...expense }
  }

  const removeExpense = (id: number) => {
    expenses.value = expenses.value.filter((expense) => expense.id !== id)
  }

  const saveDraft = () => {
    if (!canSaveDraft.value) return false

    const registration: IncomeRegistration = {
      // A counter, not Date.now(): two saves in the same millisecond would share an id.
      id: draftEditingRegistrationId.value ?? nextDraftId++,
      incomes: draftIncomes.value
        .filter((income) => cents(income.amount) > 0)
        .map((income) => ({ ...income })),
    }

    const registrationIndex = registrations.value.findIndex((item) => item.id === registration.id)
    if (registrationIndex >= 0) {
      registrations.value[registrationIndex] = registration
    } else {
      addRegistration(registration)
    }
    resetDraft()
    return true
  }

  const dependentIncome = (type: (dependent: RegisteredDependent) => boolean) =>
    household.value.dependents.reduce(
      (total, dependent) =>
        isDeclaredDependent(dependent) && type(dependent) ? total + cents(dependent.amount) : total,
      0,
    )

  const items = computed(() => {
    const incomeItems = registrations.value.flatMap((registration) =>
      registration.incomes.map((income) => ({
        id: `income-${registration.id}-${income.id}`,
        label: incomeCategoryLabels[income.category],
        amount: String(annualize(cents(income.amount))),
        icon: 'income' as const,
      })),
    )
    const dependentTotal = dependentIncome((dependent) => dependent.incomeType !== 'none')

    return [
      ...incomeItems,
      ...(dependentTotal > 0
        ? [
            {
              id: 'dependents-total',
              label: 'Renda de dependente',
              amount: String(annualize(dependentTotal)),
              icon: 'user' as const,
            },
          ]
        : []),
    ]
  })

  const taxableTotal = computed(
    () =>
      registrations.value.reduce(
        (total, registration) =>
          total +
          annualize(
            registration.incomes.reduce((subtotal, income) => subtotal + cents(income.amount), 0),
          ),
        0,
      ) + annualize(dependentIncome(isTaxableDependentIncome)),
  )

  const exemptTotal = computed(() =>
    annualize(dependentIncome((dependent) => dependent.incomeType === 'pensao')),
  )

  // Saved registrations plus the form, so the summary updates while the user types.
  const summaryTaxableTotal = computed(() => taxableTotal.value + draftTaxableTotal.value)
  const dependentCount = computed(() => countDeclaredDependents(household.value.dependents))

  const draftRegistration = computed<IncomeRegistration>(() => ({
    id: 0,
    incomes: draftIncomes.value,
  }))

  const declarationData = computed(() =>
    buildDeclarationData(registrations.value, household.value, expenses.value),
  )
  const deductionEffects = computed(() => calcularEfeitos(declarationData.value))
  const taxEstimate = computed(() =>
    estimateTax(registrations.value, household.value, expenses.value),
  )
  const summaryInssWarning = computed(() =>
    inssCeilingWarning([...registrations.value, draftRegistration.value]),
  )
  const summaryPayroll = computed(() =>
    buildPayrollRows([...registrations.value, draftRegistration.value], household.value),
  )
  const summaryTaxEstimate = computed(() =>
    estimateTax([...registrations.value, draftRegistration.value], household.value, expenses.value),
  )

  return {
    registrations,
    expenses,
    declarationData,
    deductionEffects,
    addExpense,
    updateExpense,
    removeExpense,
    items,
    taxableTotal,
    exemptTotal,
    summaryTaxableTotal,
    dependentCount,
    taxEstimate,
    summaryTaxEstimate,
    summaryPayroll,
    summaryInssWarning,
    addRegistration,
    removeRegistration,
    updateRegistration,
    beginEditRegistration,
    hasDependents,
    dependents,
    household,
    setHasDependents,
    setDependentCount,
    draftIncomes,
    draftTaxableTotal,
    canSaveDraft,
    addDraftIncome,
    fillDraftIncomeFromSalary,
    removeDraftIncome,
    saveDraft,
    clearAccountData,
  }
})
