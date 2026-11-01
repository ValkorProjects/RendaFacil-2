import { PARAMETROS_2026 } from './2026'
import type { ParametrosIrpf } from './2026'

const PARAMETROS_POR_ANO: Record<number, ParametrosIrpf> = {
  2026: PARAMETROS_2026,
}

export const parametros = (ano: number): ParametrosIrpf => {
  const resultado = PARAMETROS_POR_ANO[ano]

  if (!resultado) throw new Error(`Parâmetros do ano-calendário ${ano} não cadastrados.`)

  return resultado
}

export type { ParametrosIrpf }
