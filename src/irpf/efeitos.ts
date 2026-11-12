import { calcularAjusteAnual, type Resultado } from './ajusteAnual'
import { tipoDespesa } from './despesas'
import {
  avaliarDespesa,
  montarEntrada,
  type AvaliacaoDespesa,
  type DadosDeclaracao,
  type RegistroDespesa,
} from './entrada'
import { parametros, type ParametrosIrpf } from './parametros'

// Efeito de cada despesa no imposto (RF-07): "vale a pena guardar este recibo?".
//
//   efeito(d)    = devido(todas as despesas, menos d) − devido(todas as despesas)
//   efeito total = devido(sem saúde nem educação) − devido(todas as despesas)
//
// Cada "devido" escolhe o melhor modelo de novo (RF-06). Os efeitos individuais não somam o
// total, porque a tabela tem faixas e a redução tem limite. Valores em centavos.

export type SituacaoEfeito =
  | 'nao_deduz' // a despesa não entra na conta; o motivo está em `avaliacao`
  | 'reduz' // efeito > 0
  | 'imposto_zerado' // deduz, mas o imposto já é zero
  | 'simplificado_vence' // deduz, mas o desconto simplificado é maior
  | 'sem_efeito' // deduz, mas não muda o imposto (ex.: educação toda acima do limite)

export interface EfeitoDespesa {
  avaliacao: AvaliacaoDespesa
  situacao: SituacaoEfeito
  efeito: number // quanto o imposto devido sobe sem esta despesa (≥ 0)
  foraDoLimite: number // educação: parte deste valor que não conta por causa do limite
  mensagens: string[] // a principal primeiro
}

// Uso do limite de educação de uma pessoa, para a barra da tela de Dedutíveis.
export interface UsoEducacao {
  pessoa: string // 'titular' ou o id do dependente
  total: number // soma das despesas de educação dedutíveis da pessoa
  uso: number // mín(limite; total)
  restante: number // limite − uso
  limite: number
}

export interface Efeitos {
  despesas: EfeitoDespesa[] // na mesma ordem de `dados.despesas`
  // Saúde e educação juntas: compara com a declaração sem elas, mantendo a pensão (é a leitura que dá
  // o 2.356,67 do F5, que é o F1 com a pensão). A pensão tem efeito próprio em `despesas`.
  efeitoTotal: number
  educacaoPorPessoa: UsoEducacao[]
  resultado: Resultado // com todas as despesas
}

// "R$ 4.701,88", sem depender da localização do sistema.
export function reais(centavos: number): string {
  const sinal = centavos < 0 ? '-' : ''
  const abs = Math.abs(centavos)
  const inteiro = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sinal}R$ ${inteiro},${(abs % 100).toString().padStart(2, '0')}`
}

const pessoaDaEducacao = (despesa: RegistroDespesa) => despesa.dependente_id ?? 'titular'

const devido = (dados: DadosDeclaracao, P: ParametrosIrpf) =>
  calcularAjusteAnual(montarEntrada(dados), P).impostoDevido

const semIndice = (dados: DadosDeclaracao, indice: number): DadosDeclaracao => ({
  ...dados,
  despesas: dados.despesas.filter((_, i) => i !== indice),
})

const mensagemNaoDeduz = (despesa: RegistroDespesa, avaliacao: AvaliacaoDespesa): string => {
  if (avaliacao.deduz) return ''
  switch (avaliacao.motivo) {
    case 'tipo_nao_dedutivel': {
      const rotulo = tipoDespesa(despesa.tipo)?.rotulo ?? despesa.tipo
      return `Não deduz: ${rotulo.charAt(0).toLowerCase()}${rotulo.slice(1)}`
    }
    case 'tipo_desconhecido':
      return 'Não deduz: tipo de despesa desconhecido'
    case 'beneficiario_invalido':
      return despesa.beneficiario === 'dependente'
        ? 'Não deduz: este dependente está na declaração de outra pessoa'
        : 'Não deduz: a despesa precisa ser sua ou de um dependente'
    case 'sem_base_legal':
      return 'Não deduz: confirme que a pensão foi fixada por decisão judicial, acordo homologado ou escritura pública'
    case 'reembolsado':
      return 'Reembolsado: não deduz'
  }
}

// Parte de uma despesa de educação que não conta por causa do limite. Os recibos dedutíveis de uma
// pessoa consomem o limite na ordem da lista: o que passa dele cai nos últimos recibos, e a soma das
// partes que ficam de fora é igual ao excesso real da pessoa (total − limite).
const foraDoLimiteEducacao = (
  dados: DadosDeclaracao,
  indice: number,
  avaliacoes: readonly AvaliacaoDespesa[],
  limite: number,
): number => {
  const despesa = dados.despesas[indice]
  if (!despesa) return 0
  const pessoa = pessoaDaEducacao(despesa)
  let usado = 0
  dados.despesas.slice(0, indice).forEach((anterior, i) => {
    if (
      anterior.categoria === 'educacao' &&
      avaliacoes[i]?.deduz &&
      pessoaDaEducacao(anterior) === pessoa
    ) {
      usado += anterior.valor_centavos
    }
  })
  const conta = Math.min(despesa.valor_centavos, Math.max(0, limite - usado))
  return despesa.valor_centavos - conta
}

// Contexto calculado uma vez e reaproveitado para cada despesa.
interface Contexto {
  resultado: Resultado
  avaliacoes: AvaliacaoDespesa[]
  educacaoDedutivelPorPessoa: Map<string, number>
}

const montarContexto = (dados: DadosDeclaracao, P: ParametrosIrpf): Contexto => {
  const avaliacoes = dados.despesas.map((despesa) => avaliarDespesa(despesa, dados.dependentes))
  const educacaoDedutivelPorPessoa = new Map<string, number>()
  dados.despesas.forEach((despesa, i) => {
    if (despesa.categoria !== 'educacao' || !avaliacoes[i]?.deduz) return
    const pessoa = pessoaDaEducacao(despesa)
    educacaoDedutivelPorPessoa.set(
      pessoa,
      (educacaoDedutivelPorPessoa.get(pessoa) ?? 0) + despesa.valor_centavos,
    )
  })
  return {
    resultado: calcularAjusteAnual(montarEntrada(dados), P),
    avaliacoes,
    educacaoDedutivelPorPessoa,
  }
}

const efeitoNoIndice = (
  dados: DadosDeclaracao,
  indice: number,
  ctx: Contexto,
  P: ParametrosIrpf,
): EfeitoDespesa => {
  const despesa = dados.despesas[indice]
  const avaliacao = ctx.avaliacoes[indice]
  if (!despesa || !avaliacao) throw new RangeError(`Despesa ${indice} não existe`)

  if (!avaliacao.deduz) {
    return {
      avaliacao,
      situacao: 'nao_deduz',
      efeito: 0,
      foraDoLimite: 0,
      mensagens: [mensagemNaoDeduz(despesa, avaliacao)],
    }
  }

  const { resultado } = ctx
  const efeito = devido(semIndice(dados, indice), P) - resultado.impostoDevido

  let situacao: SituacaoEfeito
  let principal: string
  if (efeito > 0) {
    situacao = 'reduz'
    principal = `Reduz o imposto em ${reais(efeito)}`
  } else if (resultado.impostoDevido === 0) {
    situacao = 'imposto_zerado'
    principal = 'Seu imposto já está zerado'
  } else if (resultado.modelo === 'simplificado') {
    situacao = 'simplificado_vence'
    principal =
      resultado.faltaParaCompleto > 0
        ? `Não muda o imposto agora: o desconto simplificado é maior. Faltam ${reais(resultado.faltaParaCompleto)} em deduções.`
        : 'Não muda o imposto agora: os dois modelos dão o mesmo imposto'
  } else {
    situacao = 'sem_efeito'
    principal = 'Não muda o imposto agora'
  }

  const foraDoLimite =
    despesa.categoria === 'educacao'
      ? foraDoLimiteEducacao(dados, indice, ctx.avaliacoes, P.limiteEducacaoPorPessoa)
      : 0

  const mensagens = [principal]
  if (foraDoLimite > 0) {
    mensagens.push(`Deduz até o limite: ${reais(foraDoLimite)} deste valor não conta`)
  }
  return { avaliacao, situacao, efeito, foraDoLimite, mensagens }
}

// Barra de uso do limite: uma por pessoa válida (titular ou dependente desta declaração) com
// despesa de educação, dedutível ou não. Só as dedutíveis contam no uso.
const usoEducacao = (dados: DadosDeclaracao, ctx: Contexto, limite: number): UsoEducacao[] => {
  const pessoaValida = (despesa: RegistroDespesa) =>
    despesa.beneficiario === 'titular' ||
    (despesa.beneficiario === 'dependente' &&
      dados.dependentes.some(
        (dependente) => dependente.id === despesa.dependente_id && !dependente.em_outra_declaracao,
      ))

  const pessoas: string[] = []
  for (const despesa of dados.despesas) {
    if (despesa.categoria !== 'educacao' || !pessoaValida(despesa)) continue
    const pessoa = pessoaDaEducacao(despesa)
    if (!pessoas.includes(pessoa)) pessoas.push(pessoa)
  }
  pessoas.sort((a, b) => (a === 'titular' ? -1 : b === 'titular' ? 1 : 0))

  return pessoas.map((pessoa) => {
    const total = ctx.educacaoDedutivelPorPessoa.get(pessoa) ?? 0
    const uso = Math.min(limite, total)
    return { pessoa, total, uso, restante: limite - uso, limite }
  })
}

// Efeitos de todas as despesas de uma declaração, para a lista da tela de Dedutíveis (RF-13).
export function calcularEfeitos(
  dados: DadosDeclaracao,
  P: ParametrosIrpf = parametros(2026),
): Efeitos {
  const ctx = montarContexto(dados, P)
  const semSaudeNemEducacao: DadosDeclaracao = {
    ...dados,
    despesas: dados.despesas.filter((despesa) => despesa.categoria === 'pensao'),
  }
  return {
    despesas: dados.despesas.map((_, i) => efeitoNoIndice(dados, i, ctx, P)),
    efeitoTotal: devido(semSaudeNemEducacao, P) - ctx.resultado.impostoDevido,
    educacaoPorPessoa: usoEducacao(dados, ctx, P.limiteEducacaoPorPessoa),
    resultado: ctx.resultado,
  }
}

// Prévia no formulário (RF-13): efeito de uma despesa ainda não salva, junto das que já existem.
// Ao editar, passe em `dados` a declaração sem a versão antiga da despesa.
export function previaEfeito(
  dados: DadosDeclaracao,
  rascunho: RegistroDespesa,
  P: ParametrosIrpf = parametros(2026),
): EfeitoDespesa {
  const comRascunho: DadosDeclaracao = { ...dados, despesas: [...dados.despesas, rascunho] }
  return efeitoNoIndice(
    comRascunho,
    comRascunho.despesas.length - 1,
    montarContexto(comRascunho, P),
    P,
  )
}
