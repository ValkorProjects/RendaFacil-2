import { describe, expect, it } from 'vitest'

import {
  avaliarDespesa,
  calcularAjusteAnual,
  montarEntrada,
  TIPOS_DESPESA,
  type DadosDeclaracao,
  type RegistroDependente,
  type RegistroDespesa,
  type RegistroFonte,
} from '@/irpf'

// Linhas como vêm do Supabase, com dinheiro em centavos.

const fonte = (dados: Partial<RegistroFonte> = {}): RegistroFonte => ({
  dependente_id: null,
  rendimentos_centavos: 7_800_000,
  previdencia_centavos: 853_812,
  irrf_centavos: 298_104,
  ...dados,
})

const despesa = (dados: Partial<RegistroDespesa>): RegistroDespesa => ({
  categoria: 'saude',
  tipo: 'consulta_medica',
  beneficiario: 'titular',
  dependente_id: null,
  valor_centavos: 30_000,
  reembolso_centavos: 0,
  base_legal_ok: null,
  ...dados,
})

const LIA: RegistroDependente = { id: 'lia', em_outra_declaracao: false }
const TEO: RegistroDependente = { id: 'teo', em_outra_declaracao: false }
const NA_DECLARACAO_DO_PAI: RegistroDependente = { id: 'caio', em_outra_declaracao: true }

const declaracao = (dados: Partial<DadosDeclaracao>): DadosDeclaracao => ({
  fontes: [fonte()],
  dependentes: [],
  despesas: [],
  ...dados,
})

// Caso F5 do RF-08 montado a partir das linhas do banco
const F5: DadosDeclaracao = declaracao({
  dependentes: [LIA, TEO],
  despesas: [
    despesa({
      categoria: 'pensao',
      tipo: 'pensao_alimenticia',
      beneficiario: 'outra',
      valor_centavos: 960_000,
      base_legal_ok: true,
    }),
    despesa({ tipo: 'plano_saude', valor_centavos: 480_000 }),
    despesa({ tipo: 'consulta_medica', valor_centavos: 30_000, reembolso_centavos: 10_000 }),
    despesa({ tipo: 'remedio_farmacia', valor_centavos: 50_000 }),
    despesa({ categoria: 'educacao', tipo: 'graduacao', valor_centavos: 600_000 }),
    despesa({
      categoria: 'educacao',
      tipo: 'ensino_fundamental',
      beneficiario: 'dependente',
      dependente_id: 'lia',
      valor_centavos: 200_000,
    }),
    despesa({
      categoria: 'educacao',
      tipo: 'curso_idiomas',
      beneficiario: 'dependente',
      dependente_id: 'lia',
      valor_centavos: 120_000,
    }),
  ],
})

describe('montarEntrada', () => {
  it('monta o caso F5 a partir das linhas do banco e chega ao mesmo resultado', () => {
    const r = calcularAjusteAnual(montarEntrada(F5))

    expect(r).toMatchObject({
      totalPensoes: 960_000,
      totalSaude: 500_000,
      totalEducacao: 556_150,
      modelo: 'completo',
      resultado: 197_330,
    })
  })

  it('mantém as despesas que não deduzem, marcadas como não dedutíveis', () => {
    const entrada = montarEntrada(F5)

    expect(entrada.saude.map((item) => item.dedutivel)).toEqual([true, true, false])
    expect(entrada.educacao).toEqual([
      { pessoa: 'titular', valor: 600_000, dedutivel: true },
      { pessoa: 'lia', valor: 200_000, dedutivel: true },
      { pessoa: 'lia', valor: 120_000, dedutivel: false },
    ])
  })

  it('soma a renda dos dependentes válidos', () => {
    const estagio = fonte({
      dependente_id: 'lia',
      rendimentos_centavos: 1_200_000,
      previdencia_centavos: 0,
      irrf_centavos: 0,
    })
    const entrada = montarEntrada(declaracao({ fontes: [fonte(), estagio], dependentes: [LIA] }))

    expect(calcularAjusteAnual(entrada).rendimentos).toBe(9_000_000)
  })

  it('ignora o dependente que está em outra declaração, com a renda e as despesas dele', () => {
    const entrada = montarEntrada(
      declaracao({
        fontes: [fonte(), fonte({ dependente_id: 'caio', rendimentos_centavos: 1_200_000 })],
        dependentes: [LIA, NA_DECLARACAO_DO_PAI],
        despesas: [despesa({ beneficiario: 'dependente', dependente_id: 'caio' })],
      }),
    )

    expect(entrada.dependentes).toBe(1)
    expect(entrada.fontes).toHaveLength(1)
    expect(entrada.saude).toEqual([{ valor: 30_000, reembolso: 0, dedutivel: false }])
  })

  it('só soma a pensão com base legal confirmada', () => {
    const pensao = (base_legal_ok: boolean | null) =>
      despesa({
        categoria: 'pensao',
        tipo: 'pensao_alimenticia',
        beneficiario: 'outra',
        valor_centavos: 960_000,
        base_legal_ok,
      })
    const entrada = montarEntrada(
      declaracao({ despesas: [pensao(true), pensao(false), pensao(null)] }),
    )

    expect(entrada.pensoes).toBe(960_000)
  })

  it('recusa linha ligada a um dependente que não foi informado', () => {
    expect(() => montarEntrada(declaracao({ fontes: [fonte({ dependente_id: 'x' })] }))).toThrow(
      'Dependente x',
    )
    const despesaDeX = despesa({ beneficiario: 'dependente', dependente_id: 'x' })
    expect(() => montarEntrada(declaracao({ despesas: [despesaDeX] }))).toThrow('Dependente x')
  })
})

describe('avaliarDespesa', () => {
  const dependentes = [LIA, NA_DECLARACAO_DO_PAI]

  it.each<[string, Partial<RegistroDespesa>, ReturnType<typeof avaliarDespesa>]>([
    ['consulta do titular', {}, { deduz: true }],
    [
      'consulta de dependente',
      { beneficiario: 'dependente', dependente_id: 'lia' },
      { deduz: true },
    ],
    [
      'remédio de farmácia',
      { tipo: 'remedio_farmacia' },
      { deduz: false, motivo: 'tipo_nao_dedutivel' },
    ],
    [
      'curso de idiomas',
      { categoria: 'educacao', tipo: 'curso_idiomas' },
      { deduz: false, motivo: 'tipo_nao_dedutivel' },
    ],
    ['tipo fora do catálogo', { tipo: 'massagem' }, { deduz: false, motivo: 'tipo_desconhecido' }],
    [
      'tipo de outra categoria',
      { tipo: 'graduacao' },
      { deduz: false, motivo: 'tipo_desconhecido' },
    ],
    [
      'nome herdado de Object',
      { tipo: 'constructor' },
      { deduz: false, motivo: 'tipo_desconhecido' },
    ],
    [
      'despesa de outra pessoa',
      { beneficiario: 'outra' },
      { deduz: false, motivo: 'beneficiario_invalido' },
    ],
    [
      'dependente em outra declaração',
      { beneficiario: 'dependente', dependente_id: 'caio' },
      { deduz: false, motivo: 'beneficiario_invalido' },
    ],
    [
      'reembolso do valor todo',
      { reembolso_centavos: 30_000 },
      { deduz: false, motivo: 'reembolsado' },
    ],
    ['reembolso parcial', { reembolso_centavos: 29_999 }, { deduz: true }],
    [
      'pensão sem base legal',
      { categoria: 'pensao', tipo: 'pensao_alimenticia', beneficiario: 'outra' },
      { deduz: false, motivo: 'sem_base_legal' },
    ],
    [
      'pensão com base legal',
      {
        categoria: 'pensao',
        tipo: 'pensao_alimenticia',
        beneficiario: 'outra',
        base_legal_ok: true,
      },
      { deduz: true },
    ],
  ])('%s', (_, dados, esperado) => {
    expect(avaliarDespesa(despesa(dados), dependentes)).toEqual(esperado)
  })
})

describe('TIPOS_DESPESA', () => {
  it('tem os tipos do RF-13: o que deduz e o que não deduz em cada categoria', () => {
    const contar = (categoria: string, dedutivel: boolean) =>
      Object.values(TIPOS_DESPESA).filter(
        (tipo) => tipo.categoria === categoria && tipo.dedutivel === dedutivel,
      ).length

    expect([contar('saude', true), contar('saude', false)]).toEqual([8, 3])
    expect([contar('educacao', true), contar('educacao', false)]).toEqual([6, 3])
    expect(contar('pensao', true)).toBe(1)
  })
})

describe('desempenho', () => {
  it('recalcula o efeito de cada uma de 200 despesas em menos de 100 ms (RF-07)', () => {
    const despesas = Array.from({ length: 200 }, (_, i) =>
      despesa({ tipo: i % 2 ? 'dentista' : 'exames', valor_centavos: 10_000 + i }),
    )
    const dados = declaracao({ despesas })

    const inicio = performance.now()
    const base = calcularAjusteAnual(montarEntrada(dados)).impostoDevido
    for (let i = 0; i < despesas.length; i++) {
      const semEla = { ...dados, despesas: despesas.filter((_, j) => j !== i) }
      expect(calcularAjusteAnual(montarEntrada(semEla)).impostoDevido).toBeGreaterThanOrEqual(base)
    }

    expect(performance.now() - inicio).toBeLessThan(100)
  })
})
