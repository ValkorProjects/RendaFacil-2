import type { Entrada } from './ajusteAnual'
import { somar } from './centavos'
import { tipoDespesa, type CategoriaDespesa } from './despesas'

// Linhas das tabelas do Supabase (RF-02), só com as colunas que o motor usa. Podem ser trocadas
// pelos tipos gerados em src/types/database.types.ts quando eles existirem.

export interface RegistroFonte {
  dependente_id: string | null // null = titular
  rendimentos_centavos: number
  previdencia_centavos: number
  irrf_centavos: number
}

export interface RegistroDependente {
  id: string
  em_outra_declaracao: boolean
}

export interface RegistroDespesa {
  categoria: CategoriaDespesa
  tipo: string
  beneficiario: 'titular' | 'dependente' | 'outra'
  dependente_id: string | null
  valor_centavos: number
  reembolso_centavos: number
  base_legal_ok: boolean | null
}

export interface DadosDeclaracao {
  fontes: readonly RegistroFonte[]
  dependentes: readonly RegistroDependente[]
  despesas: readonly RegistroDespesa[]
}

export type MotivoNaoDeduz =
  | 'tipo_desconhecido' // fora do catálogo, ou de outra categoria
  | 'tipo_nao_dedutivel' // ex.: remédio de farmácia, curso de idiomas
  | 'beneficiario_invalido' // outra pessoa, ou dependente que está em outra declaração
  | 'sem_base_legal' // pensão sem decisão judicial, acordo homologado ou escritura pública
  | 'reembolsado' // o plano devolveu o valor todo

export type AvaliacaoDespesa = { deduz: true } | { deduz: false; motivo: MotivoNaoDeduz }

// Um dependente só conta numa declaração: quem está na de outra pessoa não entra nesta, nem as
// despesas e a renda dele.
const dependenteValido = (id: string | null, dependentes: readonly RegistroDependente[]) => {
  const dependente = dependentes.find((item) => item.id === id)
  if (!dependente) throw new Error(`Dependente ${id} não está na lista de dependentes`)
  return !dependente.em_outra_declaracao
}

export function avaliarDespesa(
  despesa: RegistroDespesa,
  dependentes: readonly RegistroDependente[],
): AvaliacaoDespesa {
  const tipo = tipoDespesa(despesa.tipo)
  if (!tipo || tipo.categoria !== despesa.categoria) {
    return { deduz: false, motivo: 'tipo_desconhecido' }
  }
  if (!tipo.dedutivel) return { deduz: false, motivo: 'tipo_nao_dedutivel' }

  // Na pensão, o beneficiário é quem recebe, que não é dependente. Vale a base legal.
  if (despesa.categoria === 'pensao') {
    return despesa.base_legal_ok === true
      ? { deduz: true }
      : { deduz: false, motivo: 'sem_base_legal' }
  }

  const beneficiarioValido =
    despesa.beneficiario === 'titular' ||
    (despesa.beneficiario === 'dependente' && dependenteValido(despesa.dependente_id, dependentes))
  if (!beneficiarioValido) return { deduz: false, motivo: 'beneficiario_invalido' }

  if (despesa.categoria === 'saude' && despesa.reembolso_centavos >= despesa.valor_centavos) {
    return { deduz: false, motivo: 'reembolsado' }
  }
  return { deduz: true }
}

// Monta a entrada do ajuste anual a partir das linhas de uma declaração.
export function montarEntrada({ fontes, dependentes, despesas }: DadosDeclaracao): Entrada {
  const avaliadas = despesas.map((despesa) => ({
    despesa,
    dedutivel: avaliarDespesa(despesa, dependentes).deduz,
  }))
  const daCategoria = (categoria: CategoriaDespesa) =>
    avaliadas.filter(({ despesa }) => despesa.categoria === categoria)

  return {
    fontes: fontes
      .filter(
        (fonte) =>
          fonte.dependente_id === null || dependenteValido(fonte.dependente_id, dependentes),
      )
      .map((fonte) => ({
        rendimentos: fonte.rendimentos_centavos,
        previdencia: fonte.previdencia_centavos,
        irrf: fonte.irrf_centavos,
      })),
    dependentes: dependentes.filter((dependente) => !dependente.em_outra_declaracao).length,
    pensoes: somar(
      daCategoria('pensao').filter(({ dedutivel }) => dedutivel),
      ({ despesa }) => despesa.valor_centavos,
    ),
    saude: daCategoria('saude').map(({ despesa, dedutivel }) => ({
      valor: despesa.valor_centavos,
      reembolso: despesa.reembolso_centavos,
      dedutivel,
    })),
    educacao: daCategoria('educacao').map(({ despesa, dedutivel }) => ({
      pessoa: despesa.dependente_id ?? 'titular',
      valor: despesa.valor_centavos,
      dedutivel,
    })),
  }
}
