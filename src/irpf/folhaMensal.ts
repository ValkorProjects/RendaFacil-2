import type { Fonte } from './ajusteAnual'
import { dividirArredondando, exigirInteiroNaoNegativo } from './centavos'
import { impostoPelaTabela, reducaoDaLei } from './imposto'
import { PARAMETROS_2026, type FaixaInss, type ParametrosIrpf } from './parametros'

// Todos os valores em centavos.

export interface EntradaMensal {
  bruto: number // salário bruto do mês
  dependentes: number
  pensao: number // pensão alimentícia descontada no mês
}

export interface ResultadoMensal {
  bruto: number
  inss: number
  deducoes: number // INSS + dependentes + pensão
  usouSimplificado: boolean // o desconto simplificado mensal foi maior que as deduções
  deducaoUsada: number // a maior entre as deduções e o desconto simplificado
  base: number
  aliquotaBp: number
  impostoTabela: number
  reducao: number
  irrf: number
}

// INSS do empregado: cada faixa paga a sua alíquota sobre a parte do salário dentro dela, e a
// soma é arredondada só no total. O que passa do teto não paga.
export const calcularInss = (bruto: number, faixas: readonly FaixaInss[]): number => {
  let anterior = 0
  let soma = 0
  for (const { ate, aliquotaBp } of faixas) {
    if (bruto > anterior) soma += (Math.min(bruto, ate) - anterior) * aliquotaBp
    anterior = ate
  }
  return dividirArredondando(soma, 10_000)
}

// IRRF descontado no holerite de um mês comum de empregado CLT, sem 13º, férias nem PLR.
export function calcularFolhaMensal(
  entrada: EntradaMensal,
  p: ParametrosIrpf = PARAMETROS_2026,
): ResultadoMensal {
  exigirInteiroNaoNegativo(entrada.bruto, 'bruto')
  exigirInteiroNaoNegativo(entrada.dependentes, 'dependentes')
  exigirInteiroNaoNegativo(entrada.pensao, 'pensao')

  const { bruto } = entrada
  const inss = calcularInss(bruto, p.mensal.inss)
  const deducoes = inss + entrada.dependentes * p.mensal.dependente + entrada.pensao
  const deducaoUsada = Math.max(deducoes, p.mensal.descontoSimplificado)
  const base = Math.max(0, bruto - deducaoUsada)
  const { aliquotaBp, imposto: impostoTabela } = impostoPelaTabela(base, p.mensal.tabela)
  // A redução usa o salário bruto, e não a base: dependentes e pensão não a mudam.
  const reducao = Math.min(reducaoDaLei(bruto, p.mensal.reducao), impostoTabela)

  return {
    bruto,
    inss,
    deducoes,
    usouSimplificado: deducoes < p.mensal.descontoSimplificado,
    deducaoUsada,
    base,
    aliquotaBp,
    impostoTabela,
    reducao,
    irrf: impostoTabela - reducao,
  }
}

// Estima o informe de rendimentos de uma fonte que pagou o mesmo salário durante `meses` meses,
// para usar no ajuste anual antes de o informe chegar. Não considera férias: o terço de férias
// entra nos rendimentos do informe e deixa a estimativa um pouco abaixo do real.
export function estimarFonteAnual(
  entrada: EntradaMensal,
  meses = 12,
  p: ParametrosIrpf = PARAMETROS_2026,
): Fonte {
  if (!Number.isInteger(meses) || meses < 1 || meses > 12) {
    throw new RangeError(`meses deve ser um inteiro de 1 a 12 (recebido: ${meses})`)
  }
  const folha = calcularFolhaMensal(entrada, p)
  return {
    rendimentos: folha.bruto * meses,
    previdencia: folha.inss * meses,
    irrf: folha.irrf * meses,
  }
}
