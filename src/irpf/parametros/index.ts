import { PARAMETROS_2026 } from './2026'
import type { ParametrosIrpf } from './tipos'

const PARAMETROS_POR_ANO = new Map<number, ParametrosIrpf>([[2026, PARAMETROS_2026]])

export const parametros = (ano: number): ParametrosIrpf => {
  const encontrados = PARAMETROS_POR_ANO.get(ano)
  if (!encontrados) throw new Error(`Parâmetros do ano-calendário ${ano} não cadastrados`)
  return encontrados
}

export { PARAMETROS_2026 }
export type { FaixaInss, FaixaIr, ParametrosIrpf, RegraReducao } from './tipos'
