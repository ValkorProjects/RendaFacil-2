import { PARAMETROS_2026 } from './2026';

export function parametros(ano: number) {
  if (ano === 2026) {
    return PARAMETROS_2026;
  }
  throw new Error(`Parâmetros do ano-calendário ${ano} não cadastrados.`);
}