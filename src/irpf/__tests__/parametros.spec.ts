import { describe, expect, it } from 'vitest'

import { mulDiv } from '@/irpf/centavos'
import { impostoPelaTabela, reducaoDaLei } from '@/irpf/imposto'
import { PARAMETROS_2026, type FaixaIr } from '@/irpf'

// Os valores e o erro de ano sem arquivo estão em src/irpf/parametros/parametros.test.ts.
// Aqui ficam as conferências de consistência entre as tabelas.
describe('PARAMETROS_2026', () => {
  // Com a parcela certa, as duas faixas vizinhas dão o mesmo imposto no limite entre elas
  // (até 1 centavo, porque a parcela oficial é arredondada).
  const tabelas: [string, readonly FaixaIr[]][] = [
    ['anual', PARAMETROS_2026.tabelaAnual],
    ['mensal', PARAMETROS_2026.mensal.tabela],
  ]

  it.each(tabelas)('tabela %s sem salto de imposto nos limites das faixas', (_, tabela) => {
    tabela.forEach((faixa, i) => {
      const proxima = tabela[i + 1]
      if (!proxima) return
      const impostoNaFaixa = (f: FaixaIr) => mulDiv(faixa.ate, f.aliquotaBp, 10_000) - f.parcela

      expect(Math.abs(impostoNaFaixa(faixa) - impostoNaFaixa(proxima))).toBeLessThanOrEqual(1)
    })
  })

  it('os limites anuais e a dedução por dependente são 12 vezes os mensais', () => {
    const { tabelaAnual, mensal, dependente } = PARAMETROS_2026

    expect(tabelaAnual.map((faixa) => faixa.ate)).toEqual(mensal.tabela.map((f) => 12 * f.ate))
    expect(dependente).toBe(12 * mensal.dependente)
  })

  it('a redução máxima zera o imposto do simplificado em 60.000 por ano e 5.000 por mês', () => {
    const { tabelaAnual, reducaoAnual, simplificado, mensal } = PARAMETROS_2026
    const baseAnual =
      reducaoAnual.zeroAte - mulDiv(reducaoAnual.zeroAte, simplificado.percentual, 100)
    const baseMensal = mensal.reducao.zeroAte - mensal.descontoSimplificado

    expect(impostoPelaTabela(baseAnual, tabelaAnual).imposto).toBe(reducaoAnual.maxima)
    expect(impostoPelaTabela(baseMensal, mensal.tabela).imposto).toBe(mensal.reducao.maxima)
  })

  it('a redução parcial chega a zero no fim da faixa (88.200 por ano, 7.350 por mês)', () => {
    const { reducaoAnual, mensal } = PARAMETROS_2026

    expect(reducaoDaLei(reducaoAnual.parcialAte, reducaoAnual)).toBe(1)
    expect(reducaoDaLei(reducaoAnual.parcialAte + 1, reducaoAnual)).toBe(0)
    expect(reducaoDaLei(mensal.reducao.parcialAte, mensal.reducao)).toBe(0)
  })
})
