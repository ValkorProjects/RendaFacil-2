import { describe, expect, it } from 'vitest'

import {
  calcularEfeitos,
  previaEfeito,
  reais,
  type DadosDeclaracao,
  type RegistroDependente,
  type RegistroDespesa,
  type RegistroFonte,
} from '@/irpf'

// Efeito de cada despesa no imposto (RF-07, #8). Casos F3, F5 e F6 do RF-08, a partir das linhas
// do banco. Valores em centavos.

const fonte = (
  rendimentos_centavos: number,
  previdencia_centavos: number,
  irrf_centavos: number,
): RegistroFonte => ({
  dependente_id: null,
  rendimentos_centavos,
  previdencia_centavos,
  irrf_centavos,
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
const CAIO_NA_DECLARACAO_DO_PAI: RegistroDependente = { id: 'caio', em_outra_declaracao: true }

const PENSAO = despesa({
  categoria: 'pensao',
  tipo: 'pensao_alimenticia',
  beneficiario: 'outra',
  valor_centavos: 960_000,
  base_legal_ok: true,
})
const FACULDADE = despesa({ categoria: 'educacao', tipo: 'graduacao', valor_centavos: 600_000 })

// F5: F1 (12 × 6.500,00, 2 dependentes, pensão de 800,00/mês) com saúde e educação
const F5: DadosDeclaracao = {
  fontes: [fonte(7_800_000, 853_812, 298_104)],
  dependentes: [LIA, TEO],
  despesas: [
    PENSAO,
    despesa({ tipo: 'plano_saude', valor_centavos: 480_000 }),
    despesa({ tipo: 'consulta_medica', valor_centavos: 30_000, reembolso_centavos: 10_000 }),
    despesa({ tipo: 'remedio_farmacia', valor_centavos: 50_000 }),
    FACULDADE,
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
}

// F6: 12 × 6.000,00, sem deduções, com uma consulta de 2.000,00
const F6: DadosDeclaracao = {
  fontes: [fonte(7_200_000, 769_812, 462_120)],
  dependentes: [],
  despesas: [despesa({ valor_centavos: 200_000 })],
}

// F3: 12 × 5.000,00, imposto zero no simplificado
const F3 = (despesas: RegistroDespesa[]): DadosDeclaracao => ({
  fontes: [fonte(6_000_000, 601_812, 0)],
  dependentes: [LIA, CAIO_NA_DECLARACAO_DO_PAI],
  despesas,
})

describe('calcularEfeitos · critérios do RF-07', () => {
  const f5 = calcularEfeitos(F5)

  it('F5: faculdade 781,67; plano 1.060,33; consulta 30,00; escola 430,33', () => {
    const efeitos = f5.despesas.map((item) => item.efeito)

    expect(efeitos[1]).toBe(106_033) // plano
    expect(efeitos[2]).toBe(3_000) // consulta com reembolso
    expect(efeitos[4]).toBe(78_167) // faculdade
    expect(efeitos[5]).toBe(43_033) // escola
  })

  it('F5: efeito total de 2.356,67, maior que a soma dos efeitos individuais', () => {
    expect(f5.efeitoTotal).toBe(235_667)
    expect(106_033 + 3_000 + 78_167 + 43_033).toBe(230_233)
  })

  it('F6: efeito 0,00 e "Faltam R$ 4.701,88 em deduções"', () => {
    const [consulta] = calcularEfeitos(F6).despesas

    expect(consulta).toMatchObject({ efeito: 0, situacao: 'simplificado_vence' })
    expect(consulta?.mensagens).toEqual([
      'Não muda o imposto agora: o desconto simplificado é maior. Faltam R$ 4.701,88 em deduções.',
    ])
  })

  it('F5: barra de uso do limite de educação para cada pessoa com despesa de educação', () => {
    expect(f5.educacaoPorPessoa).toEqual([
      { pessoa: 'titular', total: 600_000, uso: 356_150, restante: 0, limite: 356_150 },
      { pessoa: 'lia', total: 200_000, uso: 200_000, restante: 156_150, limite: 356_150 },
    ])
  })

  it('recalcula os efeitos de 200 despesas em menos de 100 ms', () => {
    const tipos: Partial<RegistroDespesa>[] = [
      { tipo: 'consulta_medica' },
      { tipo: 'remedio_farmacia' },
      { tipo: 'dentista', beneficiario: 'dependente', dependente_id: 'lia' },
      {
        categoria: 'educacao',
        tipo: 'ensino_medio',
        beneficiario: 'dependente',
        dependente_id: 'teo',
      },
      { categoria: 'educacao', tipo: 'graduacao' },
      { tipo: 'exames', reembolso_centavos: 5_000 },
      { tipo: 'psicologo', beneficiario: 'outra' },
      { tipo: 'hospital' },
    ]
    const despesas = Array.from({ length: 200 }, (_, i) =>
      despesa({ ...tipos[i % tipos.length], valor_centavos: 10_000 + i * 137 }),
    )
    const dados: DadosDeclaracao = { ...F5, despesas: [PENSAO, ...despesas.slice(1)] }

    calcularEfeitos(dados) // aquece o JIT
    const inicio = performance.now()
    const efeitos = calcularEfeitos(dados)
    const duracao = performance.now() - inicio

    expect(efeitos.despesas).toHaveLength(200)
    expect(duracao).toBeLessThan(100)
  })
})

describe('calcularEfeitos · mensagens', () => {
  const f5 = calcularEfeitos(F5)

  it('efeito > 0: "Reduz o imposto em R$ X"', () => {
    expect(f5.despesas[1]).toMatchObject({
      situacao: 'reduz',
      mensagens: ['Reduz o imposto em R$ 1.060,33'],
    })
  })

  it('tipo não dedutível: "Não deduz", com o motivo', () => {
    expect(f5.despesas[3]).toMatchObject({
      situacao: 'nao_deduz',
      efeito: 0,
      avaliacao: { deduz: false, motivo: 'tipo_nao_dedutivel' },
      mensagens: ['Não deduz: remédio de farmácia (fora da conta do hospital)'],
    })
    expect(f5.despesas[6]?.mensagens).toEqual(['Não deduz: curso de idiomas'])
  })

  it('educação acima do limite: "Deduz até o limite: R$ Z deste valor não conta"', () => {
    expect(f5.despesas[4]).toMatchObject({
      situacao: 'reduz',
      foraDoLimite: 243_850,
      mensagens: [
        'Reduz o imposto em R$ 781,67',
        'Deduz até o limite: R$ 2.438,50 deste valor não conta',
      ],
    })
    expect(f5.despesas[5]?.foraDoLimite).toBe(0)
  })

  it('educação toda acima do limite, com o completo vencendo: não muda o imposto', () => {
    const outraFaculdade = despesa({
      categoria: 'educacao',
      tipo: 'pos_graduacao',
      valor_centavos: 100_000,
    })
    const efeitos = calcularEfeitos({ ...F5, despesas: [...F5.despesas, outraFaculdade] })

    expect(efeitos.resultado.modelo).toBe('completo')
    expect(efeitos.despesas.at(-1)).toMatchObject({
      situacao: 'sem_efeito',
      efeito: 0,
      foraDoLimite: 100_000,
      mensagens: [
        'Não muda o imposto agora',
        'Deduz até o limite: R$ 1.000,00 deste valor não conta',
      ],
    })
  })

  it('beneficiário "outra pessoa": "Não deduz: a despesa precisa ser sua ou de um dependente"', () => {
    const [item] = calcularEfeitos(F3([despesa({ beneficiario: 'outra' })])).despesas

    expect(item?.mensagens).toEqual(['Não deduz: a despesa precisa ser sua ou de um dependente'])
  })

  it('dependente na declaração de outra pessoa: não deduz, com motivo próprio', () => {
    const [item] = calcularEfeitos(
      F3([despesa({ beneficiario: 'dependente', dependente_id: 'caio' })]),
    ).despesas

    expect(item).toMatchObject({
      avaliacao: { deduz: false, motivo: 'beneficiario_invalido' },
      mensagens: ['Não deduz: este dependente está na declaração de outra pessoa'],
    })
  })

  it('reembolso maior ou igual ao valor: "Reembolsado: não deduz"', () => {
    const [item] = calcularEfeitos(F3([despesa({ reembolso_centavos: 30_000 })])).despesas

    expect(item?.mensagens).toEqual(['Reembolsado: não deduz'])
  })

  it('pensão sem base legal confirmada: não deduz', () => {
    const [item] = calcularEfeitos(F3([{ ...PENSAO, base_legal_ok: false }])).despesas

    expect(item).toMatchObject({ situacao: 'nao_deduz', avaliacao: { motivo: 'sem_base_legal' } })
  })

  it('efeito = 0 e imposto já zero: "Seu imposto já está zerado"', () => {
    const efeitos = calcularEfeitos(F3([despesa({ valor_centavos: 100_000 })]))

    expect(efeitos.resultado.impostoDevido).toBe(0)
    expect(efeitos.despesas[0]).toMatchObject({
      situacao: 'imposto_zerado',
      efeito: 0,
      mensagens: ['Seu imposto já está zerado'],
    })
  })

  it('a pensão também tem efeito, mas fica fora do efeito total', () => {
    expect(f5.despesas[0]?.situacao).toBe('reduz')
    expect(f5.despesas[0]?.efeito).toBeGreaterThan(0)
    expect(calcularEfeitos({ ...F5, despesas: [PENSAO] }).efeitoTotal).toBe(0)
  })
})

describe('calcularEfeitos · barra de educação', () => {
  it('mostra a pessoa com educação só não dedutível (uso zero) e ignora quem não é válido', () => {
    const efeitos = calcularEfeitos(
      F3([
        despesa({
          categoria: 'educacao',
          tipo: 'curso_idiomas',
          beneficiario: 'dependente',
          dependente_id: 'lia',
          valor_centavos: 120_000,
        }),
        despesa({ categoria: 'educacao', tipo: 'graduacao', beneficiario: 'outra' }),
        despesa({
          categoria: 'educacao',
          tipo: 'ensino_medio',
          beneficiario: 'dependente',
          dependente_id: 'caio',
        }),
      ]),
    )

    expect(efeitos.educacaoPorPessoa).toEqual([
      { pessoa: 'lia', total: 0, uso: 0, restante: 356_150, limite: 356_150 },
    ])
  })

  it('sem despesa de educação, não há barra', () => {
    expect(calcularEfeitos(F6).educacaoPorPessoa).toEqual([])
  })
})

describe('previaEfeito', () => {
  it('dá o mesmo efeito da despesa já salva (F5, faculdade)', () => {
    const semFaculdade = { ...F5, despesas: F5.despesas.filter((item) => item !== FACULDADE) }

    expect(previaEfeito(semFaculdade, FACULDADE)).toMatchObject({
      efeito: 78_167,
      mensagens: [
        'Reduz o imposto em R$ 781,67',
        'Deduz até o limite: R$ 2.438,50 deste valor não conta',
      ],
    })
  })

  it('acompanha o valor enquanto ele é digitado', () => {
    const efeitoCom = (valor_centavos: number) =>
      previaEfeito(F5, despesa({ valor_centavos })).efeito

    expect(efeitoCom(0)).toBe(0)
    expect(efeitoCom(10_000)).toBeLessThan(efeitoCom(100_000))
  })
})

describe('reais', () => {
  it.each([
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [470_188, 'R$ 4.701,88'],
    [123_456_789, 'R$ 1.234.567,89'],
    [-38_337, '-R$ 383,37'],
  ])('%i centavos → %s', (centavos, texto) => {
    expect(reais(centavos)).toBe(texto)
  })
})
