import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { cents } from '@/utils/currency'

const MONTHS_PER_YEAR = 12
const annualize = (amountInCents: number) => amountInCents * MONTHS_PER_YEAR

export type IncomeCategory = 'clt' | 'proLabore' | 'autonomo' | 'aposentadoria' | 'alugueis'
export type DependentIncome = 'none' | 'estagio' | 'pensao' | 'outros'

export interface RegisteredDependent {
  id: number
  incomeType: DependentIncome
  amount: string
}

export interface RegisteredIncomeEntry {
  id: number
  category: IncomeCategory
  amount: string
}

export interface IncomeRegistration {
  id: number
  incomes: RegisteredIncomeEntry[]
  dependents: RegisteredDependent[]
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
  let nextDraftId = 1

  const draftIncomes = ref<RegisteredIncomeEntry[]>([
    { id: nextDraftId++, category: 'clt', amount: '' },
  ])
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
    registrations.value = registrations.value.filter((registration) => registration.id !== id)
  }

  const updateRegistration = (registration: IncomeRegistration) => {
    const index = registrations.value.findIndex((item) => item.id === registration.id)
    if (index < 0) return

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
    draftIncomes.value.push({ id: nextDraftId++, category: 'clt', amount: '' })
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
      draftDependents.value.push({ id: nextDraftId++, incomeType: 'none', amount: '' })
    }
    if (draftDependents.value.length > safeCount) draftDependents.value.splice(safeCount)
  }

  const draftTaxableTotal = computed(() => {
    const holderTotal = draftIncomes.value.reduce(
      (total, income) => total + cents(income.amount),
      0,
    )
    const dependentTotal = draftDependents.value.reduce((total, dependent) => {
      if (dependent.incomeType === 'estagio' || dependent.incomeType === 'outros') {
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
          dependent.incomeType === 'pensao' ? total + cents(dependent.amount) : total,
        0,
      ),
    ),
  )

  const canSaveDraft = computed(
    () =>
      draftIncomes.value.some((income) => cents(income.amount) > 0) ||
      draftDependents.value.some((dependent) => cents(dependent.amount) > 0),
  )

  const resetDraft = () => {
    draftIncomes.value = [{ id: nextDraftId++, category: 'clt', amount: '' }]
    draftHasDependents.value = false
    draftDependentCount.value = 0
    draftDependents.value = []
    draftEditingRegistrationId.value = null
  }

  const saveDraft = () => {
    if (!canSaveDraft.value) return false

    const registration: IncomeRegistration = {
      id: draftEditingRegistrationId.value ?? Date.now(),
      incomes: draftIncomes.value
        .filter((income) => cents(income.amount) > 0)
        .map((income) => ({ ...income })),
      dependents: draftHasDependents.value
        ? draftDependents.value
            .filter((dependent) => cents(dependent.amount) > 0)
            .map((dependent) => ({ ...dependent }))
        : [],
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
            dependent.incomeType !== 'none' ? subtotal + cents(dependent.amount) : subtotal,
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
        if (dependent.incomeType === 'estagio' || dependent.incomeType === 'outros') {
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
              dependent.incomeType === 'pensao' ? subtotal + cents(dependent.amount) : subtotal,
            0,
          ),
        ),
      0,
    ),
  )

  const summaryTaxableTotal = computed(() => taxableTotal.value + draftTaxableTotal.value)
  const summaryExemptTotal = computed(() => exemptTotal.value + draftExemptTotal.value)

  const dependentCount = computed(() =>
    registrations.value.reduce((total, registration) => total + registration.dependents.length, 0),
  )

  return {
    registrations,
    items,
    taxableTotal,
    exemptTotal,
    summaryTaxableTotal,
    summaryExemptTotal,
    dependentCount,
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
    removeDraftIncome,
    setDraftHasDependents,
    setDraftDependentCount,
    saveDraft,
  }
})
