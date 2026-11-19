import { describe, expect, it } from 'vitest'
import { wholeValueSelected } from '@/directives/caretAtEnd'

describe('cursor dos campos de dinheiro', () => {
  const value = 'R$ 6.500,00'

  it('aceita a seleção do valor inteiro, com ou sem o "R$ "', () => {
    expect(wholeValueSelected(value, 0, value.length)).toBe(true)
    expect(wholeValueSelected(value, 3, value.length)).toBe(true)
  })

  it('não aceita seleção parcial nem cursor parado', () => {
    expect(wholeValueSelected(value, 5, value.length)).toBe(false)
    expect(wholeValueSelected(value, 0, 6)).toBe(false)
    expect(wholeValueSelected(value, 4, 4)).toBe(false)
    expect(wholeValueSelected(value, value.length, value.length)).toBe(false)
  })
})
