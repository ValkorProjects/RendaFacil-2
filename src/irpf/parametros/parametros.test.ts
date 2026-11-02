import { describe, expect, it } from 'vitest'
import { parametros } from './index'

describe('parametros', () => {
  it('retorna os parâmetros oficiais de 2026', () => {
    const P = parametros(2026)

    expect(P.anoCalendario).toBe(2026)
    expect(P.tabelaAnual).toEqual([
      { ate: 2_914_560, aliquotaBp: 0, parcela: 0 },
      { ate: 3_391_980, aliquotaBp: 750, parcela: 218_592 },
      { ate: 4_501_260, aliquotaBp: 1500, parcela: 472_991 },
      { ate: 5_597_616, aliquotaBp: 2250, parcela: 810_585 },
      { ate: Infinity, aliquotaBp: 2750, parcela: 1_090_466 },
    ])
    expect(P.reducaoAnual).toEqual({
      zeroAte: 6_000_000,
      maxima: 269_415,
      parcialAte: 8_820_000,
      constante: 842_973,
      fatorMilionesimos: 95_575,
    })
    expect(P.dependente).toBe(227_508)
    expect(P.limiteEducacaoPorPessoa).toBe(356_150)
    expect(P.simplificado).toEqual({ percentual: 20, teto: 1_764_000 })
    expect(P.tetoPrevidenciaMensal).toBe(98_809)
  })

  it('lança erro para ano não cadastrado (2027)', () => {
    expect(() => parametros(2027)).toThrow(
      'Parâmetros do ano-calendário 2027 não cadastrados.',
    )
  })
})