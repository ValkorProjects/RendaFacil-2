import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database.types'
import { emptyDeclaration, type DeclarationData } from '../declarations'

export const USER_A = '00000000-0000-4000-8000-000000000001'
export const USER_B = '00000000-0000-4000-8000-000000000002'
export function declaration(userId = USER_A): Tables<'declaracoes'> {
  return {
    id: crypto.randomUUID(),
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
    pensao_mensal_centavos: 0,
  }
}

export function createSupabaseMock() {
  let state = emptyDeclaration()
  let failure: 'read' | 'write' | null = null
  let beforeWrite: (() => Promise<void>) | undefined
  let beforeRead: (() => Promise<void>) | undefined
  const calls: {
    table: string
    filters: Record<string, unknown>
    columns: string
    operation: string
  }[] = []
  const from = vi.fn((table: string) => {
    const call = { table, filters: {} as Record<string, unknown>, columns: '', operation: 'select' }
    calls.push(call)
    let insert: Partial<Tables<'declaracoes'>> | undefined
    const execute = async () => {
      if (call.operation === 'upsert') {
        if (failure === 'write') return { data: null, error: new Error('offline') }
        state.declaration ??= { ...declaration(insert!.user_id), ...insert }
        return { data: null, error: null }
      }
      await beforeRead?.()
      if (failure === 'read') return { data: null, error: new Error('offline') }
      const row = state.declaration
      if (
        !row ||
        Object.entries(call.filters).some(([key, value]) => row[key as keyof typeof row] !== value)
      ) {
        return { data: null, error: null }
      }
      return {
        data: structuredClone(
          call.columns.includes('fontes_pagadoras')
            ? {
                ...row,
                fontes_pagadoras: state.sources,
                dependentes: state.dependents,
                despesas: state.expenses,
              }
            : row,
        ),
        error: null,
      }
    }
    const builder = {
      select(columns: string) {
        call.columns = columns
        return builder
      },
      eq(key: string, value: unknown) {
        call.filters[key] = value
        return builder
      },
      upsert(value: Partial<Tables<'declaracoes'>>, options: unknown) {
        call.operation = 'upsert'
        insert = value
        upsertOptions.push(options)
        return builder
      },
      single: execute,
      maybeSingle: execute,
      then(
        onfulfilled: (value: Awaited<ReturnType<typeof execute>>) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) {
        return execute().then(onfulfilled, onrejected)
      },
    }
    return builder
  })
  const upsertOptions: unknown[] = []
  const rpc = vi.fn(
    async (_name: string, args: Database['public']['Functions']['salvar_lancamentos']['Args']) => {
      await beforeWrite?.()
      if (failure === 'write') return { data: null, error: new Error('offline') }
      const patch = args.p_alteracoes as Record<string, unknown>
      // Mock transaction boundary. Database RLS and rollback are verified separately with SQL.
      for (const [key, name] of [
        ['sources', 'fontes'],
        ['dependents', 'dependentes'],
        ['expenses', 'despesas'],
      ] as const) {
        const rows = state[key] as { id: string }[]
        for (const row of patch[name] as { id: string }[]) {
          const index = rows.findIndex((item) => item.id === row.id)
          if (index < 0) rows.push(structuredClone(row))
          else rows[index] = structuredClone(row)
        }
        const ids = patch['excluir_' + name] as string[]
        for (let i = rows.length - 1; i >= 0; i--) if (ids.includes(rows[i]!.id)) rows.splice(i, 1)
      }
      if (typeof patch.pensao_mensal_centavos === 'number')
        state.declaration!.pensao_mensal_centavos = patch.pensao_mensal_centavos
      return { data: null, error: null }
    },
  )
  return {
    client: { from, rpc } as unknown as SupabaseClient<Database>,
    from,
    rpc,
    calls,
    upsertOptions,
    get state() {
      return structuredClone(state)
    },
    seed(value: DeclarationData) {
      state = structuredClone(value)
    },
    fail(value: typeof failure) {
      failure = value
    },
    delayWrite(value?: () => Promise<void>) {
      beforeWrite = value
    },
    delayRead(value?: () => Promise<void>) {
      beforeRead = value
    },
    reset() {
      state = emptyDeclaration()
      failure = null
      beforeWrite = undefined
      beforeRead = undefined
      calls.length = 0
      upsertOptions.length = 0
      from.mockClear()
      rpc.mockClear()
    },
  }
}

export const databaseMock = createSupabaseMock()
