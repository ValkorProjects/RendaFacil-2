import { computed, ref, shallowRef } from 'vue'
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
import { dependentError, type DependentFields, type RegisteredDependent } from '@/utils/dependents'
import {
  deleteDependent as deletePersistedDependent,
  deleteExpense as deletePersistedExpense,
  deleteRegistration as deletePersistedRegistration,
  loadDeclaration,
  saveDependent as savePersistedDependent,
  saveExpense as savePersistedExpense,
  saveExpectedSources,
  saveRegistration as savePersistedRegistration,
  annualizedIncomeValue,
  type DeclarationContext,
} from '@/data/declaration'
export type { RegisteredDependent } from '@/utils/dependents'

const MONTHS_PER_YEAR = 12
const annualize = (amountInCents: number) => amountInCents * MONTHS_PER_YEAR

export type IncomeCategory =
  | 'clt'
  | 'proLabore'
  | 'autonomo'
  | 'aposentadoria'
  | 'alugueis'
  | 'pensaoAlimenticia'
  | 'nao_informada'

// RF-13: an expense typed on the Despesas screen. The engine decides whether it deducts.
export interface RegisteredExpense extends RegistroDespesa {
  id: number
  dbId?: string
  // Payment date in 2026 (YYYY-MM-DD).
  data: string
  // Optional; never a diagnosis.
  descricao: string
  // Alimony only: who received it, and whether it started in 2026 (the one year the receiver may
  // also be a dependent).
  recebedor: string
  pensaoIniciouEm2026: boolean
}

export interface RegisteredIncomeEntry {
  id: number
  dbId?: string
  category: IncomeCategory
  amount: string
  // INSS and income tax withheld from `amount` each month (payslip, or the annual statement ÷ 12)
  inss: string
  irrf: string
  // Missing on older session entries means the holder.
  dependentId?: number | null
  annualizedOverride?: {
    monthly: { amount: number; inss: number; irrf: number }
    annual: { amount: number; inss: number; irrf: number }
  }
}

// One "Adicionar" on the income screen: the income sources typed together.
export interface IncomeRegistration {
  id: number
  dbId?: string
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
  if (entry.category === 'nao_informada') {
    return 'Selecione a categoria desta fonte de renda antes de salvar.'
  }
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

// The declaration in the engine's model: the included incomes, the dependents and the expenses.
// The expense engine applies eligibility and the education ceiling separately for each person.
export const buildDeclarationData = (
  registrations: readonly IncomeRegistration[],
  household: Household,
): DadosDeclaracao => ({
  fontes: registrations.flatMap((registration) =>
    registration.incomes
      .filter(
        (income) =>
          isIncludedIncome(income, household) &&
          income.category !== 'pensaoAlimenticia' &&
          income.category !== 'nao_informada',
      )
      .map((income) => ({
        dependente_id: income.dependentId == null ? null : String(income.dependentId),
        rendimentos_centavos: annualizedIncomeValue(income, 'amount'),
        previdencia_centavos: annualizedIncomeValue(income, 'inss'),
        irrf_centavos: annualizedIncomeValue(income, 'irrf'),
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
  nao_informada: 'Categoria não informada (classifique)',
}

export const useIncomeStore = defineStore('income', () => {
  const registrations = ref<IncomeRegistration[]>([])
  let nextDraftId = 1
  const persistenceContext = shallowRef<DeclarationContext | null>(null)
  const expectedSources = ref(1)
  const accountDataLoading = ref(false)
  const accountDataError = ref('')
  let loadGeneration = 0

  // The income sources being typed, saved as one registration by "Adicionar".
  const draftIncomes = ref<RegisteredIncomeEntry[]>([newIncomeEntry(nextDraftId++)])
  const draftEditingRegistrationId = ref<number | null>(null)

  // The declaration's dependents and expenses (see `Household`): they count at once and stay
  // when a registration is saved.
  const expenses = ref<RegisteredExpense[]>([])
  const dependents = ref<RegisteredDependent[]>([])
  const hasDependents = computed(() => dependents.value.length > 0)
  const household = computed<Household>(() => ({
    dependents: dependents.value,
    expenses: expenses.value,
  }))

  const loadAccountData = async (userId: string) => {
    const generation = ++loadGeneration
    accountDataLoading.value = true
    accountDataError.value = ''
    try {
      const snapshot = await loadDeclaration(userId)
      if (generation !== loadGeneration) return
      registrations.value = snapshot.registrations
      dependents.value = snapshot.dependents
      expenses.value = snapshot.expenses
      expectedSources.value = snapshot.expectedSources
      persistenceContext.value = { userId, declarationId: snapshot.declarationId }
      nextDraftId =
        Math.max(
          0,
          ...registrations.value.flatMap((registration) => [
            registration.id,
            ...registration.incomes.map((income) => income.id),
          ]),
          ...dependents.value.map((dependent) => dependent.id),
          ...expenses.value.map((expense) => expense.id),
        ) + 1
      resetDraft()
    } catch (error) {
      if (generation === loadGeneration) {
        accountDataError.value = error instanceof Error ? error.message : String(error)
      }
      throw error
    } finally {
      if (generation === loadGeneration) accountDataLoading.value = false
    }
  }

  const setExpectedSourceCount = async (count: number) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > 100) {
      throw new Error('Informe um número de fontes entre 0 e 100.')
    }
    const context = persistenceContext.value
    if (context) await saveExpectedSources(context, count)
    expectedSources.value = count
  }

  const addRegistration = (registration: IncomeRegistration) => {
    registrations.value.push({
      id: registration.id,
      dbId: registration.dbId,
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
      dbId: registration.dbId,
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
      registration.incomes = registration.incomes
        .filter(
          (income) =>
            income.dependentId !== dependentId ||
            incomes.some((replacement) => replacement.id === income.id),
        )
        .map((income) => {
          const replacement = incomes.find((entry) => entry.id === income.id)
          return income.dependentId === dependentId && replacement
            ? { ...replacement, dependentId }
            : income
        })
    }
    registrations.value = registrations.value.filter((registration) => registration.incomes.length)
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

  const cleanExpense = (expense: Omit<RegisteredExpense, 'id'>) => ({
    ...expense,
    descricao: expense.descricao.trim(),
    recebedor: expense.recebedor.trim(),
  })
  const addExpense = (expense: Omit<RegisteredExpense, 'id'>) => {
    if (expenseError(expense, dependents.value)) return false
    expenses.value.push({ ...cleanExpense(expense), id: nextDraftId++ })
    return true
  }
  const updateExpense = (expense: RegisteredExpense) => {
    const index = expenses.value.findIndex((item) => item.id === expense.id)
    if (index < 0 || expenseError(expense, dependents.value)) return false
    expenses.value[index] = { ...cleanExpense(expense), id: expense.id }
    return true
  }
  const removeExpense = (id: number) => {
    expenses.value = expenses.value.filter((expense) => expense.id !== id)
  }

  const draftTaxableTotal = computed(() =>
    annualize(
      draftIncomes.value
        .filter(
          (income) =>
            isIncludedIncome(income, household.value) &&
            income.category !== 'pensaoAlimenticia' &&
            income.category !== 'nao_informada',
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
    loadGeneration += 1
    persistenceContext.value = null
    expectedSources.value = 1
    accountDataLoading.value = false
    accountDataError.value = ''
    registrations.value = []
    resetDraft()
    dependents.value = []
    expenses.value = []
  }

  const saveDraft = () => {
    if (!canSaveDraft.value) return false

    const registration: IncomeRegistration = {
      // A counter, not Date.now(): two saves in the same millisecond would share an id.
      id: draftEditingRegistrationId.value ?? nextDraftId++,
      dbId: registrations.value.find((item) => item.id === draftEditingRegistrationId.value)?.dbId,
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

  const saveDraftPersisted = async () => {
    const context = persistenceContext.value
    if (!context) return saveDraft()
    if (!canSaveDraft.value) return false

    const registration: IncomeRegistration = {
      id: draftEditingRegistrationId.value ?? nextDraftId++,
      dbId: registrations.value.find((item) => item.id === draftEditingRegistrationId.value)?.dbId,
      incomes: draftIncomes.value
        .filter((income) => cents(income.amount) > 0)
        .map((income) => ({ ...income })),
    }
    const index = registrations.value.findIndex((item) => item.id === registration.id)
    const previous = index < 0 ? undefined : registrations.value[index]
    const saved = await savePersistedRegistration(
      context,
      { ...registration, dbId: registration.dbId ?? previous?.dbId },
      dependents.value,
      previous,
    )
    if (index < 0) registrations.value.push(saved)
    else registrations.value[index] = saved
    resetDraft()
    return true
  }

  const updateRegistrationPersisted = async (registration: IncomeRegistration) => {
    const context = persistenceContext.value
    if (!context) return updateRegistration(registration)
    const previous = registrations.value.find((item) => item.id === registration.id)
    if (!previous) return
    const saved = await savePersistedRegistration(
      context,
      { ...registration, dbId: registration.dbId ?? previous.dbId },
      dependents.value,
      previous,
    )
    updateRegistration(saved)
  }

  const removeRegistrationPersisted = async (id: number) => {
    const registration = registrations.value.find((item) => item.id === id)
    if (!registration) return
    const context = persistenceContext.value
    if (context) {
      if (!registration.dbId) {
        throw new Error(
          'Este cadastro não tem um identificador persistido. Atualize os dados e tente novamente.',
        )
      }
      await deletePersistedRegistration(context, registration)
    }
    removeRegistration(id)
  }

  const saveDependentWithIncomesPersisted = async (
    fields: DependentFields,
    incomes: readonly RegisteredIncomeEntry[],
    id?: number,
  ) => {
    const context = persistenceContext.value
    if (!context) return saveDependentWithIncomes(fields, incomes, id)
    const existing = id === undefined ? [] : incomesForDependent(id)
    if (
      dependentError(fields) ||
      new Set(incomes.map((income) => income.id)).size !== incomes.length ||
      incomes.some(
        (income) =>
          cents(income.amount) <= 0 ||
          !Number.isSafeInteger(cents(income.amount) * MONTHS_PER_YEAR) ||
          incomeEntryError(income) ||
          !Object.hasOwn(incomeCategoryLabels, income.category) ||
          (income.id >= 0 && !existing.some((entry) => entry.id === income.id)),
      )
    ) {
      return false
    }

    const current = id === undefined ? undefined : dependents.value.find((item) => item.id === id)
    if (id !== undefined && !current) return false
    const localId = id ?? nextDraftId++
    const dbId = await savePersistedDependent(context, {
      ...fields,
      dbId: current?.dbId,
    })
    const dependent: RegisteredDependent = {
      ...fields,
      apelido: fields.apelido.trim(),
      id: localId,
      dbId,
    }
    const nextDependents = current
      ? dependents.value.map((item) => (item.id === localId ? dependent : item))
      : [...dependents.value, dependent]
    const savedGroups: IncomeRegistration[] = []
    try {
      for (const registration of registrations.value) {
        const dependentIncomes = registration.incomes.filter(
          (income) => income.dependentId === localId,
        )
        if (!dependentIncomes.length) continue
        const updated = {
          ...registration,
          incomes: registration.incomes
            .filter(
              (income) =>
                income.dependentId !== localId ||
                incomes.some((replacement) => replacement.id === income.id),
            )
            .map((income) => {
              const replacement = incomes.find((entry) => entry.id === income.id)
              return income.dependentId === localId && replacement
                ? { ...replacement, dependentId: localId }
                : income
            }),
        }
        savedGroups.push(
          await savePersistedRegistration(context, updated, nextDependents, registration),
        )
      }

      const added = incomes
        .filter((income) => income.id < 0)
        .map((income) => ({ ...income, id: nextDraftId++, dependentId: localId }))
      if (added.length) {
        savedGroups.push(
          await savePersistedRegistration(
            context,
            { id: nextDraftId++, incomes: added },
            nextDependents,
          ),
        )
      }
    } catch (error) {
      if (!current) {
        try {
          await deletePersistedDependent(context, dbId)
        } catch (rollbackError) {
          throw new Error(
            `Não foi possível salvar os rendimentos do dependente e também falhou a limpeza do cadastro: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          )
        }
      }
      throw error
    }

    if (current) {
      const index = dependents.value.findIndex((item) => item.id === localId)
      dependents.value[index] = dependent
    } else {
      dependents.value.push(dependent)
    }
    for (const group of savedGroups) {
      const index = registrations.value.findIndex((item) => item.id === group.id)
      if (index < 0) registrations.value.push(group)
      else if (group.incomes.length) registrations.value[index] = group
      else registrations.value.splice(index, 1)
    }
    return true
  }

  const removeDependentPersisted = async (id: number) => {
    const dependent = dependents.value.find((item) => item.id === id)
    if (!dependent) return
    const context = persistenceContext.value
    if (context) {
      if (!dependent.dbId) {
        throw new Error(
          'Este dependente não tem um identificador persistido. Atualize os dados e tente novamente.',
        )
      }
      await deletePersistedDependent(context, dependent.dbId)
    }
    removeDependent(id)
  }

  const addExpensePersisted = async (expense: Omit<RegisteredExpense, 'id'>) => {
    if (expenseError(expense, dependents.value)) return false
    const context = persistenceContext.value
    if (!context) return addExpense(expense)
    const saved = await savePersistedExpense(context, expense, dependents.value)
    expenses.value.push({ ...cleanExpense(expense), id: nextDraftId++, dbId: saved.dbId })
    return true
  }

  const updateExpensePersisted = async (expense: RegisteredExpense) => {
    const index = expenses.value.findIndex((item) => item.id === expense.id)
    if (index < 0 || expenseError(expense, dependents.value)) return false
    const context = persistenceContext.value
    if (!context) return updateExpense(expense)
    const saved = await savePersistedExpense(context, expense, dependents.value)
    expenses.value[index] = { ...cleanExpense(expense), dbId: saved.dbId, id: expense.id }
    return true
  }

  const removeExpensePersisted = async (id: number) => {
    const expense = expenses.value.find((item) => item.id === id)
    if (!expense) return
    const context = persistenceContext.value
    if (context) {
      if (!expense.dbId) {
        throw new Error(
          'Esta despesa não tem um identificador persistido. Atualize os dados e tente novamente.',
        )
      }
      await deletePersistedExpense(context, expense.dbId)
    }
    removeExpense(id)
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
        .filter(
          (income) =>
            income.category !== 'pensaoAlimenticia' && income.category !== 'nao_informada',
        )
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
    expectedSources,
    accountDataLoading,
    accountDataError,
    loadAccountData,
    setExpectedSourceCount,
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
    saveDependent,
    saveDependentWithIncomes,
    incomesForDependent,
    removeDependent,
    expensesForDependent,
    expenses,
    addExpense,
    updateExpense,
    removeExpense,
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
    saveDraft,
    saveDraftPersisted,
    updateRegistrationPersisted,
    removeRegistrationPersisted,
    saveDependentWithIncomesPersisted,
    removeDependentPersisted,
    addExpensePersisted,
    updateExpensePersisted,
    removeExpensePersisted,
    clearAccountData,
  }
})
