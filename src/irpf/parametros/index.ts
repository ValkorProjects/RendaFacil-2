import { PARAMETROS_2026 } from './2026'
import type { ParametrosIrpf } from './tipos'

export function parametros(ano: number): ParametrosIrpf {
  if (ano === 2026) {
    return PARAMETROS_2026
  }
  throw new Error(`Parâmetros do ano-calendário ${ano} não cadastrados.`)
}

export { PARAMETROS_2026 }
export type { FaixaInss, FaixaIr, ParametrosIrpf, RegraReducao } from './tipos'
