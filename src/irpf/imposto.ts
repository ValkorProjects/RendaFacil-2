import { mulDiv } from './centavos'
import type { FaixaIr, RegraReducao } from './parametros'

// Imposto pela tabela progressiva: base × alíquota da faixa − parcela a deduzir. A faixa é a
// primeira linha com base ≤ "até".
export const impostoPelaTabela = (base: number, tabela: readonly FaixaIr[]) => {
  const faixa = tabela.find(({ ate }) => base <= ate)
  if (!faixa) throw new RangeError(`Base ${base} acima da última faixa da tabela`)

  return {
    aliquotaBp: faixa.aliquotaBp,
    imposto: Math.max(0, mulDiv(base, faixa.aliquotaBp, 10_000) - faixa.parcela),
  }
}

// Teto da redução da Lei 15.270/2025. Depende só do rendimento bruto (do ano ou do mês), nunca da
// base: deduções não mudam a redução. Quem aplica deve limitá-la ao imposto pela tabela.
export const reducaoDaLei = (rendimento: number, regra: RegraReducao): number => {
  if (rendimento <= regra.zeroAte) return regra.maxima
  if (rendimento > regra.parcialAte) return 0
  return Math.max(0, regra.constante - mulDiv(rendimento, regra.fatorMilionesimos, 1_000_000))
}
