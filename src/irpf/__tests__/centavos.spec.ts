import { describe, expect, it } from 'vitest'

import { dividirArredondando, exigirInteiroNaoNegativo, mulDiv } from '@/irpf/centavos'

describe('mulDiv', () => {
  it.each([
    [1, 49, 100, 0],
    [1, 50, 100, 1], // metade sobe
    [3, 1, 2, 2],
    [5_531_172, 2250, 10_000, 1_244_514], // 55.311,72 × 22,5% = 12.445,137
    [8_820_000, 95_575, 1_000_000, 842_972], // 842.971,5 → 842.972
    [6_000_001, 20, 100, 1_200_000],
  ])('%i × %i / %i = %i', (a, b, d, esperado) => {
    expect(mulDiv(a, b, d)).toBe(esperado)
  })

  it('é exato perto do limite dos inteiros seguros', () => {
    const n = Number.MAX_SAFE_INTEGER - 500_000
    const exato = Number((BigInt(n) + 500_000n) / 1_000_000n)

    expect(mulDiv(n, 1, 1_000_000)).toBe(exato)
    expect(dividirArredondando(n, 1_000_000)).toBe(exato)
  })

  it('recusa produtos fora do intervalo seguro', () => {
    expect(() => mulDiv(Number.MAX_SAFE_INTEGER, 2, 10)).toThrow(RangeError)
  })
})

describe('exigirInteiroNaoNegativo', () => {
  it('aceita zero e inteiros positivos', () => {
    expect(() => exigirInteiroNaoNegativo(0, 'x')).not.toThrow()
    expect(() => exigirInteiroNaoNegativo(123, 'x')).not.toThrow()
  })

  it.each([-1, 0.5, Number.NaN, Infinity])('recusa %d', (valor) => {
    expect(() => exigirInteiroNaoNegativo(valor, 'campo')).toThrow('campo')
  })
})
