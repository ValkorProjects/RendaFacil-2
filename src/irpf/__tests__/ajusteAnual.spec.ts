import { describe, expect, it } from 'vitest'

import { calcularAjusteAnual, PARAMETROS_2026, type Entrada, type Fonte } from '@/irpf'

// Casos de referência do RF-08 (#9), calculados à parte ao centavo. Valores em centavos.

type Linha = [deducoes: number, base: number, tabela: number, reducao: number, devido: number]

const fonte = (rendimentos: number, previdencia: number, irrf: number): Fonte => ({
  rendimentos,
  previdencia,
  irrf,
})

const entrada = (dados: Partial<Entrada>): Entrada => ({
  fontes: [],
  dependentes: 0,
  pensoes: 0,
  saude: [],
  educacao: [],
  ...dados,
})

const comoModelo = ([deducoes, base, impostoTabela, reducao, impostoDevido]: Linha) => ({
  deducoes,
  base,
  impostoTabela,
  reducao,
  impostoDevido,
})

// 12 meses de 6.500,00 com 2 dependentes e pensão de 800,00 por mês (exemplo do esboço)
const F1 = entrada({
  fontes: [fonte(7_800_000, 853_812, 298_104)],
  dependentes: 2,
  pensoes: 960_000,
})
// 12 meses de 6.000,00, sem deduções
const F2 = entrada({ fontes: [fonte(7_200_000, 769_812, 462_120)] })
// 12 meses de 6.500,00, sem dependentes nem pensão
const SALARIO_6500 = fonte(7_800_000, 853_812, 683_904)

const casos: {
  caso: string
  entrada: Entrada
  completo: Linha
  simplificado: Linha
  modelo: 'completo' | 'simplificado'
  resultado: number
  falta: number
}[] = [
  {
    caso: 'F1 · exemplo do esboço',
    entrada: F1,
    completo: [2_268_828, 5_531_172, 433_929, 97_488, 336_441],
    simplificado: [1_560_000, 6_240_000, 625_534, 97_488, 528_046],
    modelo: 'completo',
    resultado: -38_337,
    falta: 0,
  },
  {
    caso: 'F2 · 12 meses de 6.000, sem deduções',
    entrada: F2,
    completo: [769_812, 6_430_188, 677_836, 154_833, 523_003],
    simplificado: [1_440_000, 5_760_000, 493_534, 154_833, 338_701],
    modelo: 'simplificado',
    resultado: 123_419,
    falta: 670_188,
  },
  {
    caso: 'F3 · 12 meses de 5.000',
    entrada: entrada({ fontes: [fonte(6_000_000, 601_812, 0)] }),
    completo: [601_812, 5_398_188, 404_007, 269_415, 134_592],
    simplificado: [1_200_000, 4_800_000, 269_415, 269_415, 0],
    modelo: 'simplificado',
    resultado: 0,
    falta: 598_188,
  },
  {
    caso: 'F4 · duas empresas de 4.000 por mês',
    entrada: entrada({ fontes: [fonte(4_800_000, 442_320, 0), fonte(4_800_000, 442_320, 0)] }),
    completo: [884_640, 8_715_360, 1_306_258, 0, 1_306_258],
    simplificado: [1_764_000, 7_836_000, 1_064_434, 0, 1_064_434],
    modelo: 'simplificado',
    resultado: -1_064_434,
    falta: 879_360,
  },
  {
    caso: 'F5 · F1 com saúde e educação',
    entrada: {
      ...F1,
      saude: [
        { valor: 480_000, reembolso: 0, dedutivel: true }, // plano
        { valor: 30_000, reembolso: 10_000, dedutivel: true }, // consulta com reembolso
        { valor: 50_000, reembolso: 0, dedutivel: false }, // farmácia
      ],
      educacao: [
        { pessoa: 'titular', valor: 600_000, dedutivel: true }, // faculdade
        { pessoa: 'dependente', valor: 200_000, dedutivel: true }, // escola
        { pessoa: 'dependente', valor: 120_000, dedutivel: false }, // inglês
      ],
    },
    completo: [3_324_978, 4_475_022, 198_262, 97_488, 100_774],
    simplificado: [1_560_000, 6_240_000, 625_534, 97_488, 528_046],
    modelo: 'completo',
    resultado: 197_330,
    falta: 0,
  },
  {
    caso: 'F6 · F2 com uma consulta',
    entrada: { ...F2, saude: [{ valor: 200_000, reembolso: 0, dedutivel: true }] },
    completo: [969_812, 6_230_188, 622_836, 154_833, 468_003],
    simplificado: [1_440_000, 5_760_000, 493_534, 154_833, 338_701],
    modelo: 'simplificado',
    resultado: 123_419,
    falta: 470_188,
  },
  {
    caso: 'F7 · 12 meses de 10.000, 1 dependente',
    entrada: entrada({ fontes: [fonte(12_000_000, 1_185_708, 1_820_892)], dependentes: 1 }),
    completo: [1_413_216, 10_586_784, 1_820_900, 0, 1_820_900],
    simplificado: [1_764_000, 10_236_000, 1_724_434, 0, 1_724_434],
    modelo: 'simplificado',
    resultado: 96_458,
    falta: 350_784,
  },
  {
    caso: 'F8 · limite de educação por pessoa',
    entrada: entrada({
      fontes: [SALARIO_6500],
      educacao: [
        { pessoa: 'titular', valor: 400_000, dedutivel: true },
        { pessoa: 'dependente', valor: 400_000, dedutivel: true },
      ],
    }),
    completo: [1_566_112, 6_233_888, 623_853, 97_488, 526_365],
    simplificado: [1_560_000, 6_240_000, 625_534, 97_488, 528_046],
    modelo: 'completo',
    resultado: 157_539,
    falta: 0,
  },
  {
    caso: 'F9 · deduções maiores que a renda (empate)',
    entrada: entrada({ fontes: [fonte(3_000_000, 300_000, 0)], pensoes: 4_000_000 }),
    completo: [4_300_000, 0, 0, 0, 0],
    simplificado: [600_000, 2_400_000, 0, 0, 0],
    modelo: 'simplificado',
    resultado: 0,
    falta: 0,
  },
  {
    caso: 'F10 · reembolso maior que o valor',
    entrada: entrada({
      fontes: [SALARIO_6500],
      saude: [{ valor: 30_000, reembolso: 50_000, dedutivel: true }],
    }),
    completo: [853_812, 6_946_188, 819_736, 97_488, 722_248],
    simplificado: [1_560_000, 6_240_000, 625_534, 97_488, 528_046],
    modelo: 'simplificado',
    resultado: 155_858,
    falta: 706_188,
  },
  {
    caso: 'B1 · logo acima de 60 mil',
    entrada: entrada({ fontes: [fonte(6_000_001, 0, 0)] }),
    completo: [0, 6_000_001, 559_534, 269_523, 290_011],
    simplificado: [1_200_000, 4_800_001, 269_415, 269_415, 0],
    modelo: 'simplificado',
    resultado: 0,
    falta: 1_200_000,
  },
  {
    caso: 'B2 · exatamente 88.200',
    entrada: entrada({ fontes: [fonte(8_820_000, 0, 0)] }),
    completo: [0, 8_820_000, 1_335_034, 1, 1_335_033],
    simplificado: [1_764_000, 7_056_000, 849_934, 1, 849_933],
    modelo: 'simplificado',
    resultado: -849_933,
    falta: 1_764_000,
  },
  {
    caso: 'B3 · logo acima de 88.200',
    entrada: entrada({ fontes: [fonte(8_820_001, 0, 0)] }),
    completo: [0, 8_820_001, 1_335_034, 0, 1_335_034],
    simplificado: [1_764_000, 7_056_001, 849_934, 0, 849_934],
    modelo: 'simplificado',
    resultado: -849_934,
    falta: 1_764_000,
  },
]

describe('calcularAjusteAnual · casos de referência do RF-08', () => {
  it.each(casos)('$caso', ({ entrada, completo, simplificado, modelo, resultado, falta }) => {
    const r = calcularAjusteAnual(entrada)

    expect(r.completo).toMatchObject(comoModelo(completo))
    expect(r.simplificado).toMatchObject(comoModelo(simplificado))
    expect(r.modelo).toBe(modelo)
    expect(r.impostoDevido).toBe(r[modelo].impostoDevido)
    expect(r.resultado).toBe(resultado)
    expect(r.faltaParaCompleto).toBe(falta)
  })

  it('soma saúde e educação dedutíveis (F5, F8 e F10)', () => {
    const porCaso = (prefixo: string) => {
      const caso = casos.find((item) => item.caso.startsWith(prefixo))
      if (!caso) throw new Error(`Caso ${prefixo} não encontrado`)
      return calcularAjusteAnual(caso.entrada)
    }

    expect(porCaso('F5 ')).toMatchObject({ totalSaude: 500_000, totalEducacao: 556_150 })
    expect(porCaso('F8 ').totalEducacao).toBe(712_300)
    expect(porCaso('F10 ').totalSaude).toBe(0)
  })

  it('devolve os intermediários para explicar a conta (F1)', () => {
    expect(calcularAjusteAnual(F1)).toMatchObject({
      rendimentos: 7_800_000,
      irrfRetido: 298_104,
      totalPrevidencia: 853_812,
      deducaoDependentes: 455_016,
      totalPensoes: 960_000,
      completo: { aliquotaBp: 2250 },
      simplificado: { aliquotaBp: 2750 },
    })
  })
})

describe('calcularAjusteAnual · regras', () => {
  it('em empate com imposto, escolhe o simplificado', () => {
    // INSS igual ao desconto simplificado: as duas bases e os dois impostos ficam iguais
    const r = calcularAjusteAnual(entrada({ fontes: [fonte(7_800_000, 1_560_000, 0)] }))

    expect(r.completo.impostoDevido).toBe(r.simplificado.impostoDevido)
    expect(r.completo.impostoDevido).toBeGreaterThan(0)
    expect(r.modelo).toBe('simplificado')
  })

  it('usa os parâmetros recebidos, sem valor de tabela embutido', () => {
    const dependenteEmDobro = { ...PARAMETROS_2026, dependente: 2 * PARAMETROS_2026.dependente }

    expect(calcularAjusteAnual(F1, dependenteEmDobro).completo.deducoes).toBe(2_268_828 + 455_016)
  })

  it('não altera a entrada e devolve sempre o mesmo resultado', () => {
    const copia = structuredClone(F1)
    const primeiro = calcularAjusteAnual(F1)

    expect(calcularAjusteAnual(F1)).toEqual(primeiro)
    expect(F1).toEqual(copia)
  })

  it('aceita entrada vazia', () => {
    const r = calcularAjusteAnual(entrada({}))

    expect(r).toMatchObject({
      rendimentos: 0,
      impostoDevido: 0,
      resultado: 0,
      modelo: 'simplificado',
    })
  })

  it('permite calcular o efeito de uma despesa removendo-a da entrada (RF-07)', () => {
    const f5 = casos.find((item) => item.caso.startsWith('F5 '))?.entrada
    if (!f5) throw new Error('Caso F5 não encontrado')
    const semFaculdade = { ...f5, educacao: f5.educacao.slice(1) }

    const efeito =
      calcularAjusteAnual(semFaculdade).impostoDevido - calcularAjusteAnual(f5).impostoDevido

    expect(efeito).toBe(78_167)
  })

  const invalidos: [string, Partial<Entrada>, string][] = [
    ['negativo', { fontes: [fonte(-1, 0, 0)] }, 'fontes[0].rendimentos'],
    ['fracionário', { fontes: [fonte(100_000, 10.5, 0)] }, 'fontes[0].previdencia'],
    ['NaN', { pensoes: Number.NaN }, 'pensoes'],
    ['dependentes fracionários', { dependentes: 1.5 }, 'dependentes'],
    ['reembolso negativo', { saude: [{ valor: 100, reembolso: -1, dedutivel: true }] }, 'saude[0]'],
    [
      'educação negativa',
      { educacao: [{ pessoa: 'titular', valor: -1, dedutivel: true }] },
      'educacao[0]',
    ],
  ]

  it.each(invalidos)('recusa valor %s', (_, dados, campo) => {
    expect(() => calcularAjusteAnual(entrada(dados))).toThrow(RangeError)
    expect(() => calcularAjusteAnual(entrada(dados))).toThrow(campo)
  })
})
