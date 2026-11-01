import type { ParametrosIrpf } from './parametros'

const aplicarReducao = (rendimentoTributavel: number, parametros: ParametrosIrpf) => {
  const { reducaoAnual } = parametros

  if (rendimentoTributavel <= reducaoAnual.zeroAte) return reducaoAnual.maxima
  if (rendimentoTributavel > reducaoAnual.parcialAte) return 0

  return Math.max(
    0,
    reducaoAnual.constante -
      (rendimentoTributavel * reducaoAnual.fatorMilionesimos) / 1_000_000,
  )
}

export const calcularImpostoAnual = (
  rendimentoTributavel: number,
  parametros: ParametrosIrpf,
): number => {
  const faixa = parametros.tabelaAnual.find(({ ate }) => rendimentoTributavel <= ate)
  if (!faixa) return 0

  const impostoAntesDaReducao = Math.max(
    0,
    Math.round((rendimentoTributavel * faixa.aliquotaBp) / 10_000) - faixa.parcela,
  )

  return Math.max(0, impostoAntesDaReducao - aplicarReducao(rendimentoTributavel, parametros))
}