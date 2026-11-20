import { describe, expect, it } from 'vitest'
import { TABS, tabForRoute } from '@/router/tabs'

describe('barra inferior (RF-09)', () => {
  it('tem as 4 abas do esboço, cada uma com rótulo de texto', () => {
    expect(TABS.map((tab) => tab.label)).toEqual(['Home', 'Rendas', 'Despesas', 'Menu'])
    expect(new Set(TABS.map((tab) => tab.route)).size).toBe(4)
  })

  it('marca a própria aba em cada uma das 4 telas', () => {
    for (const tab of TABS) expect(tabForRoute(tab.route)).toBe(tab.id)
  })

  it('marca o Menu nas telas abertas por ele', () => {
    for (const route of ['user', 'privacy', 'settings', 'info', 'dependents']) {
      expect(tabForRoute(route)).toBe('menu')
    }
  })

  it('não marca nenhuma aba numa rota desconhecida ou sem nome', () => {
    expect(tabForRoute('nao-existe')).toBeNull()
    expect(tabForRoute(undefined)).toBeNull()
    expect(tabForRoute(Symbol('home'))).toBeNull()
  })
})
