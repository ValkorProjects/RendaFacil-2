import { parametros } from './parametros'
import type { ParametrosIrpf } from './parametros'

export type Fonte = {
  rendimentos: number
  previdencia: number
  irrf: number
}

export type DespesaSaude = {
  valor: number
  reembolso: number
  dedutivel: boolean
}

export type DespesaEducacao = {
  pessoa: string
  valor: number
  dedutivel: boolean
}

export type Entrada = {
  fontes: Fonte[]
  dependentes: number
  pensoes: number
  saude: DespesaSaude[]
  educacao: DespesaEducacao[]
}

export type Modelo = {
  deducoes: number
  base: number
  aliquotaBp: number
  impostoTabela: number
  reducao: number
  impostoDevido: number
}

export type Resultado = {
  rendimentos: number
  irrfRetido: number
  totalSaude: number
  totalEducacao: number
  completo: Modelo
  simplificado: Modelo
  modelo: 'completo' | 'simplificado'
  impostoDevido: number
  resultado: number
  faltaParaCompleto: number
}

const mulDiv = (a: number, b: number, divisor: number) =>
  Math.floor((a * b + Math.floor(divisor / 2)) / divisor)

const valorNaoNegativo = (valor: number) => Math.max(0, Math.trunc(valor))

const somaFonte = (fontes: Fonte[], campo: keyof Fonte) =>
  fontes.reduce((total, fonte) => total + valorNaoNegativo(fonte[campo]), 0)

const calcularReducao = (rendimentos: number, P: ParametrosIrpf) => {
  if (rendimentos <= P.reducaoAnual.zeroAte) return P.reducaoAnual.maxima
  if (rendimentos > P.reducaoAnual.parcialAte) return 0

  return Math.max(
    0,
    P.reducaoAnual.constante -
      mulDiv(rendimentos, P.reducaoAnual.fatorMilionesimos, 1_000_000),
  )
}

const calcularModelo = (rendimentos: number, deducoes: number, P: ParametrosIrpf): Modelo => {
  const base = Math.max(0, rendimentos - deducoes)
  const faixa = P.tabelaAnual.find(({ ate }) => base <= ate)

  if (!faixa) {
    return {
      deducoes,
      base,
      aliquotaBp: 0,
      impostoTabela: 0,
      reducao: 0,
      impostoDevido: 0,
    }
  }

  const impostoTabela = Math.max(0, mulDiv(base, faixa.aliquotaBp, 10_000) - faixa.parcela)
  const reducao = Math.min(calcularReducao(rendimentos, P), impostoTabela)

  return {
    deducoes,
    base,
    aliquotaBp: faixa.aliquotaBp,
    impostoTabela,
    reducao,
    impostoDevido: impostoTabela - reducao,
  }
}

const calcularEducacao = (despesas: DespesaEducacao[], limitePorPessoa: number) => {
  const valoresPorPessoa = new Map<string, number>()

  for (const despesa of despesas) {
    if (!despesa.dedutivel) continue

    const valor = valorNaoNegativo(despesa.valor)
    valoresPorPessoa.set(despesa.pessoa, (valoresPorPessoa.get(despesa.pessoa) ?? 0) + valor)
  }

  return [...valoresPorPessoa.values()].reduce(
    (total, valor) => total + Math.min(limitePorPessoa, valor),
    0,
  )
}

export function calcularAjusteAnual(
  entrada: Entrada,
  P: ParametrosIrpf = parametros(2026),
): Resultado {
  const rendimentos = somaFonte(entrada.fontes, 'rendimentos')
  const previdencia = somaFonte(entrada.fontes, 'previdencia')
  const irrfRetido = somaFonte(entrada.fontes, 'irrf')
  const dependentes = valorNaoNegativo(entrada.dependentes)
  const pensoes = valorNaoNegativo(entrada.pensoes)
  const totalSaude = entrada.saude.reduce(
    (total, despesa) =>
      total +
      (despesa.dedutivel
        ? Math.max(0, valorNaoNegativo(despesa.valor) - valorNaoNegativo(despesa.reembolso))
        : 0),
    0,
  )
  const totalEducacao = calcularEducacao(entrada.educacao, P.limiteEducacaoPorPessoa)
  const deducoesCompleto =
    previdencia +
    P.dependente * dependentes +
    pensoes +
    totalSaude +
    totalEducacao
  const deducoesSimplificado = Math.min(
    mulDiv(rendimentos, P.simplificado.percentual, 100),
    P.simplificado.teto,
  )
  const completo = calcularModelo(rendimentos, deducoesCompleto, P)
  const simplificado = calcularModelo(rendimentos, deducoesSimplificado, P)
  const modelo = completo.impostoDevido < simplificado.impostoDevido ? 'completo' : 'simplificado'
  const impostoDevido = modelo === 'completo' ? completo.impostoDevido : simplificado.impostoDevido

  return {
    rendimentos,
    irrfRetido,
    totalSaude,
    totalEducacao,
    completo,
    simplificado,
    modelo,
    impostoDevido,
    resultado: irrfRetido - impostoDevido,
    faltaParaCompleto: Math.max(0, deducoesSimplificado - deducoesCompleto),
  }
}
