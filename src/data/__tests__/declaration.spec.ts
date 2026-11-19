import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'
import { loadDeclaration, saveRegistration } from '@/data/declaration'

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn() }))

type Result = { data: unknown; error: { message: string } | null }

class MockQuery implements PromiseLike<Result> {
  operation = 'select'
  payload: unknown
  selected = false
  isSingle = false
  filters: Array<[string, string, unknown]> = []

  constructor(
    readonly table: string,
    readonly requests: MockQuery[],
    readonly resolve: (query: MockQuery) => Result,
  ) {
    requests.push(this)
  }

  upsert(payload: unknown) {
    this.operation = 'upsert'
    this.payload = payload
    return this
  }

  insert(payload: unknown) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: unknown) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  select() {
    this.selected = true
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push(['eq', column, value])
    return this
  }

  in(column: string, value: unknown) {
    this.filters.push(['in', column, value])
    return this
  }

  order() {
    return this
  }

  single() {
    this.isSingle = true
    return Promise.resolve(this.resolve(this))
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolve(this)).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    )
  }
}

const declaration: Database['public']['Tables']['declaracoes']['Row'] = {
  id: 'declaration-1',
  user_id: 'user-1',
  ano_calendario: 2026,
  fontes_esperadas: 2,
  questionario_etapa: null,
  questionario_concluido: false,
  triagem: {},
  resultado_real_tipo: null,
  resultado_real_centavos: null,
  resultado_real_modelo: null,
  resultado_estimado_centavos: null,
  criado_em: '2026-01-01T00:00:00Z',
  atualizado_em: '2026-01-01T00:00:00Z',
}

const clientWith = (responseFor: (query: MockQuery) => Result, requests: MockQuery[] = []) => {
  const client = {
    from: (table: string) => new MockQuery(table, requests, responseFor),
  }
  vi.mocked(getSupabase).mockReturnValue(client as unknown as ReturnType<typeof getSupabase>)
  return requests
}

beforeEach(() => vi.clearAllMocks())

describe('declaration persistence', () => {
  it('loads the declaration and maps database UUIDs to local dependent links', async () => {
    const requests = clientWith((query) => {
      if (query.table === 'declaracoes' && query.operation === 'upsert') {
        return { data: null, error: null }
      }
      if (query.table === 'declaracoes') return { data: declaration, error: null }
      if (query.table === 'dependentes') {
        return {
          data: [
            {
              id: 'dependent-uuid',
              user_id: 'user-1',
              declaracao_id: 'declaration-1',
              apelido: 'Lia',
              relacao: 'filho_enteado',
              em_outra_declaracao: false,
              teve_renda: false,
            },
          ],
          error: null,
        }
      }
      if (query.table === 'fontes_pagadoras') {
        return {
          data: [
            {
              id: 'source-uuid',
              user_id: 'user-1',
              declaracao_id: 'declaration-1',
              cadastro_id: 'group-uuid',
              categoria: 'clt',
              dependente_id: 'dependent-uuid',
              nome: 'clt',
              rendimentos_centavos: 7_800_001,
              previdencia_centavos: 853_812,
              irrf_centavos: 298_104,
              rendimentos_mensais_centavos: 650_000,
              previdencia_mensal_centavos: 71_151,
              irrf_mensal_centavos: 24_842,
              decimo_terceiro_centavos: 0,
              irrf_13_centavos: 0,
              plr_centavos: 0,
            },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const snapshot = await loadDeclaration('user-1')

    expect(snapshot).toMatchObject({
      declarationId: 'declaration-1',
      expectedSources: 2,
      dependents: [{ dbId: 'dependent-uuid', apelido: 'Lia' }],
      registrations: [
        {
          dbId: 'group-uuid',
          incomes: [
            {
              dbId: 'source-uuid',
              dependentId: snapshot.dependents[0]?.id,
              annualizedOverride: {
                monthly: { amount: 650_000, inss: 71_151, irrf: 24_842 },
                annual: { amount: 7_800_001, inss: 853_812, irrf: 298_104 },
              },
            },
          ],
        },
      ],
    })
    expect(requests.some((query) => query.table === 'despesas')).toBe(true)
  })

  it('stores monthly input and annualizes exactly once for the annual calculation', async () => {
    const requests = clientWith((query) => {
      if (query.table === 'fontes_pagadoras' && query.operation === 'upsert') {
        return { data: query.payload, error: null }
      }
      return { data: [], error: null }
    })

    const result = await saveRegistration(
      { userId: 'user-1', declarationId: 'declaration-1' },
      {
        id: 1,
        incomes: [
          {
            id: 2,
            category: 'clt',
            amount: 'R$ 6.500,00',
            inss: 'R$ 711,51',
            irrf: 'R$ 248,42',
          },
        ],
      },
      [],
    )

    const sourceWrites = requests.find(
      (query) => query.table === 'fontes_pagadoras' && query.operation === 'upsert',
    )?.payload as Database['public']['Tables']['fontes_pagadoras']['Insert'][]
    expect(sourceWrites).toHaveLength(1)
    expect(sourceWrites[0]).toMatchObject({
      rendimentos_mensais_centavos: 650_000,
      rendimentos_centavos: 7_800_000,
      previdencia_centavos: 853_812,
      irrf_centavos: 298_104,
      categoria: 'clt',
    })
    expect(result.incomes[0]?.dbId).toBe(sourceWrites[0]?.id)
    expect(requests.some((query) => query.table === 'declaracoes')).toBe(false)
  })

  it('saves all sources in one database request', async () => {
    const requests = clientWith((query) => {
      if (query.table === 'fontes_pagadoras' && query.operation === 'upsert') {
        return { data: query.payload, error: null }
      }
      return { data: [], error: null }
    })

    await saveRegistration(
      { userId: 'user-1', declarationId: 'declaration-1' },
      {
        id: 1,
        incomes: [
          { id: 2, category: 'clt', amount: 'R$ 6.500,00', inss: 'R$ 711,51', irrf: 'R$ 248,42' },
          {
            id: 3,
            category: 'proLabore',
            amount: 'R$ 1.000,00',
            inss: 'R$ 0,00',
            irrf: 'R$ 0,00',
          },
        ],
      },
      [],
    )

    expect(
      requests.filter(
        (query) => query.table === 'fontes_pagadoras' && query.operation === 'upsert',
      ),
    ).toHaveLength(1)
  })

  it('does not turn a failed database read into an empty declaration', async () => {
    clientWith((query) => {
      if (query.table === 'declaracoes' && query.operation === 'upsert') {
        return { data: null, error: null }
      }
      if (query.table === 'declaracoes') {
        return { data: null, error: { message: 'network unavailable' } }
      }
      return { data: [], error: null }
    })

    await expect(loadDeclaration('user-1')).rejects.toThrow('network unavailable')
  })
})
