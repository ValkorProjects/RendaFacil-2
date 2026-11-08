// Motor de cálculo do IRPF: funções puras, com dinheiro em centavos. As fórmulas e as fontes estão
// em docs/calculo-irpf-2026.md.

export { calcularAjusteAnual } from './ajusteAnual'
export type {
  DespesaEducacao,
  DespesaSaude,
  Entrada,
  Fonte,
  Modelo,
  Resultado,
} from './ajusteAnual'

export { calcularFolhaMensal, calcularInss, estimarFonteAnual } from './folhaMensal'
export type { EntradaMensal, ResultadoMensal } from './folhaMensal'

export { TIPOS_DESPESA, tipoDespesa } from './despesas'
export type { CategoriaDespesa, IdTipoDespesa, TipoDespesa } from './despesas'

export { avaliarDespesa, montarEntrada } from './entrada'
export type {
  AvaliacaoDespesa,
  DadosDeclaracao,
  MotivoNaoDeduz,
  RegistroDependente,
  RegistroDespesa,
  RegistroFonte,
} from './entrada'

export { PARAMETROS_2026, parametros } from './parametros'
export type { FaixaInss, FaixaIr, ParametrosIrpf, RegraReducao } from './parametros'
