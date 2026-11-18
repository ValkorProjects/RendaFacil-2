import { describe, expect, it } from 'vitest'
import { greeting } from '@/utils/profile'

describe('saudação do cabeçalho (RF-09)', () => {
  it('usa só o primeiro nome', () => {
    expect(greeting('Ana Souza')).toBe('Olá, Ana')
    expect(greeting('  Maria   Aparecida da Silva ')).toBe('Olá, Maria')
  })

  it('sem nome, cumprimenta sem vírgula', () => {
    expect(greeting('')).toBe('Olá!')
    expect(greeting('   ')).toBe('Olá!')
  })
})
