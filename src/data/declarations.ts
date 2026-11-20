import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, Tables } from '@/types/database.types'
import { montarEntrada, type RegistroDespesa } from '@/irpf'

export const DECLARATION_YEAR = 2026
export interface DeclarationData {
  declaration: Tables<'declaracoes'> | null
  sources: Tables<'fontes_pagadoras'>[]
  dependents: Tables<'dependentes'>[]
  expenses: Tables<'despesas'>[]
}
export const emptyDeclaration = (): DeclarationData => ({
  declaration: null,
  sources: [],
  dependents: [],
  expenses: [],
})

export function expenseForEngine(row: Tables<'despesas'>): RegistroDespesa {
  if (
    !['saude', 'educacao', 'pensao'].includes(row.categoria) ||
    !['titular', 'dependente', 'outra'].includes(row.beneficiario)
  ) {
    throw new Error('Despesa com categoria ou beneficiário inválido.')
  }
  return {
    ...row,
    categoria: row.categoria as RegistroDespesa['categoria'],
    beneficiario: row.beneficiario as RegistroDespesa['beneficiario'],
  }
}

export function montarEntradaDoBanco(data: DeclarationData) {
  const input = montarEntrada({
    fontes: data.sources.filter((row) => row.categoria !== 'pensaoAlimenticia'),
    dependentes: data.dependents,
    despesas: data.expenses.map(expenseForEngine),
  })
  return input
}

const changed = <T extends { id: string }>(before: T[], after: T[]) =>
  after.filter((row) => {
    const old = before.find((item) => item.id === row.id)
    return !old || (Object.keys(row) as (keyof T)[]).some((key) => row[key] !== old[key])
  })
const removed = <T extends { id: string }>(before: T[], after: T[]) =>
  before.filter((row) => !after.some((next) => next.id === row.id)).map((row) => row.id)

// Inject the client so tests exercise the same queries without credentials or network access.
export function createDeclarationRepository(client: SupabaseClient<Database>) {
  async function ensureDeclaration(userId: string) {
    // DO NOTHING on the unique owner/year key: concurrent tabs must not reset existing answers.
    const { error } = await client
      .from('declaracoes')
      .upsert(
        { user_id: userId, ano_calendario: DECLARATION_YEAR },
        { onConflict: 'user_id,ano_calendario', ignoreDuplicates: true },
      )
    if (error) throw error
    const result = await client
      .from('declaracoes')
      .select('*')
      .eq('user_id', userId)
      .eq('ano_calendario', DECLARATION_YEAR)
      .single()
    if (result.error) throw result.error
    return result.data
  }

  async function load(userId: string): Promise<DeclarationData> {
    const { data, error } = await client
      .from('declaracoes')
      .select('*, fontes_pagadoras(*), dependentes(*), despesas(*)')
      .eq('user_id', userId)
      .eq('ano_calendario', DECLARATION_YEAR)
      .maybeSingle()
    if (error) throw error
    if (!data) return emptyDeclaration()
    const { fontes_pagadoras, dependentes, despesas, ...row } = data
    return {
      declaration: row,
      sources: fontes_pagadoras,
      dependents: dependentes,
      expenses: despesas,
    }
  }

  async function save(
    userId: string,
    before: DeclarationData,
    after: DeclarationData,
  ): Promise<DeclarationData> {
    const declaration = before.declaration ?? (await ensureDeclaration(userId))
    const scope = { user_id: userId, declaracao_id: declaration.id }
    const next = {
      declaration: {
        ...declaration,
        fontes_esperadas: after.declaration?.fontes_esperadas ?? declaration.fontes_esperadas,
      },
      sources: after.sources.map((row) => ({ ...row, ...scope })),
      dependents: after.dependents.map((row) => ({ ...row, ...scope })),
      expenses: after.expenses.map((row) => ({ ...row, ...scope })),
    }
    const patch = {
      fontes: changed(before.sources, next.sources),
      dependentes: changed(before.dependents, next.dependents),
      despesas: changed(before.expenses, next.expenses),
      excluir_fontes: removed(before.sources, next.sources),
      excluir_dependentes: removed(before.dependents, next.dependents),
      excluir_despesas: removed(before.expenses, next.expenses),
      ...(before.declaration?.fontes_esperadas !== next.declaration.fontes_esperadas
        ? { fontes_esperadas: next.declaration.fontes_esperadas }
        : {}),
    }
    for (const row of [
      ...next.sources,
      ...next.expenses,
      { fontes_esperadas: next.declaration.fontes_esperadas },
    ]) {
      for (const [key, value] of Object.entries(row)) {
        if (
          key.endsWith('_centavos') &&
          value !== null &&
          (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        ) {
          throw new Error('Informe valores válidos em centavos.')
        }
      }
    }
    const { error } = await client.rpc('salvar_lancamentos', {
      p_declaracao_id: declaration.id,
      p_alteracoes: patch as Json,
    })
    if (error) throw error
    return next
  }
  return { load, save, ensureDeclaration }
}
