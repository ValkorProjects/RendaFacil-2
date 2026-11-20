import { describe, expect, it } from 'vitest'

import {
  calcularAjusteAnual,
  calcularFolhaMensal,
  calcularInss,
  estimarFonteAnual,
  PARAMETROS_2026,
} from '@/irpf'

// Folha de pagamento de um mês comum de 2026 (apêndice de docs/calculo-irpf-2026.md). Valores em
// centavos.

const faixasInss = PARAMETROS_2026.mensal.inss

describe('calcularInss', () => {
  it.each([
    [162_100, 12_158], // toda na primeira faixa: 1.621,00 × 7,5% = 121,575
    [400_000, 36_860],
    [500_000, 50_151],
    [650_000, 71_151],
    [847_555, 98_809], // no teto
    [2_000_000, 98_809], // acima do teto, não paga mais
  ])('bruto %i → INSS %i', (bruto, inss) => {
    expect(calcularInss(bruto, faixasInss)).toBe(inss)
  })

  it('o INSS no teto é o tetoPrevidenciaMensal do aviso do RF-12', () => {
    const teto = faixasInss[faixasInss.length - 1]?.ate ?? 0

    expect(calcularInss(teto, faixasInss)).toBe(PARAMETROS_2026.tetoPrevidenciaMensal)
  })
})

describe('calcularFolhaMensal', () => {
  it('6.500 com 2 dependentes e pensão de 800 (exemplo da documentação)', () => {
    expect(calcularFolhaMensal({ bruto: 650_000, dependentes: 2, pensao: 80_000 })).toEqual({
      bruto: 650_000,
      inss: 71_151,
      deducoes: 189_069,
      usouSimplificado: false,
      deducaoUsada: 189_069,
      base: 460_931,
      aliquotaBp: 2250,
      impostoTabela: 36_160,
      reducao: 11_318,
      irrf: 24_842,
    })
  })

  it('confere com o exemplo oficial do Sipec: 5.250 sem dependentes → IRRF 89,53', () => {
    expect(calcularFolhaMensal({ bruto: 525_000, dependentes: 0, pensao: 0 })).toMatchObject({
      usouSimplificado: true,
      base: 464_280,
      impostoTabela: 36_914,
      reducao: 27_961,
      irrf: 8_953,
    })
  })

  // [caso, bruto, dependentes, pensão, simplificado, base, imposto pela tabela, redução, IRRF]
  const exemplos: [string, number, number, number, boolean, number, number, number, number][] = [
    ['5.000 zera o IR', 500_000, 0, 0, true, 439_280, 31_289, 31_289, 0],
    ['5.500 usa o simplificado', 550_000, 0, 0, true, 489_280, 43_679, 24_632, 19_047],
    ['10.000 com 1 dependente', 1_000_000, 1, 0, false, 882_232, 151_741, 0, 151_741],
    ['20.000 para o INSS no teto', 2_000_000, 0, 0, false, 1_901_191, 431_955, 0, 431_955],
    ['salário baixo fica na faixa isenta', 200_000, 0, 0, true, 139_280, 0, 0, 0],
  ]

  it.each(exemplos)(
    '%s',
    (_, bruto, dependentes, pensao, simplificado, base, tabela, reducao, irrf) => {
      expect(calcularFolhaMensal({ bruto, dependentes, pensao })).toMatchObject({
        usouSimplificado: simplificado,
        base,
        impostoTabela: tabela,
        reducao,
        irrf,
      })
    },
  )

  it('dependentes e pensão não mudam a redução, que depende só do bruto', () => {
    const sem = calcularFolhaMensal({ bruto: 650_000, dependentes: 0, pensao: 0 })
    const com = calcularFolhaMensal({ bruto: 650_000, dependentes: 2, pensao: 80_000 })

    expect(com.reducao).toBe(sem.reducao)
    expect(com.irrf).toBeLessThan(sem.irrf)
  })

  it('recusa valores inválidos', () => {
    expect(() => calcularFolhaMensal({ bruto: -1, dependentes: 0, pensao: 0 })).toThrow('bruto')
    expect(() => calcularFolhaMensal({ bruto: 100, dependentes: 0.5, pensao: 0 })).toThrow(
      'dependentes',
    )
  })
})

describe('estimarFonteAnual', () => {
  // As entradas do RF-08 vêm de 12 meses de salário: a folha mensal tem de reproduzi-las.
  // [caso, bruto, dependentes, pensão, rendimentos, previdência, IRRF]
  const fontesDoRf08: [string, number, number, number, number, number, number][] = [
    ['F1', 650_000, 2, 80_000, 7_800_000, 853_812, 298_104],
    ['F2', 600_000, 0, 0, 7_200_000, 769_812, 462_120],
    ['F3', 500_000, 0, 0, 6_000_000, 601_812, 0],
    ['F4 (cada fonte)', 400_000, 0, 0, 4_800_000, 442_320, 0],
    ['F7', 1_000_000, 1, 0, 12_000_000, 1_185_708, 1_820_892],
    ['F8', 650_000, 0, 0, 7_800_000, 853_812, 683_904],
  ]

  it.each(fontesDoRf08)(
    'reproduz a fonte do caso %s',
    (_, bruto, dependentes, pensao, rendimentos, previdencia, irrf) => {
      expect(estimarFonteAnual({ bruto, dependentes, pensao })).toEqual({
        rendimentos,
        previdencia,
        irrf,
      })
    },
  )

  it('aceita menos de 12 meses e recusa valores fora de 1 a 12', () => {
    const salario = { bruto: 650_000, dependentes: 0, pensao: 0 }

    expect(estimarFonteAnual(salario, 6).rendimentos).toBe(3_900_000)
    expect(() => estimarFonteAnual(salario, 0)).toThrow(RangeError)
    expect(() => estimarFonteAnual(salario, 13)).toThrow(RangeError)
  })
})

describe('folha mensal × ajuste anual (caso F1 da documentação)', () => {
  const salario = { bruto: 650_000, dependentes: 2, pensao: 80_000 }
  const folha = calcularFolhaMensal(salario)
  const ajuste = calcularAjusteAnual({
    fontes: [estimarFonteAnual(salario)],
    dependentes: 2,
    pensoes: 12 * salario.pensao,
    saude: [],
    educacao: [],
  })

  it('o ajuste cobra 383,37, mesmo com uma empresa só e salário igual o ano todo', () => {
    expect(ajuste.modelo).toBe('completo')
    expect(ajuste.resultado).toBe(-38_337)
  })

  it('a diferença vem da redução (383,28) e dos arredondamentos da tabela (0,09)', () => {
    const reducaoNoAno = 12 * folha.reducao
    const tabelaNoAno = 12 * folha.impostoTabela

    expect(reducaoNoAno).toBe(135_816)
    expect(ajuste.completo.reducao).toBe(97_488)
    expect(reducaoNoAno - ajuste.completo.reducao).toBe(38_328)
    expect(ajuste.completo.impostoTabela - tabelaNoAno).toBe(9)
  })
})
