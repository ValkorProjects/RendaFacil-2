import { describe, expect, it } from 'vitest'
import { calcularAjusteAnual, type Entrada } from './ajusteAnual'

const casoF1: Entrada = {
  fontes: [{ rendimentos: 7_800_000, previdencia: 853_812, irrf: 298_104 }],
  dependentes: 2,
  pensoes: 960_000,
  saude: [],
  educacao: [],
}

describe('calcularAjusteAnual', () => {
  it('calcula o caso F1 com os dois modelos', () => {
    const resultado = calcularAjusteAnual(casoF1)

    expect(resultado.completo).toMatchObject({
      deducoes: 2_268_828,
      base: 5_531_172,
      aliquotaBp: 2250,
      impostoTabela: 433_929,
      reducao: 97_488,
      impostoDevido: 336_441,
    })
    expect(resultado.simplificado).toMatchObject({
      deducoes: 1_560_000,
      base: 6_240_000,
      aliquotaBp: 2750,
      impostoTabela: 625_534,
      reducao: 97_488,
      impostoDevido: 528_046,
    })
    expect(resultado.modelo).toBe('completo')
    expect(resultado.impostoDevido).toBe(336_441)
    expect(resultado.resultado).toBe(-38_337)
  })

  it('chooses the simplified model in a tie', () => {
    const entrada: Entrada = {
      fontes: [],
      dependentes: 0,
      pensoes: 0,
      saude: [],
      educacao: [],
    }

    const resultado = calcularAjusteAnual(entrada)

    expect(resultado.completo.impostoDevido).toBe(resultado.simplificado.impostoDevido)
    expect(resultado.modelo).toBe('simplificado')
  })
})
