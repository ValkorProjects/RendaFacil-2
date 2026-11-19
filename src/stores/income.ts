import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  calcularAjusteAnual,
  calcularFolhaMensal,
  montarEntrada,
  parametros,
  type Entrada,
  type RegistroDespesa,
  type Resultado,
  type ResultadoMensal,
} from '@/irpf'
import { cents, formatCurrency, formatMoneyInput } from '@/utils/currency'
import { dependentError, type DependentFields, type RegisteredDependent } from '@/utils/dependents'
export type { RegisteredDependent } from '@/utils/dependents'

const MONTHS_PER_YEAR = 12
const annualize = (amountInCents: number) => amountInCents * MONTHS_PER_YEAR

export type IncomeCategory =
  'clt' | 'proLabore' | 'autonomo' | 'aposentadoria' | 'alugueis' | 'pensaoAlimenticia'

export interface RegisteredExpense extends RegistroDespesa {
  id: string
  descricao: string
}

export interface RegisteredIncomeEntry {
  id: number
  category: IncomeCategory
  amount: string
  // INSS and income tax withheld from `amount` each month (payslip, or the annual statement ÷ 12)
  inss: string
  irrf: string
  // Missing on older session entries means the holder.
  dependentId?: number | null
}

// One "Adicionar" on the income screen: the income sources typed together.
export interface IncomeRegistration {
  id: number
  incomes: RegisteredIncomeEntry[]
}

// Dependents and the alimony paid belong to the whole declaration, not to an income source: they
// are entered once and counted once, however many sources there are. (They used to live in each
// registration and were added up, so typing them again for a second job counted them twice.)
// Dependents live in their own registry; alimony remains here until the full RF-13 flow.
export interface Household {
  dependents: RegisteredDependent[]
  // Court-ordered alimony paid per month, deducted in the full model
  alimonyPaid: string
  expenses?: RegisteredExpense[]
}

export const emptyHousehold = (): Household => ({ dependents: [], alimonyPaid: '' })

// The tax engine's result, or why it could not calculate one.
export type TaxEstimate =
  { ok: true; result: Resultado; provisional: boolean } | { ok: false; error: string }

const newIncomeEntry = (id: number): RegisteredIncomeEntry => ({
  id,
  category: 'clt',
  amount: '',
  inss: '',
  irrf: '',
  dependentId: null,
})

// RF-12: nothing can be withheld beyond the income it was withheld from.
export const incomeEntryError = (entry: RegisteredIncomeEntry) => {
  const amount = cents(entry.amount)
  if (entry.category === 'pensaoAlimenticia' && (cents(entry.inss) || cents(entry.irrf))) {
    return 'Pensão alimentícia recebida é isenta: deixe INSS e IR retido zerados.'
  }
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
  alimonyPaid: string,
): ResultadoMensal | null => {
  if (entry.category !== 'clt' || cents(entry.amount) === 0) return null
  try {
    return calcularFolhaMensal({
      bruto: cents(entry.amount),
      dependentes: dependents,
      pensao: cents(alimonyPaid),
    })
  } catch {
    return null
  }
}

// Warnings (never blocking) when the typed INSS or income tax doesn't match the payslip
// calculation. The informe de rendimentos is what counts, and it can differ for real reasons:
// férias, a second employer sharing the INSS ceiling, extra deductions.
export const incomeEntryWarnings = (
  entry: RegisteredIncomeEntry,
  dependents: number,
  alimonyPaid: string,
): string[] => {
  const folha = payrollEstimate(entry, dependents, alimonyPaid)
  if (!folha) return []
  const warnings: string[] = []
  if (entry.inss.trim() && cents(entry.inss) > folha.inss + PAYROLL_TOLERANCE) {
    warnings.push(
      `O INSS informado (${formatCurrency(cents(entry.inss))}) é maior que o estimado pela tabela do INSS para esse salário (${formatCurrency(folha.inss)}). Confira o holerite.`,
    )
  }
  if (entry.irrf.trim() && Math.abs(cents(entry.irrf) - folha.irrf) > PAYROLL_TOLERANCE) {
    warnings.push(
      `O IR retido informado (${formatCurrency(cents(entry.irrf))}) difere do estimado pela tabela da folha (${formatCurrency(folha.irrf)}). Férias, 13º ou deduções extras podem explicar a diferença; confira o holerite.`,
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
  pensao: number
  folha: ResultadoMensal | null
}

// Every CLT source is checked with the declaration's dependents and alimony, as each employer's
// payslip would be if the employee told them about the dependents.
export const buildPayrollRows = (
  registrations: readonly IncomeRegistration[],
  household: Household,
): PayrollRow[] =>
  registrations.flatMap((registration) =>
    registration.incomes
      .filter(
        (income) =>
          cents(income.amount) > 0 &&
          isIncludedIncome(income, household) &&
          income.category !== 'pensaoAlimenticia',
      )
      .map((income) => {
        const dependentes = income.dependentId == null ? validDependents(household).length : 0
        const pensao = income.dependentId == null ? household.alimonyPaid : ''
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
          pensao: cents(pensao),
          folha: payrollEstimate(income, dependentes, pensao),
        }
      }),
  )

export const validDependents = (household: Household) =>
  household.dependents.filter((dependent) => !dependent.em_outra_declaracao)

export const isIncludedIncome = (income: RegisteredIncomeEntry, household: Household) =>
  income.dependentId == null ||
  validDependents(household).some((dependent) => dependent.id === income.dependentId)

export const pendingDependentStatements = (
  registrations: readonly IncomeRegistration[],
  household: Household,
) =>
  validDependents(household).filter(
    (dependent) =>
      dependent.teve_renda_propria &&
      !registrations.some((registration) =>
        registration.incomes.some(
          (income) =>
            income.dependentId === dependent.id &&
            cents(income.amount) > 0 &&
            !incomeEntryError(income),
        ),
      ),
  )

// The expense engine applies eligibility and the education ceiling separately for each person.
export const buildTaxInput = (
  registrations: readonly IncomeRegistration[],
  household: Household,
): Entrada => {
  const input = montarEntrada({
    fontes: registrations.flatMap((registration) =>
      registration.incomes
        .filter(
          (income) =>
            isIncludedIncome(income, household) && income.category !== 'pensaoAlimenticia',
        )
        .map((income) => ({
          dependente_id: income.dependentId == null ? null : String(income.dependentId),
          rendimentos_centavos: annualize(cents(income.amount)),
          previdencia_centavos: annualize(cents(income.inss)),
          irrf_centavos: annualize(cents(income.irrf)),
        })),
    ),
    dependentes: household.dependents.map((dependent) => ({
      id: String(dependent.id),
      em_outra_declaracao: dependent.em_outra_declaracao,
    })),
    despesas: household.expenses ?? [],
  })
  input.pensoes += annualize(cents(household.alimonyPaid))
  return input
}

// No estimate without income. The engine rejects values it can't calculate exactly (for
// example, amounts too large for integer cents) instead of returning a wrong number.
export const estimateTax = (
  registrations: readonly IncomeRegistration[],
  household: Household,
): TaxEstimate | null => {
  try {
    const input = buildTaxInput(registrations, household)
    if (!input.fontes.some((fonte) => fonte.rendimentos > 0)) return null
    return {
      ok: true,
      result: calcularAjusteAnual(input),
      provisional: pendingDependentStatements(registrations, household).length > 0,
    }
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
  pensaoAlimenticia: 'Pensão alimentícia recebida (isenta)',
}

export const useIncomeStore = defineStore('income', () => {
  const registrations = ref<IncomeRegistration[]>([])
  let nextDraftId = 1

  // The income sources being typed, saved as one registration by "Adicionar".
  const draftIncomes = ref<RegisteredIncomeEntry[]>([newIncomeEntry(nextDraftId++)])
  const draftEditingRegistrationId = ref<number | null>(null)

  // The declaration's dependents and alimony (see `Household`): edited in place, they count at
  // once and stay when a registration is saved.
  const expenses = ref<RegisteredExpense[]>([])
  const dependents = ref<RegisteredDependent[]>([])
  const hasDependents = computed(() => dependents.value.length > 0)
  const alimonyPaid = ref('')
  const household = computed<Household>(() => ({
    dependents: dependents.value,
    expenses: expenses.value,
    alimonyPaid: alimonyPaid.value,
  }))

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
        dependentes: income.dependentId == null ? validDependents(household.value).length : 0,
        pensao: income.dependentId == null ? cents(household.value.alimonyPaid) : 0,
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

  const saveDependent = (fields: DependentFields, id?: number) => {
    if (dependentError(fields)) return false
    const index = id === undefined ? -1 : dependents.value.findIndex((item) => item.id === id)
    if (id !== undefined && index < 0) return false
    const dependent = { ...fields, apelido: fields.apelido.trim(), id: id ?? nextDraftId++ }
    if (index < 0) dependents.value.push(dependent)
    else dependents.value[index] = dependent
    return true
  }

  const incomesForDependent = (id: number) =>
    registrations.value.flatMap((registration) =>
      registration.incomes.filter((income) => income.dependentId === id),
    )

  // The dependent questionnaire has its own draft. Validate everything before saving either
  // the person or their incomes, and keep the holder's unfinished Rendas form untouched.
  const saveDependentWithIncomes = (
    fields: DependentFields,
    incomes: readonly RegisteredIncomeEntry[],
    id?: number,
  ) => {
    const existing = id === undefined ? [] : incomesForDependent(id)
    if (
      new Set(incomes.map((income) => income.id)).size !== incomes.length ||
      incomes.some(
        (income) =>
          cents(income.amount) <= 0 ||
          !Number.isSafeInteger(cents(income.amount) * MONTHS_PER_YEAR) ||
          incomeEntryError(income) ||
          !Object.hasOwn(incomeCategoryLabels, income.category) ||
          (income.id >= 0 && !existing.some((entry) => entry.id === income.id)),
      )
    )
      return false
    if (!saveDependent(fields, id)) return false
    const dependentId = id ?? dependents.value[dependents.value.length - 1]!.id
    for (const registration of registrations.value) {
      registration.incomes = registration.incomes.map((income) => {
        const replacement = incomes.find((entry) => entry.id === income.id)
        return income.dependentId === dependentId && replacement
          ? { ...replacement, dependentId }
          : income
      })
    }
    const added = incomes
      .filter((income) => income.id < 0)
      .map((income) => ({ ...income, id: nextDraftId++, dependentId }))
    if (added.length) addRegistration({ id: nextDraftId++, incomes: added })
    return true
  }

  const expensesForDependent = (id: number) =>
    expenses.value.filter((expense) => expense.dependente_id === String(id))

  // Called only after the inline confirmation. Linked incomes cannot become holder incomes.
  const removeDependent = (id: number) => {
    expenses.value = expenses.value.filter((expense) => expense.dependente_id !== String(id))
    registrations.value = registrations.value
      .map((registration) => ({
        ...registration,
        incomes: registration.incomes.filter((income) => income.dependentId !== id),
      }))
      .filter((registration) => registration.incomes.length > 0)
    draftIncomes.value = draftIncomes.value.filter((income) => income.dependentId !== id)
    if (!draftIncomes.value.length) resetDraft()
    dependents.value = dependents.value.filter((dependent) => dependent.id !== id)
  }

  const addExpense = (expense: Omit<RegisteredExpense, 'id'>) => {
    if (
      !expense.descricao.trim() ||
      expense.valor_centavos <= 0 ||
      !Number.isSafeInteger(expense.valor_centavos) ||
      !Number.isSafeInteger(expense.reembolso_centavos) ||
      expense.reembolso_centavos < 0 ||
      expense.reembolso_centavos > expense.valor_centavos
    )
      return false
    if (
      expense.beneficiario === 'dependente' &&
      !dependents.value.some((dependent) => String(dependent.id) === expense.dependente_id)
    )
      return false
    expenses.value.push({
      ...expense,
      descricao: expense.descricao.trim(),
      id: String(nextDraftId++),
    })
    return true
  }
  const removeExpense = (id: string) => {
    expenses.value = expenses.value.filter((expense) => expense.id !== id)
  }

  const draftTaxableTotal = computed(() =>
    annualize(
      draftIncomes.value
        .filter(
          (income) =>
            isIncludedIncome(income, household.value) && income.category !== 'pensaoAlimenticia',
        )
        .reduce((total, income) => total + cents(income.amount), 0),
    ),
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
    resetDraft()
    dependents.value = []
    expenses.value = []
    alimonyPaid.value = ''
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

  const includedIncomes = computed(() =>
    registrations.value.flatMap((registration) =>
      registration.incomes.filter((income) => isIncludedIncome(income, household.value)),
    ),
  )

  const incomeOwner = (income: RegisteredIncomeEntry) =>
    income.dependentId == null
      ? 'Titular'
      : (dependents.value.find((dependent) => dependent.id === income.dependentId)?.apelido ??
        'Dependente removido')

  const items = computed(() =>
    includedIncomes.value.map((income) => ({
      id: 'income-' + income.id,
      label: incomeCategoryLabels[income.category] + ' · ' + incomeOwner(income),
      amount: String(annualize(cents(income.amount))),
      icon: 'income' as const,
    })),
  )
  const taxableTotal = computed(() =>
    annualize(
      includedIncomes.value
        .filter((income) => income.category !== 'pensaoAlimenticia')
        .reduce((total, income) => total + cents(income.amount), 0),
    ),
  )
  const exemptTotal = computed(() =>
    annualize(
      includedIncomes.value
        .filter((income) => income.category === 'pensaoAlimenticia')
        .reduce((total, income) => total + cents(income.amount), 0),
    ),
  )
  const summaryTaxableTotal = computed(() => taxableTotal.value + draftTaxableTotal.value)
  const dependentCount = computed(() => validDependents(household.value).length)
  const pendingDependents = computed(() =>
    pendingDependentStatements(registrations.value, household.value),
  )

  const draftRegistration = computed<IncomeRegistration>(() => ({
    id: 0,
    incomes: draftIncomes.value,
  }))

  const taxEstimate = computed(() => estimateTax(registrations.value, household.value))
  const summaryInssWarning = computed(() => {
    const incomes = [...registrations.value, draftRegistration.value].flatMap((registration) =>
      registration.incomes.filter((income) => isIncludedIncome(income, household.value)),
    )
    // The social-security ceiling belongs to each person, not the household.
    return [...new Set(incomes.map((income) => income.dependentId ?? null))]
      .flatMap((id) => {
        const warning = inssCeilingWarning([
          { id: 0, incomes: incomes.filter((income) => (income.dependentId ?? null) === id) },
        ])
        if (!warning) return []
        const owner =
          id === null
            ? 'Titular'
            : dependents.value.find((dependent) => dependent.id === id)?.apelido
        return [`${owner}: ${warning}`]
      })
      .join(' ')
  })
  const summaryPayroll = computed(() =>
    buildPayrollRows([...registrations.value, draftRegistration.value], household.value),
  )
  const summaryTaxEstimate = computed(() => {
    const estimate = estimateTax([...registrations.value, draftRegistration.value], household.value)
    // Typing a statement does not resolve the pending state until it is saved.
    if (estimate?.ok) estimate.provisional = pendingDependents.value.length > 0
    return estimate
  })

  return {
    registrations,
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
    alimonyPaid,
    household,
    saveDependent,
    saveDependentWithIncomes,
    incomesForDependent,
    removeDependent,
    expensesForDependent,
    expenses,
    addExpense,
    removeExpense,
    pendingDependents,
    incomeOwner,
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
