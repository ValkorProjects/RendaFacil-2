import { computed, ref, shallowRef } from 'vue'
import { getSupabase } from '@/lib/supabase'
import {
  createDeclarationRepository,
  emptyDeclaration,
  montarEntradaDoBanco,
  type DeclarationData,
} from '@/data/declarations'
import { createIncomeMapper, annualIncomeAmounts } from '@/data/incomeMapper'
import type { Tables } from '@/types/database.types'
import { defineStore } from 'pinia'
import {
  calcularAjusteAnual,
  calcularEfeitos,
  calcularFolhaMensal,
  dependentePodeSerDeclarado,
  montarEntrada,
  parametros,
  type DadosDeclaracao,
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

// RF-13: an expense typed on the Despesas screen. The engine decides whether it deducts.
export interface RegisteredExpense extends RegistroDespesa {
  id: number
  // Payment date in 2026 (YYYY-MM-DD).
  data: string
  // Optional; never a diagnosis.
  descricao: string
  // `recebedor` and `pensao_iniciou_em_2026` come from the engine's row: alimony only, who received
  // it and whether it started in 2026 (the one year the receiver may also be a dependent).
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
  annualAmounts?: Pick<
    Tables<'fontes_pagadoras'>,
    'rendimentos_centavos' | 'previdencia_centavos' | 'irrf_centavos'
  >
}

// One "Adicionar" on the income screen: the income sources typed together.
export interface IncomeRegistration {
  id: number
  incomes: RegisteredIncomeEntry[]
}

// Dependents and expenses belong to the whole declaration, not to an income source: they are
// entered once and counted once, however many sources there are. (They used to live in each
// registration and were added up, so typing them again for a second job counted them twice.)
// Alimony paid is an expense on the Despesas screen (RF-13), with its legal-basis confirmation.
export interface Household {
  dependents: RegisteredDependent[]
  expenses?: RegisteredExpense[]
}

export const emptyHousehold = (): Household => ({ dependents: [], expenses: [] })

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

// Fills INSS and the tax withheld from the monthly payroll calculation, assuming a CLT salary
// that is the same every month. Alimony paid is not assumed: it is an expense of the annual
// adjustment (RF-13), and not every payslip deducts it. Returns an error message when the engine
// can't calculate it.
export const fillIncomeFromSalary = (income: RegisteredIncomeEntry, dependents: number) => {
  try {
    const payroll = calcularFolhaMensal({
      bruto: cents(income.amount),
      dependentes: dependents,
      pensao: 0,
    })
    income.inss = formatMoneyInput(payroll.inss)
    income.irrf = formatMoneyInput(payroll.irrf)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
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
      .filter(
        (income) =>
          cents(income.amount) > 0 &&
          isIncludedIncome(income, household) &&
          income.category !== 'pensaoAlimenticia',
      )
      .map((income) => {
        const dependentes = income.dependentId == null ? validDependents(household).length : 0
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

export const validDependents = (household: Household) =>
  household.dependents.filter((dependent) =>
    dependentePodeSerDeclarado(
      { id: String(dependent.id), em_outra_declaracao: dependent.em_outra_declaracao },
      household.expenses ?? [],
    ),
  )

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

// The declaration in the engine's model: the included incomes, the dependents and the expenses.
// The expense engine applies eligibility and the education ceiling separately for each person.
export const buildDeclarationData = (
  registrations: readonly IncomeRegistration[],
  household: Household,
): DadosDeclaracao => ({
  fontes: registrations.flatMap((registration) =>
    registration.incomes
      .filter(
        (income) => isIncludedIncome(income, household) && income.category !== 'pensaoAlimenticia',
      )
      .map((income) => ({
        dependente_id: income.dependentId == null ? null : String(income.dependentId),
        ...annualIncomeAmounts(income),
      })),
  ),
  dependentes: household.dependents.map((dependent) => ({
    id: String(dependent.id),
    em_outra_declaracao: dependent.em_outra_declaracao,
  })),
  despesas: household.expenses ?? [],
})

export const buildTaxInput = (
  registrations: readonly IncomeRegistration[],
  household: Household,
): Entrada => montarEntrada(buildDeclarationData(registrations, household))

// RF-13 checks that hold whatever the screen does: a positive amount, a reimbursement between
// zero and the amount (health only), and a beneficiary that exists.
const expenseError = (
  expense: Omit<RegisteredExpense, 'id'>,
  dependents: readonly RegisteredDependent[],
) => {
  if (expense.valor_centavos <= 0 || !Number.isSafeInteger(expense.valor_centavos)) {
    return 'Informe um valor maior que zero.'
  }
  if (
    !Number.isSafeInteger(expense.reembolso_centavos) ||
    expense.reembolso_centavos < 0 ||
    expense.reembolso_centavos > expense.valor_centavos
  ) {
    return 'O reembolso deve ficar entre zero e o valor da despesa.'
  }
  if (
    expense.beneficiario === 'dependente' &&
    !dependents.some((dependent) => String(dependent.id) === expense.dependente_id)
  ) {
    return 'Escolha um dependente cadastrado.'
  }
  if (expense.categoria === 'pensao' && !expense.recebedor.trim()) {
    return 'Informe quem recebeu a pensão.'
  }
  if (expense.descricao.trim().length > 120) {
    return 'A descrição deve ter no máximo 120 caracteres.'
  }
  return ''
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
  const accountId = ref<string | null>(null)
  let accountVersion = 0
  const loading = ref(false)
  const loaded = ref(false)
  const saving = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const savedRows = shallowRef<DeclarationData>(emptyDeclaration())
  let mapper = createIncomeMapper(() => nextDraftId++)
  const repository = () => createDeclarationRepository(getSupabase())

  // The income sources being typed, saved as one registration by "Adicionar".
  const draftIncomes = ref<RegisteredIncomeEntry[]>([newIncomeEntry(nextDraftId++)])
  const draftEditingRegistrationId = ref<number | null>(null)

  // Saved dependents and expenses belong to the declaration: they count at once and stay when a
  // registration is saved. The Home estimate reads only server-confirmed rows.
  const expenses = ref<RegisteredExpense[]>([])
  const dependents = ref<RegisteredDependent[]>([])
  const hasDependents = computed(() => dependents.value.length > 0)
  const household = computed<Household>(() => ({
    dependents: dependents.value,
    expenses: expenses.value,
  }))

  const addRegistration = (state: MutationState, registration: IncomeRegistration) => {
    state.registrations.push({
      id: registration.id,
      incomes: registration.incomes.map((income) => ({ ...income })),
    })
  }

  const removeRegistration = (state: MutationState, id: number) => {
    state.registrations = state.registrations.filter((registration) => registration.id !== id)
  }

  const updateRegistration = (state: MutationState, registration: IncomeRegistration) => {
    const index = state.registrations.findIndex((item) => item.id === registration.id)
    if (index < 0) return

    state.registrations[index] = {
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

  // The holder's sources use the declaration's dependents; a dependent's own income has none.
  const fillDraftIncomeFromSalary = (id: number) => {
    const income = draftIncomes.value.find((item) => item.id === id)
    if (!income) return ''
    return fillIncomeFromSalary(
      income,
      income.dependentId == null ? validDependents(household.value).length : 0,
    )
  }

  const removeDraftIncome = (id: number) => {
    if (draftIncomes.value.length > 1) {
      draftIncomes.value = draftIncomes.value.filter((income) => income.id !== id)
    }
  }

  const saveDependent = (state: MutationState, fields: DependentFields, id?: number) => {
    if (dependentError(fields)) return false
    const index =
      id === undefined ? -1 : state.household.dependents.findIndex((item) => item.id === id)
    if (id !== undefined && index < 0) return false
    const dependent = { ...fields, apelido: fields.apelido.trim(), id: id ?? state.nextDraftId++ }
    if (index < 0) state.household.dependents.push(dependent)
    else state.household.dependents[index] = dependent
    return true
  }

  const incomesForDependent = (id: number) =>
    registrations.value.flatMap((registration) =>
      registration.incomes.filter((income) => income.dependentId === id),
    )

  // The dependent questionnaire has its own draft. Validate everything before saving either
  // the person or their incomes, and keep the holder's unfinished Rendas form untouched.
  const saveDependentWithIncomes = (
    state: MutationState,
    fields: DependentFields,
    incomes: readonly RegisteredIncomeEntry[],
    id?: number,
  ) => {
    const existing =
      id === undefined
        ? []
        : state.registrations.flatMap((group) =>
            group.incomes.filter((income) => income.dependentId === id),
          )
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
    if (!saveDependent(state, fields, id)) return false
    const dependentId = id ?? state.household.dependents[state.household.dependents.length - 1]!.id
    for (const registration of state.registrations) {
      registration.incomes = registration.incomes.map((income) => {
        const replacement = incomes.find((entry) => entry.id === income.id)
        return income.dependentId === dependentId && replacement
          ? { ...replacement, dependentId }
          : income
      })
    }
    const added = incomes
      .filter((income) => income.id < 0)
      .map((income) => ({ ...income, id: state.nextDraftId++, dependentId }))
    if (added.length) addRegistration(state, { id: state.nextDraftId++, incomes: added })
    return true
  }

  const expensesForDependent = (id: number) =>
    expenses.value.filter((expense) => expense.dependente_id === String(id))

  // Called only after the inline confirmation. Linked incomes cannot become holder incomes.
  const removeDependent = (state: MutationState, id: number) => {
    state.household.expenses = state.household.expenses.filter(
      (expense) => expense.dependente_id !== String(id),
    )
    state.registrations = state.registrations
      .map((registration) => ({
        ...registration,
        incomes: registration.incomes.filter((income) => income.dependentId !== id),
      }))
      .filter((registration) => registration.incomes.length > 0)
    state.draftIncomes = state.draftIncomes.filter((income) => income.dependentId !== id)
    if (!state.draftIncomes.length) resetCandidateDraft(state)
    state.household.dependents = state.household.dependents.filter(
      (dependent) => dependent.id !== id,
    )
  }

  const cleanExpense = (expense: Omit<RegisteredExpense, 'id'>) => ({
    ...expense,
    descricao: expense.descricao.trim(),
    recebedor: expense.recebedor.trim(),
  })
  const addExpense = (state: MutationState, expense: Omit<RegisteredExpense, 'id'>) => {
    if (expenseError(expense, state.household.dependents)) return false
    state.household.expenses.push({ ...cleanExpense(expense), id: state.nextDraftId++ })
    return true
  }
  const updateExpense = (state: MutationState, expense: RegisteredExpense) => {
    const index = state.household.expenses.findIndex((item) => item.id === expense.id)
    if (index < 0 || expenseError(expense, state.household.dependents)) return false
    state.household.expenses[index] = { ...cleanExpense(expense), id: expense.id }
    return true
  }
  const removeExpense = (state: MutationState, id: number) => {
    state.household.expenses = state.household.expenses.filter((expense) => expense.id !== id)
  }

  const draftTaxableTotal = computed(() =>
    draftIncomes.value
      .filter(
        (income) =>
          isIncludedIncome(income, household.value) && income.category !== 'pensaoAlimenticia',
      )
      .reduce((total, income) => total + annualIncomeAmounts(income).rendimentos_centavos, 0),
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
    accountVersion++
    accountId.value = null
    loaded.value = false
    loading.value = false
    saving.value = false
    loadError.value = ''
    saveError.value = ''
    savedRows.value = emptyDeclaration()
    mapper = createIncomeMapper(() => nextDraftId++)
    registrations.value = []
    resetDraft()
    dependents.value = []
    expenses.value = []
  }

  const saveDraft = (state: MutationState) => {
    if (!canSaveDraft.value) return false

    const registration: IncomeRegistration = {
      // A counter, not Date.now(): two saves in the same millisecond would share an id.
      id: state.editingId ?? state.nextDraftId++,
      incomes: state.draftIncomes
        .filter((income) => cents(income.amount) > 0)
        .map((income) => ({ ...income })),
    }

    const registrationIndex = state.registrations.findIndex((item) => item.id === registration.id)
    if (registrationIndex >= 0) {
      state.registrations[registrationIndex] = registration
    } else {
      addRegistration(state, registration)
    }
    resetCandidateDraft(state)
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
      amount: String(annualIncomeAmounts(income).rendimentos_centavos),
      icon: 'income' as const,
    })),
  )
  const taxableTotal = computed(() =>
    includedIncomes.value
      .filter((income) => income.category !== 'pensaoAlimenticia')
      .reduce((total, income) => total + annualIncomeAmounts(income).rendimentos_centavos, 0),
  )
  const exemptTotal = computed(() =>
    includedIncomes.value
      .filter((income) => income.category === 'pensaoAlimenticia')
      .reduce((total, income) => total + annualIncomeAmounts(income).rendimentos_centavos, 0),
  )
  const previewRegistrations = computed(() =>
    registrations.value.filter((row) => row.id !== draftEditingRegistrationId.value),
  )
  const summaryTaxableTotal = computed(
    () =>
      previewRegistrations.value
        .flatMap((row) => row.incomes)
        .filter(
          (row) => isIncludedIncome(row, household.value) && row.category !== 'pensaoAlimenticia',
        )
        .reduce((sum, row) => sum + annualIncomeAmounts(row).rendimentos_centavos, 0) +
      draftTaxableTotal.value,
  )

  const dependentCount = computed(() => validDependents(household.value).length)
  const pendingDependents = computed(() =>
    pendingDependentStatements(registrations.value, household.value),
  )

  const draftRegistration = computed<IncomeRegistration>(() => ({
    id: 0,
    incomes: draftIncomes.value,
  }))

  const taxEstimate = computed<TaxEstimate | null>(() => {
    if (!loaded.value) return null
    try {
      const input = montarEntradaDoBanco(savedRows.value)
      if (!input.fontes.some((source) => source.rendimentos > 0)) return null
      return {
        ok: true,
        result: calcularAjusteAnual(input),
        provisional: pendingDependents.value.length > 0,
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  // RF-07: the effect of each saved expense, in the order of `expenses`.
  const declarationData = computed(() => buildDeclarationData(registrations.value, household.value))
  // Null when the engine refuses the values: the estimate card already says why.
  const deductionEffects = computed(() => {
    try {
      return calcularEfeitos(declarationData.value)
    } catch {
      return null
    }
  })
  const summaryInssWarning = computed(() => {
    const incomes = [...previewRegistrations.value, draftRegistration.value].flatMap(
      (registration) =>
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
    buildPayrollRows([...previewRegistrations.value, draftRegistration.value], household.value),
  )
  const summaryTaxEstimate = computed(() => {
    const estimate = estimateTax(
      [...previewRegistrations.value, draftRegistration.value],
      household.value,
    )
    // Typing a statement does not resolve the pending state until it is saved.
    if (estimate?.ok) estimate.provisional = pendingDependents.value.length > 0
    return estimate
  })

  // Local drafts and saved rows have separate lifetimes. Never replace a draft on reload/failure.
  const applyRows = (rows: DeclarationData) => {
    const state = mapper.fromRows(rows)
    registrations.value = state.registrations
    dependents.value = state.household.dependents
    expenses.value = state.household.expenses ?? []
    savedRows.value = rows
  }
  const loadAccount = async (userId: string) => {
    if (accountId.value === userId && (loaded.value || loading.value)) return
    if (accountId.value !== userId) clearAccountData()
    accountId.value = userId
    const version = accountVersion
    loading.value = true
    loadError.value = ''
    try {
      const rows = await repository().load(userId)
      if (version !== accountVersion) return
      applyRows(rows)
      // The input stays usable during loading; don't overwrite anything already typed.
      loaded.value = true
    } catch (error: unknown) {
      console.error('Falha ao carregar declaração:', error)
      if (version === accountVersion)
        loadError.value =
          'Não foi possível carregar seus dados. Verifique a conexão e tente novamente.'
    } finally {
      if (version === accountVersion) loading.value = false
    }
  }
  const retryLoad = () => (accountId.value ? loadAccount(accountId.value) : Promise.resolve())

  // Apply the form rules to a detached candidate. Saved state changes only after the server confirms.
  type MutationState = {
    registrations: IncomeRegistration[]
    household: Household & { expenses: RegisteredExpense[] }
    draftIncomes: RegisteredIncomeEntry[]
    editingId: number | null
    nextDraftId: number
  }
  const resetCandidateDraft = (state: MutationState) => {
    state.draftIncomes = [newIncomeEntry(state.nextDraftId++)]
    state.editingId = null
  }
  const snapshot = () =>
    JSON.parse(
      JSON.stringify({
        registrations: registrations.value,
        household: household.value,
        draftIncomes: draftIncomes.value,
        editingId: draftEditingRegistrationId.value,
        nextDraftId,
      }),
    ) as MutationState
  const restore = (state: ReturnType<typeof snapshot>) => {
    registrations.value = state.registrations
    dependents.value = state.household.dependents
    expenses.value = state.household.expenses ?? []
    draftIncomes.value = state.draftIncomes
    draftEditingRegistrationId.value = state.editingId
    nextDraftId = state.nextDraftId
  }
  const persist = async (change: (state: MutationState) => boolean | void) => {
    if (saving.value) return false
    if (!accountId.value || !loaded.value) {
      saveError.value = 'Aguarde o carregamento dos dados da sua conta antes de salvar.'
      return false
    }
    saveError.value = ''
    const before = snapshot()
    const candidate = snapshot()
    if (change(candidate) === false) return false
    const version = accountVersion
    const owner = accountId.value
    saving.value = true
    try {
      const rows = await repository().save(
        owner,
        savedRows.value,
        mapper.toRows(candidate, savedRows.value, owner),
      )
      if (version !== accountVersion) return false
      const draftChanged =
        JSON.stringify(candidate.draftIncomes) !== JSON.stringify(before.draftIncomes)
      const currentDraft = draftIncomes.value
      restore(candidate)
      if (!draftChanged) draftIncomes.value = currentDraft
      applyRows(rows)
      return true
    } catch (error: unknown) {
      console.error('Falha ao salvar declaração:', error)
      if (version === accountVersion)
        saveError.value =
          'Não foi possível salvar. Seus campos foram mantidos; verifique a conexão e tente novamente.'
      return false
    } finally {
      if (version === accountVersion) saving.value = false
    }
  }
  return {
    accountId,
    loading,
    loaded,
    saving,
    loadError,
    saveError,
    loadAccount,
    retryLoad,
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
    addRegistration: (registration: IncomeRegistration) =>
      persist((state) => addRegistration(state, registration)),
    removeRegistration: (id: number) => persist((state) => removeRegistration(state, id)),
    updateRegistration: (registration: IncomeRegistration) =>
      persist((state) => updateRegistration(state, registration)),
    beginEditRegistration,
    hasDependents,
    dependents,
    household,
    saveDependent: (fields: DependentFields, id?: number) =>
      persist((state) => saveDependent(state, fields, id)),
    saveDependentWithIncomes: (
      fields: DependentFields,
      incomes: readonly RegisteredIncomeEntry[],
      id?: number,
    ) => persist((state) => saveDependentWithIncomes(state, fields, incomes, id)),
    incomesForDependent,
    removeDependent: (id: number) => persist((state) => removeDependent(state, id)),
    expensesForDependent,
    expenses,
    addExpense: (expense: Omit<RegisteredExpense, 'id'>) =>
      persist((state) => addExpense(state, expense)),
    updateExpense: (expense: RegisteredExpense) =>
      persist((state) => updateExpense(state, expense)),
    removeExpense: (id: number) => persist((state) => removeExpense(state, id)),
    declarationData,
    deductionEffects,
    pendingDependents,
    incomeOwner,
    draftIncomes,
    draftTaxableTotal,
    canSaveDraft,
    addDraftIncome,
    fillDraftIncomeFromSalary,
    removeDraftIncome,
    saveDraft: () => persist((state) => saveDraft(state)),
    clearAccountData,
  }
})
