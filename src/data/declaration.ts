import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IncomeCategory,
  IncomeRegistration,
  RegisteredExpense,
  RegisteredIncomeEntry,
} from '@/stores/income'
import type { RegisteredDependent } from '@/utils/dependents'
import { getSupabase } from '@/lib/supabase'
import { cents, formatMoneyInput } from '@/utils/currency'
import type { Database } from '@/types/database.types'

const CALENDAR_YEAR = 2026

type Client = SupabaseClient<Database>
type DeclarationRow = Database['public']['Tables']['declaracoes']['Row']
type SourceRow = Database['public']['Tables']['fontes_pagadoras']['Row']
type DependentRow = Database['public']['Tables']['dependentes']['Row']
type ExpenseRow = Database['public']['Tables']['despesas']['Row']

export interface DeclarationSnapshot {
  declarationId: string
  expectedSources: number
  dependents: RegisteredDependent[]
  registrations: IncomeRegistration[]
  expenses: RegisteredExpense[]
}

export interface DeclarationContext {
  userId: string
  declarationId: string
}

const fail = (operation: string, error: { message: string }): never => {
  throw new Error(`${operation}: ${error.message}`)
}

const makeUuid = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Este navegador não consegue gerar IDs seguros para salvar os dados.')
  }
  return globalThis.crypto.randomUUID()
}

const monthlyValues = (row: SourceRow) => {
  const amount = row.rendimentos_mensais_centavos ?? Math.round(row.rendimentos_centavos / 12)
  const inss = row.previdencia_mensal_centavos ?? Math.round(row.previdencia_centavos / 12)
  const irrf = row.irrf_mensal_centavos ?? Math.round(row.irrf_centavos / 12)
  return { amount, inss, irrf }
}

const toIncome = (row: SourceRow, localId: number, dependentId: number | null) => {
  const monthly = monthlyValues(row)
  const legacyMismatch =
    row.rendimentos_centavos !== monthly.amount * 12 ||
    row.previdencia_centavos !== monthly.inss * 12 ||
    row.irrf_centavos !== monthly.irrf * 12

  return {
    id: localId,
    dbId: row.id,
    category: row.categoria as IncomeCategory,
    amount: formatMoneyInput(monthly.amount),
    inss: formatMoneyInput(monthly.inss),
    irrf: formatMoneyInput(monthly.irrf),
    dependentId,
    ...(legacyMismatch
      ? {
          annualizedOverride: {
            monthly,
            annual: {
              amount: row.rendimentos_centavos,
              inss: row.previdencia_centavos,
              irrf: row.irrf_centavos,
            },
          },
        }
      : {}),
  } satisfies RegisteredIncomeEntry
}

export async function loadDeclaration(userId: string): Promise<DeclarationSnapshot> {
  const client = getSupabase()
  const declaration = await ensureDeclaration(client, userId)

  const [dependentsResult, sourcesResult, expensesResult] = await Promise.all([
    client
      .from('dependentes')
      .select('id,user_id,declaracao_id,apelido,relacao,em_outra_declaracao,teve_renda')
      .eq('user_id', userId)
      .eq('declaracao_id', declaration.id)
      .order('id'),
    client
      .from('fontes_pagadoras')
      .select('*')
      .eq('user_id', userId)
      .eq('declaracao_id', declaration.id)
      .order('id'),
    client
      .from('despesas')
      .select('*')
      .eq('user_id', userId)
      .eq('declaracao_id', declaration.id)
      .order('id'),
  ])
  if (dependentsResult.error)
    return fail('Não foi possível carregar os dependentes', dependentsResult.error)
  if (sourcesResult.error)
    return fail('Não foi possível carregar as fontes de renda', sourcesResult.error)
  if (expensesResult.error)
    return fail('Não foi possível carregar as despesas', expensesResult.error)

  let nextLocalId = 1
  const dependents = (dependentsResult.data ?? []).map((row: DependentRow) => ({
    id: nextLocalId++,
    dbId: row.id,
    apelido: row.apelido,
    relacao: row.relacao as RegisteredDependent['relacao'],
    em_outra_declaracao: row.em_outra_declaracao,
    teve_renda_propria: row.teve_renda,
  }))
  const localDependentId = new Map(
    dependents.map((dependent) => [dependent.dbId, dependent.id] as const),
  )

  const registrationsById = new Map<string, IncomeRegistration>()
  for (const row of (sourcesResult.data ?? []) as SourceRow[]) {
    const registrationId = row.cadastro_id
    let registration = registrationsById.get(registrationId)
    if (!registration) {
      registration = { id: nextLocalId++, dbId: registrationId, incomes: [] }
      registrationsById.set(registrationId, registration)
    }
    if (row.categoria !== 'nao_informada' && !isIncomeCategory(row.categoria)) {
      throw new Error(`A fonte de renda ${row.id} tem uma categoria desconhecida no banco.`)
    }
    const dependentId = row.dependente_id === null ? null : localDependentId.get(row.dependente_id)
    if (row.dependente_id !== null && dependentId === undefined) {
      throw new Error(`A fonte de renda ${row.id} aponta para um dependente inexistente.`)
    }
    registration.incomes.push(toIncome(row, nextLocalId++, dependentId ?? null))
  }

  const expenses = ((expensesResult.data ?? []) as ExpenseRow[]).map((row) => {
    const dependentId = row.dependente_id === null ? null : localDependentId.get(row.dependente_id)
    if (row.dependente_id !== null && dependentId === undefined) {
      throw new Error(`A despesa ${row.id} aponta para um dependente inexistente.`)
    }
    return {
      id: nextLocalId++,
      dbId: row.id,
      categoria: row.categoria as RegisteredExpense['categoria'],
      tipo: row.tipo as RegisteredExpense['tipo'],
      beneficiario: row.beneficiario as RegisteredExpense['beneficiario'],
      dependente_id: dependentId === null || dependentId === undefined ? null : String(dependentId),
      valor_centavos: row.valor_centavos,
      reembolso_centavos: row.reembolso_centavos,
      base_legal_ok: row.base_legal_ok,
      data: row.data,
      descricao: row.descricao ?? '',
      recebedor: row.recebedor,
      pensaoIniciouEm2026: row.pensao_iniciou_em_2026,
    } satisfies RegisteredExpense
  })

  return {
    declarationId: declaration.id,
    expectedSources: declaration.fontes_esperadas,
    dependents,
    registrations: [...registrationsById.values()],
    expenses,
  }
}

async function ensureDeclaration(client: Client, userId: string): Promise<DeclarationRow> {
  const { error: insertError } = await client
    .from('declaracoes')
    .upsert(
      { user_id: userId, ano_calendario: CALENDAR_YEAR },
      { onConflict: 'user_id,ano_calendario', ignoreDuplicates: true },
    )
  if (insertError) fail('Não foi possível preparar a declaração de 2026', insertError)

  const { data, error } = await client
    .from('declaracoes')
    .select('*')
    .eq('user_id', userId)
    .eq('ano_calendario', CALENDAR_YEAR)
    .single()
  if (error) fail('Não foi possível localizar a declaração de 2026', error)
  if (!data) throw new Error('A declaração de 2026 não foi encontrada após sua criação.')
  return data
}

export async function saveExpectedSources(context: DeclarationContext, count: number) {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100) {
    throw new Error('Informe um número de fontes entre 0 e 100.')
  }
  const { data, error } = await getSupabase()
    .from('declaracoes')
    .update({ fontes_esperadas: count })
    .eq('id', context.declarationId)
    .eq('user_id', context.userId)
    .select('id')
    .single()
  if (error) fail('Não foi possível salvar o número esperado de fontes', error)
  if (!data) throw new Error('A declaração não foi encontrada para atualizar as fontes esperadas.')
}

export async function saveDependent(
  context: DeclarationContext,
  dependent: Omit<RegisteredDependent, 'id'> & { dbId?: string },
) {
  const payload = {
    user_id: context.userId,
    declaracao_id: context.declarationId,
    apelido: dependent.apelido,
    relacao: dependent.relacao,
    em_outra_declaracao: dependent.em_outra_declaracao,
    teve_renda: dependent.teve_renda_propria,
    ...(dependent.dbId ? { id: dependent.dbId } : {}),
  }
  const { data, error } = await getSupabase()
    .from('dependentes')
    .upsert(payload)
    .select('id')
    .single()
  if (error) fail('Não foi possível salvar o dependente', error)
  if (!data) throw new Error('O banco não confirmou o cadastro do dependente.')
  return data.id
}

export async function deleteDependent(context: DeclarationContext, dbId: string) {
  const { data, error } = await getSupabase()
    .from('dependentes')
    .delete()
    .eq('id', dbId)
    .eq('user_id', context.userId)
    .eq('declaracao_id', context.declarationId)
    .select('id')
  if (error) fail('Não foi possível excluir o dependente', error)
  if (!data) throw new Error('O banco não confirmou a exclusão do dependente.')
  if (!data.length) throw new Error('O dependente não foi encontrado para exclusão.')
}

function isIncomeCategory(value: string): value is IncomeCategory {
  return [
    'clt',
    'proLabore',
    'autonomo',
    'aposentadoria',
    'alugueis',
    'pensaoAlimenticia',
  ].includes(value)
}

export function annualizedIncomeValue(
  income: RegisteredIncomeEntry,
  field: 'amount' | 'inss' | 'irrf',
) {
  const legacy = income.annualizedOverride
  const centsValue = cents(income[field])
  if (legacy && legacy.monthly[field] === centsValue) return legacy.annual[field]
  return centsValue * 12
}

function incomeSourcePayload(
  context: DeclarationContext,
  registrationId: string,
  income: RegisteredIncomeEntry,
  dependentDbId: string | null,
  id: string,
) {
  if (!isIncomeCategory(income.category)) {
    throw new Error('Escolha a categoria da fonte de renda antes de salvar.')
  }
  const amount = cents(income.amount)
  const inss = cents(income.inss)
  const irrf = cents(income.irrf)
  const payload = {
    user_id: context.userId,
    declaracao_id: context.declarationId,
    cadastro_id: registrationId,
    categoria: income.category,
    dependente_id: dependentDbId,
    nome: income.category,
    rendimentos_centavos: annualizedIncomeValue(income, 'amount'),
    previdencia_centavos: annualizedIncomeValue(income, 'inss'),
    irrf_centavos: annualizedIncomeValue(income, 'irrf'),
    rendimentos_mensais_centavos: amount,
    previdencia_mensal_centavos: inss,
    irrf_mensal_centavos: irrf,
    id,
  }
  return payload
}

export async function saveRegistration(
  context: DeclarationContext,
  registration: IncomeRegistration,
  dependents: readonly RegisteredDependent[],
  previous?: IncomeRegistration,
): Promise<IncomeRegistration> {
  const client = getSupabase()
  const registrationId = registration.dbId ?? makeUuid()
  const incomePayloads = registration.incomes.map((income) => {
    const dependent =
      income.dependentId == null ? null : dependents.find((item) => item.id === income.dependentId)
    if (income.dependentId != null && !dependent?.dbId) {
      throw new Error('Salve o dependente antes de vincular a fonte de renda.')
    }
    return {
      income,
      payload: incomeSourcePayload(
        context,
        registrationId,
        income,
        dependent?.dbId ?? null,
        income.dbId ?? makeUuid(),
      ),
    }
  })
  const payloads = incomePayloads.map(({ payload }) => payload)

  let savedIncomes: RegisteredIncomeEntry[] = []
  if (payloads.length) {
    const { data, error } = await client.from('fontes_pagadoras').upsert(payloads).select('id')
    if (error) fail('Não foi possível salvar as fontes de renda', error)
    if (!data || data.length !== payloads.length) {
      throw new Error('O banco não confirmou o cadastro de todas as fontes de renda.')
    }
    const confirmedIds = new Set(data.map((row) => row.id))
    if (payloads.some((payload) => !confirmedIds.has(payload.id))) {
      throw new Error('O banco não confirmou o cadastro de todas as fontes de renda.')
    }
    savedIncomes = incomePayloads.map(({ income, payload }) => ({
      ...income,
      dbId: payload.id,
    }))
  }

  const retainedIds = new Set(savedIncomes.map((income) => income.dbId).filter(Boolean))
  const removedIds = (previous?.incomes ?? [])
    .map((income) => income.dbId)
    .filter((id): id is string => Boolean(id && !retainedIds.has(id)))
  if (removedIds.length) {
    const { data, error } = await client
      .from('fontes_pagadoras')
      .delete()
      .eq('user_id', context.userId)
      .eq('declaracao_id', context.declarationId)
      .in('id', removedIds)
      .select('id')
    if (error) fail('Não foi possível excluir as fontes removidas', error)
    if (!data) throw new Error('O banco não confirmou a exclusão das fontes removidas.')
    if (data.length !== removedIds.length) {
      throw new Error('Nem todas as fontes removidas foram encontradas no banco.')
    }
  }
  return { ...registration, dbId: registrationId, incomes: savedIncomes }
}

export async function deleteRegistration(
  context: DeclarationContext,
  registration: IncomeRegistration,
) {
  const client = getSupabase()
  const { data, error } = await client
    .from('fontes_pagadoras')
    .delete()
    .eq('user_id', context.userId)
    .eq('declaracao_id', context.declarationId)
    .eq('cadastro_id', registration.dbId ?? '')
    .select('id')
  if (error) fail('Não foi possível excluir o cadastro de rendimentos', error)
  if (!data) throw new Error('O banco não confirmou a exclusão do cadastro de rendimentos.')
  if (!data.length) throw new Error('O cadastro de rendimentos não foi encontrado para exclusão.')
}

function dependentDatabaseId(
  expense: Omit<RegisteredExpense, 'id'> | RegisteredExpense,
  dependents: readonly RegisteredDependent[],
) {
  if (expense.dependente_id === null) return null
  const localId = Number(expense.dependente_id)
  const dependent = dependents.find((item) => item.id === localId)
  if (!dependent?.dbId) throw new Error('Salve o dependente antes de vincular a despesa.')
  return dependent.dbId
}

const expensePayload = (
  context: DeclarationContext,
  expense: Omit<RegisteredExpense, 'id'> | RegisteredExpense,
  dependents: readonly RegisteredDependent[],
) => ({
  user_id: context.userId,
  declaracao_id: context.declarationId,
  categoria: expense.categoria,
  tipo: expense.tipo,
  beneficiario: expense.beneficiario,
  dependente_id: dependentDatabaseId(expense, dependents),
  valor_centavos: expense.valor_centavos,
  reembolso_centavos: expense.reembolso_centavos,
  base_legal_ok: expense.base_legal_ok,
  data: expense.data,
  descricao: expense.descricao.trim() || null,
  recebedor: expense.recebedor.trim(),
  pensao_iniciou_em_2026: expense.pensaoIniciouEm2026,
  ...('dbId' in expense && expense.dbId ? { id: expense.dbId } : {}),
})

export async function saveExpense(
  context: DeclarationContext,
  expense: Omit<RegisteredExpense, 'id'> | RegisteredExpense,
  dependents: readonly RegisteredDependent[],
) {
  const { data, error } = await getSupabase()
    .from('despesas')
    .upsert(expensePayload(context, expense, dependents))
    .select('id')
    .single()
  if (error) fail('Não foi possível salvar a despesa', error)
  if (!data) throw new Error('O banco não confirmou o cadastro da despesa.')
  return { ...expense, dbId: data.id }
}

export async function deleteExpense(context: DeclarationContext, dbId: string) {
  const { data, error } = await getSupabase()
    .from('despesas')
    .delete()
    .eq('id', dbId)
    .eq('user_id', context.userId)
    .eq('declaracao_id', context.declarationId)
    .select('id')
  if (error) fail('Não foi possível excluir a despesa', error)
  if (!data) throw new Error('O banco não confirmou a exclusão da despesa.')
  if (!data.length) throw new Error('A despesa não foi encontrada para exclusão.')
}
