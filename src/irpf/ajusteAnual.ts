import { exigirInteiroNaoNegativo, mulDiv, somar } from './centavos'
import { impostoPelaTabela, reducaoDaLei } from './imposto'
import { parametros, type FaixaIr, type ParametrosIrpf } from './parametros'

// Todos os valores em centavos.

// Números de um informe de rendimentos: quadro 3, linhas 01, 02 e 05. O 13º e a PLR têm
// tributação exclusiva e ficam fora.
export type Fonte = {
  rendimentos: number
  previdencia: number
  irrf: number
}

// dedutivel = tipo dedutível e beneficiário válido (titular ou dependente)
export type DespesaSaude = {
  valor: number
  reembolso: number
  dedutivel: boolean
}

// `pessoa` identifica de quem é a despesa, porque o limite de educação é por pessoa
export type DespesaEducacao = {
  pessoa: string
  valor: number
  dedutivel: boolean
}

export type Entrada = {
  fontes: readonly Fonte[] // do titular e dos dependentes
  dependentes: number // quantidade válida (RF-11)
  pensoes: number // soma das pensões válidas (RF-13)
  saude: readonly DespesaSaude[]
  educacao: readonly DespesaEducacao[]
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
  // deduções do modelo completo, por tipo
  totalPrevidencia: number
  deducaoDependentes: number
  totalPensoes: number
  totalSaude: number
  totalEducacao: number
  completo: Modelo
  simplificado: Modelo
  modelo: 'completo' | 'simplificado'
  impostoDevido: number
  resultado: number // > 0 restituição · < 0 imposto a pagar · 0 sem saldo
  faltaParaCompleto: number // deduções que faltam para o completo valer a pena
}

// Valor negativo, fracionário ou NaN para a conta com um RangeError que diz o campo, em vez de
// virar zero em silêncio: um NaN nas pensões, por exemplo, zeraria o imposto do modelo completo.
const validarEntrada = (entrada: Entrada) => {
  entrada.fontes.forEach((fonte, i) => {
    exigirInteiroNaoNegativo(fonte.rendimentos, `fontes[${i}].rendimentos`)
    exigirInteiroNaoNegativo(fonte.previdencia, `fontes[${i}].previdencia`)
    exigirInteiroNaoNegativo(fonte.irrf, `fontes[${i}].irrf`)
  })
  exigirInteiroNaoNegativo(entrada.dependentes, 'dependentes')
  exigirInteiroNaoNegativo(entrada.pensoes, 'pensoes')
  entrada.saude.forEach((despesa, i) => {
    exigirInteiroNaoNegativo(despesa.valor, `saude[${i}].valor`)
    exigirInteiroNaoNegativo(despesa.reembolso, `saude[${i}].reembolso`)
  })
  entrada.educacao.forEach((despesa, i) => {
    exigirInteiroNaoNegativo(despesa.valor, `educacao[${i}].valor`)
  })
}

const calcularEducacao = (despesas: readonly DespesaEducacao[], limitePorPessoa: number) => {
  const valoresPorPessoa = new Map<string, number>()
  for (const { pessoa, valor, dedutivel } of despesas) {
    if (dedutivel) valoresPorPessoa.set(pessoa, (valoresPorPessoa.get(pessoa) ?? 0) + valor)
  }
  return somar([...valoresPorPessoa.values()], (total) => Math.min(limitePorPessoa, total))
}

const calcularModelo = (
  rendimentos: number,
  deducoes: number,
  reducaoLei: number,
  tabela: readonly FaixaIr[],
): Modelo => {
  const base = Math.max(0, rendimentos - deducoes)
  const { aliquotaBp, imposto: impostoTabela } = impostoPelaTabela(base, tabela)
  const reducao = Math.min(reducaoLei, impostoTabela)
  return {
    deducoes,
    base,
    aliquotaBp,
    impostoTabela,
    reducao,
    impostoDevido: impostoTabela - reducao,
  }
}

// Ajuste anual (RF-06): calcula os dois modelos e fica com o de menor imposto. Função pura, sem
// banco nem tela; devolve os intermediários para a tela explicar a conta.
export function calcularAjusteAnual(
  entrada: Entrada,
  P: ParametrosIrpf = parametros(2026),
): Resultado {
  validarEntrada(entrada)

  const rendimentos = somar(entrada.fontes, (fonte) => fonte.rendimentos)
  const totalPrevidencia = somar(entrada.fontes, (fonte) => fonte.previdencia)
  const irrfRetido = somar(entrada.fontes, (fonte) => fonte.irrf)

  const totalSaude = somar(
    entrada.saude.filter((despesa) => despesa.dedutivel),
    (despesa) => Math.max(0, despesa.valor - despesa.reembolso),
  )
  const totalEducacao = calcularEducacao(entrada.educacao, P.limiteEducacaoPorPessoa)
  const deducaoDependentes = entrada.dependentes * P.dependente

  // A redução usa o rendimento bruto do ano, e não a base: é a mesma nos dois modelos.
  const reducaoLei = reducaoDaLei(rendimentos, P.reducaoAnual)
  const completo = calcularModelo(
    rendimentos,
    totalPrevidencia + deducaoDependentes + entrada.pensoes + totalSaude + totalEducacao,
    reducaoLei,
    P.tabelaAnual,
  )
  const simplificado = calcularModelo(
    rendimentos,
    Math.min(mulDiv(rendimentos, P.simplificado.percentual, 100), P.simplificado.teto),
    reducaoLei,
    P.tabelaAnual,
  )

  // Em empate, fica o simplificado.
  const modelo = completo.impostoDevido < simplificado.impostoDevido ? 'completo' : 'simplificado'
  const impostoDevido = modelo === 'completo' ? completo.impostoDevido : simplificado.impostoDevido

  return {
    rendimentos,
    irrfRetido,
    totalPrevidencia,
    deducaoDependentes,
    totalPensoes: entrada.pensoes,
    totalSaude,
    totalEducacao,
    completo,
    simplificado,
    modelo,
    impostoDevido,
    resultado: irrfRetido - impostoDevido,
    faltaParaCompleto: Math.max(0, simplificado.deducoes - completo.deducoes),
  }
}
