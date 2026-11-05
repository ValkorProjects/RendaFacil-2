// Formato do arquivo de parâmetros de um ano-calendário. Dinheiro em centavos e alíquotas em
// pontos-base (750 = 7,5%).

// Linha da tabela progressiva: vale para bases até `ate`, inclusive.
export interface FaixaIr {
  readonly ate: number
  readonly aliquotaBp: number
  readonly parcela: number
}

// Faixa do INSS do empregado: a alíquota incide só sobre a parte do salário dentro da faixa.
export interface FaixaInss {
  readonly ate: number
  readonly aliquotaBp: number
}

// Redução da Lei 15.270/2025. O ajuste anual e a folha mensal usam a mesma forma, com valores
// diferentes: até `zeroAte` a redução vale até `maxima`; até `parcialAte` vale
// `constante − fator × rendimento`; acima disso, zero.
export interface RegraReducao {
  readonly zeroAte: number
  readonly maxima: number
  readonly parcialAte: number
  readonly constante: number
  readonly fatorMilionesimos: number
}

export interface ParametrosIrpf {
  readonly anoCalendario: number
  readonly tabelaAnual: readonly FaixaIr[]
  readonly reducaoAnual: RegraReducao
  readonly dependente: number
  readonly limiteEducacaoPorPessoa: number
  readonly simplificado: { readonly percentual: number; readonly teto: number }
  readonly tetoPrevidenciaMensal: number
  readonly mensal: {
    readonly inss: readonly FaixaInss[]
    readonly tabela: readonly FaixaIr[]
    readonly dependente: number
    readonly descontoSimplificado: number
    readonly reducao: RegraReducao
  }
}
