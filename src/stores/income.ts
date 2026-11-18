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
  emOutraDeclaracao?: boolean
}

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

export interface IncomeRegistration {
  id: number
  incomes: RegisteredIncomeEntry[]
  dependents: RegisteredDependent[]
}

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

export const buildPayrollRows = (registrations: readonly IncomeRegistration[]): PayrollRow[] =>
  registrations.flatMap((registration) =>
    registration.incomes
      .filter((income) => cents(income.amount) > 0)
      .map((income) => {
        const dependentes = countDeclaredDependents(registration.dependents)
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

// Converts the saved income and expense entries into the engine's declaration model.
export const buildDeclarationData = (
  registrations: readonly IncomeRegistration[],
  expenses: readonly RegisteredExpense[] = [],
): DadosDeclaracao => {
  const dependentes = registrations.flatMap((registration) =>
    registration.dependents.map((dependent) => ({
      id: String(dependent.id),
      em_outra_declaracao: Boolean(dependent.emOutraDeclaracao),
    })),
  )

  const fontes = registrations.flatMap((registration): DadosDeclaracao['fontes'][number][] => [
    ...registration.incomes.map((income) => ({
      dependente_id: null,
      rendimentos_centavos: annualize(cents(income.amount)),
      previdencia_centavos: annualize(cents(income.inss)),
      irrf_centavos: annualize(cents(income.irrf)),
    })),
    ...registration.dependents
      .filter((dependent) => isTaxableDependentIncome(dependent) && isDeclaredDependent(dependent))
      .map((dependent) => ({
        dependente_id: String(dependent.id),
        rendimentos_centavos: annualize(cents(dependent.amount)),
        previdencia_centavos: 0,
        irrf_centavos: 0,
      })),
  ])

  return {
    fontes,
    dependentes,
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
  }
}

export const buildTaxInput = (
  registrations: readonly IncomeRegistration[],
  expenses: readonly RegisteredExpense[] = [],
): Entrada => montarEntrada(buildDeclarationData(registrations, expenses))

// No estimate without income. The engine rejects values it can't calculate exactly (for
// example, amounts too large for integer cents) instead of returning a wrong number.
export const estimateTax = (
  registrations: readonly IncomeRegistration[],
  expenses: readonly RegisteredExpense[] = [],
): TaxEstimate | null => {
  const input = buildTaxInput(registrations, expenses)
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

  const draftIncomes = ref<RegisteredIncomeEntry[]>([newIncomeEntry(nextDraftId++)])
  const draftHasDependents = ref(false)
  const draftDependentCount = ref(0)
  const draftDependents = ref<RegisteredDependent[]>([])
  const draftEditingRegistrationId = ref<number | null>(null)

  const addRegistration = (registration: IncomeRegistration) => {
    registrations.value.push({
      ...registration,
      incomes: registration.incomes.map((income) => ({ ...income })),
      dependents: registration.dependents.map((dependent) => ({ ...dependent })),
    })
  }

  const removeRegistration = (id: number) => {
    const registration = registrations.value.find((item) => item.id === id)
    if (registration) {
      const dependentIds = new Set(registration.dependents.map((dependent) => String(dependent.id)))
      expenses.value = expenses.value.filter(
        (expense) => !expense.dependente_id || !dependentIds.has(expense.dependente_id),
      )
    }
    registrations.value = registrations.value.filter((registration) => registration.id !== id)
  }

  const updateRegistration = (registration: IncomeRegistration) => {
    const index = registrations.value.findIndex((item) => item.id === registration.id)
    if (index < 0) return

    const previousIds = new Set(
      registrations.value[index]?.dependents.map((dependent) => String(dependent.id)) ?? [],
    )
    const retainedIds = new Set(registration.dependents.map((dependent) => String(dependent.id)))
    for (const id of previousIds) {
      if (!retainedIds.has(id)) {
        expenses.value = expenses.value.filter((expense) => expense.dependente_id !== id)
      }
    }
    registrations.value[index] = {
      ...registration,
      incomes: registration.incomes.map((income) => ({ ...income })),
      dependents: registration.dependents.map((dependent) => ({ ...dependent })),
    }
  }

  const beginEditRegistration = (id: number) => {
    const registration = registrations.value.find((item) => item.id === id)
    if (!registration) return false

    draftIncomes.value = registration.incomes.map((income) => ({ ...income }))
    draftDependents.value = registration.dependents.map((dependent) => ({ ...dependent }))
    draftHasDependents.value = registration.dependents.length > 0
    draftDependentCount.value = registration.dependents.length
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
        dependentes: draftHasDependents.value ? countDeclaredDependents(draftDependents.value) : 0,
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

  const setDraftHasDependents = (enabled: boolean) => {
    draftHasDependents.value = enabled
    if (!enabled) {
      draftDependentCount.value = 0
      draftDependents.value = []
    }
  }

  const setDraftDependentCount = (count: number) => {
    const safeCount = Math.max(0, Math.min(20, Math.floor(Number(count) || 0)))
    draftDependentCount.value = safeCount

    while (draftDependents.value.length < safeCount) {
      draftDependents.value.push({
        id: nextDraftId++,
        incomeType: 'none',
        amount: '',
        name: '',
        emOutraDeclaracao: false,
      })
    }
    if (draftDependents.value.length > safeCount) draftDependents.value.splice(safeCount)
  }

  const draftTaxableTotal = computed(() => {
    const holderTotal = draftIncomes.value.reduce(
      (total, income) => total + cents(income.amount),
      0,
    )
    const dependentTotal = draftDependents.value.reduce((total, dependent) => {
      if (isDeclaredDependent(dependent) && isTaxableDependentIncome(dependent)) {
        return total + cents(dependent.amount)
      }
      return total
    }, 0)
    return annualize(holderTotal + dependentTotal)
  })

  const draftExemptTotal = computed(() =>
    annualize(
      draftDependents.value.reduce(
        (total, dependent) =>
          isDeclaredDependent(dependent) && dependent.incomeType === 'pensao'
            ? total + cents(dependent.amount)
            : total,
        0,
      ),
    ),
  )

  const canSaveDraft = computed(
    () =>
      (draftIncomes.value.some((income) => cents(income.amount) > 0) ||
        draftDependents.value.some((dependent) => cents(dependent.amount) > 0)) &&
      draftIncomes.value.every((income) => !incomeEntryError(income)),
  )

  const resetDraft = () => {
    draftIncomes.value = [newIncomeEntry(nextDraftId++)]
    draftHasDependents.value = false
    draftDependentCount.value = 0
    draftDependents.value = []
    draftEditingRegistrationId.value = null
  }

  const clearAccountData = () => {
    registrations.value = []
    expenses.value = []
    resetDraft()
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
      id: draftEditingRegistrationId.value ?? Date.now(),
      incomes: draftIncomes.value
        .filter((income) => cents(income.amount) > 0)
        .map((income) => ({ ...income })),
      dependents: draftHasDependents.value
        ? draftDependents.value.map((dependent) => ({
            ...dependent,
            amount: dependent.incomeType === 'none' ? '' : dependent.amount,
          }))
        : [],
    }

    const registrationIndex = registrations.value.findIndex((item) => item.id === registration.id)
    if (registrationIndex >= 0) {
      updateRegistration(registration)
    } else {
      addRegistration(registration)
    }
    resetDraft()
    return true
  }

  const items = computed(() => {
    const incomeItems = registrations.value.flatMap((registration) =>
      registration.incomes.map((income) => ({
        id: `income-${registration.id}-${income.id}`,
        label: incomeCategoryLabels[income.category],
        amount: String(annualize(cents(income.amount))),
        icon: 'income' as const,
      })),
    )
    const dependentTotal = registrations.value.reduce(
      (total, registration) =>
        total +
        registration.dependents.reduce(
          (subtotal, dependent) =>
            isDeclaredDependent(dependent) && dependent.incomeType !== 'none'
              ? subtotal + cents(dependent.amount)
              : subtotal,
          0,
        ),
      0,
    )

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

  const taxableTotal = computed(() =>
    registrations.value.reduce((total, registration) => {
      const incomeTotal = registration.incomes.reduce(
        (subtotal, income) => subtotal + cents(income.amount),
        0,
      )
      const dependentTotal = registration.dependents.reduce((subtotal, dependent) => {
        if (isDeclaredDependent(dependent) && isTaxableDependentIncome(dependent)) {
          return subtotal + cents(dependent.amount)
        }
        return subtotal
      }, 0)
      return total + annualize(incomeTotal + dependentTotal)
    }, 0),
  )

  const exemptTotal = computed(() =>
    registrations.value.reduce(
      (total, registration) =>
        total +
        annualize(
          registration.dependents.reduce(
            (subtotal, dependent) =>
              isDeclaredDependent(dependent) && dependent.incomeType === 'pensao'
                ? subtotal + cents(dependent.amount)
                : subtotal,
            0,
          ),
        ),
      0,
    ),
  )

  const summaryTaxableTotal = computed(() => taxableTotal.value + draftTaxableTotal.value)
  const summaryExemptTotal = computed(() => exemptTotal.value + draftExemptTotal.value)

  const dependentCount = computed(() =>
    registrations.value.reduce(
      (total, registration) => total + countDeclaredDependents(registration.dependents),
      0,
    ),
  )

  // What the form would add if saved now, so the summary updates while the user types.
  const draftRegistration = computed<IncomeRegistration>(() => ({
    id: 0,
    incomes: draftIncomes.value,
    dependents: draftHasDependents.value ? draftDependents.value : [],
  }))

  const summaryDependentCount = computed(
    () => dependentCount.value + countDeclaredDependents(draftRegistration.value.dependents),
  )
  const declarationData = computed(() => buildDeclarationData(registrations.value, expenses.value))
  const dependents = computed(() =>
    registrations.value.flatMap((registration) =>
      registration.dependents.map((dependent) => ({
        ...dependent,
        id: String(dependent.id),
        registrationId: registration.id,
      })),
    ),
  )
  const taxEstimate = computed(() => estimateTax(registrations.value, expenses.value))
  const summaryInssWarning = computed(() =>
    inssCeilingWarning([...registrations.value, draftRegistration.value]),
  )
  const summaryPayroll = computed(() =>
    buildPayrollRows([...registrations.value, draftRegistration.value]),
  )
  const summaryTaxEstimate = computed(() =>
    estimateTax([...registrations.value, draftRegistration.value], expenses.value),
  )
  const deductionEffects = computed(() => calcularEfeitos(declarationData.value))

  return {
    registrations,
    expenses,
    dependents,
    declarationData,
    deductionEffects,
    items,
    taxableTotal,
    exemptTotal,
    summaryTaxableTotal,
    summaryExemptTotal,
    dependentCount,
    summaryDependentCount,
    taxEstimate,
    summaryTaxEstimate,
    summaryPayroll,
    summaryInssWarning,
    addRegistration,
    removeRegistration,
    updateRegistration,
    beginEditRegistration,
    draftIncomes,
    draftHasDependents,
    draftDependentCount,
    draftDependents,
    draftTaxableTotal,
    draftExemptTotal,
    canSaveDraft,
    addDraftIncome,
    fillDraftIncomeFromSalary,
    removeDraftIncome,
    setDraftHasDependents,
    setDraftDependentCount,
    saveDraft,
    clearAccountData,
    addExpense,
    updateExpense,
    removeExpense,
  }
})
