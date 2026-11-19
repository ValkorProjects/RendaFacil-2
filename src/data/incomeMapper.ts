import type { Tables } from '@/types/database.types'
import type {
  Household,
  IncomeCategory,
  IncomeRegistration,
  RegisteredIncomeEntry,
} from '@/stores/income'
import type { RegisteredDependent } from '@/utils/dependents'
import { cents, formatMoneyInput } from '@/utils/currency'
import { expenseForEngine, type DeclarationData } from './declarations'

export interface IncomeState {
  registrations: IncomeRegistration[]
  household: Household
}
const relations = {
  filho_enteado: 'filho_enteado',
  conjuge_companheiro: 'conjuge',
  pais_avos_bisavos: 'pais_avos',
  outro: 'outro',
} as const
const categories = [
  'clt',
  'proLabore',
  'autonomo',
  'aposentadoria',
  'alugueis',
  'pensaoAlimenticia',
]

// UI counters are local only. Stable UUIDs make retries idempotent, including a lost HTTP response.
export function createIncomeMapper(nextId: () => number) {
  const ids = new Map<string, string>()
  const uiId = (kind: string, databaseId: string) => {
    const entry = [...ids.entries()].find(
      ([key, value]) => key.startsWith(kind + ':') && value === databaseId,
    )
    if (entry) return Number(entry[0].split(':')[1])
    const id = nextId()
    ids.set(`${kind}:${id}`, databaseId)
    return id
  }
  const databaseId = (kind: string, id: number) => {
    const key = `${kind}:${id}`
    if (!ids.has(key)) ids.set(key, crypto.randomUUID())
    return ids.get(key)!
  }
  function fromRows(data: DeclarationData): IncomeState {
    const dependents: RegisteredDependent[] = data.dependents.map((row) => {
      const relacao = (Object.keys(relations) as (keyof typeof relations)[]).find(
        (key) => relations[key] === row.relacao,
      )
      if (!relacao) throw new Error('Relação de dependente desconhecida.')
      return {
        id: uiId('dependent', row.id),
        apelido: row.apelido,
        relacao,
        em_outra_declaracao: row.em_outra_declaracao,
        teve_renda_propria: row.teve_renda,
      }
    })
    const registrations: IncomeRegistration[] = []
    for (const row of data.sources) {
      if (!categories.includes(row.categoria)) throw new Error('Categoria de renda desconhecida.')
      const id = uiId('registration', row.cadastro_id)
      let registration = registrations.find((item) => item.id === id)
      if (!registration) {
        registration = { id, incomes: [] }
        registrations.push(registration)
      }
      registration.incomes.push({
        id: uiId('source', row.id),
        category: row.categoria as IncomeCategory,
        dependentId: row.dependente_id === null ? null : uiId('dependent', row.dependente_id),
        amount: formatMoneyInput(row.rendimentos_centavos / 12),
        inss: formatMoneyInput(row.previdencia_centavos / 12),
        irrf: formatMoneyInput(row.irrf_centavos / 12),
        annualAmounts: {
          rendimentos_centavos: row.rendimentos_centavos,
          previdencia_centavos: row.previdencia_centavos,
          irrf_centavos: row.irrf_centavos,
        },
      })
    }
    return {
      registrations,
      household: {
        dependents,
        expenses: data.expenses.map((row) => ({
          ...expenseForEngine(row),
          id: String(uiId('expense', row.id)),
          descricao: row.descricao ?? '',
          dependente_id:
            row.dependente_id === null ? null : String(uiId('dependent', row.dependente_id)),
        })),
      },
    }
  }
  function toRows(state: IncomeState, before: DeclarationData, userId: string): DeclarationData {
    const scope = { user_id: userId, declaracao_id: before.declaration?.id ?? '' }
    const declaration: Tables<'declaracoes'> = {
      id: '',
      user_id: userId,
      ano_calendario: 2026,
      fontes_esperadas: 1,
      questionario_etapa: null,
      questionario_concluido: false,
      triagem: {},
      resultado_real_tipo: null,
      resultado_real_centavos: null,
      resultado_real_modelo: null,
      resultado_estimado_centavos: null,
      criado_em: '',
      atualizado_em: '',
      ...before.declaration,
    }
    return {
      declaration,
      dependents: state.household.dependents.map((person) => ({
        ...scope,
        id: databaseId('dependent', person.id),
        apelido: person.apelido,
        relacao: relations[person.relacao],
        em_outra_declaracao: person.em_outra_declaracao,
        teve_renda: person.teve_renda_propria,
      })),
      sources: state.registrations.flatMap((group) =>
        group.incomes.map((entry) => {
          const id = databaseId('source', entry.id)
          const old = before.sources.find((row) => row.id === id)
          return {
            id,
            ...scope,
            decimo_terceiro_centavos: 0,
            irrf_13_centavos: 0,
            plr_centavos: 0,
            ...old,
            cadastro_id: databaseId('registration', group.id),
            nome: old?.nome ?? entry.category,
            categoria: entry.category,
            dependente_id:
              entry.dependentId == null ? null : databaseId('dependent', entry.dependentId),
            ...annualIncomeAmounts(entry),
          }
        }),
      ),
      expenses: (state.household.expenses ?? []).map((expense) => ({
        ...scope,
        data: '2026-12-31',
        ...before.expenses.find((row) => row.id === databaseId('expense', Number(expense.id))),
        ...expense,
        id: databaseId('expense', Number(expense.id)),
        dependente_id:
          expense.dependente_id === null
            ? null
            : databaseId('dependent', Number(expense.dependente_id)),
      })),
    }
  }
  return { fromRows, toRows }
}

// An imported annual amount need not divide by 12. Preserve its exact cents until that field changes.
export function annualIncomeAmounts(entry: RegisteredIncomeEntry) {
  const annual = (
    field: 'amount' | 'inss' | 'irrf',
    key: keyof NonNullable<RegisteredIncomeEntry['annualAmounts']>,
  ) => {
    const original = entry.annualAmounts?.[key]
    return original !== undefined && cents(entry[field]) === cents(formatMoneyInput(original / 12))
      ? original
      : cents(entry[field]) * 12
  }
  return {
    rendimentos_centavos: annual('amount', 'rendimentos_centavos'),
    previdencia_centavos: annual('inss', 'previdencia_centavos'),
    irrf_centavos: annual('irrf', 'irrf_centavos'),
  }
}
