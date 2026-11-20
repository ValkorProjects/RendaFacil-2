import type { Tables } from '@/types/database.types'
import type { Entrada } from './ajusteAnual'
import { somar } from './centavos'
import { tipoDespesa, type CategoriaDespesa } from './despesas'

// The engine consumes only the relevant columns of the generated schema.
export type RegistroFonte = Pick<
  Tables<'fontes_pagadoras'>,
  'dependente_id' | 'rendimentos_centavos' | 'previdencia_centavos' | 'irrf_centavos'
>
export type RegistroDependente = Pick<Tables<'dependentes'>, 'id' | 'em_outra_declaracao'>

export interface RegistroDespesa {
  categoria: CategoriaDespesa
  tipo: string
  beneficiario: 'titular' | 'dependente' | 'outra'
  dependente_id: string | null
  recebedor: string
  valor_centavos: number
  reembolso_centavos: number
  base_legal_ok: boolean | null
  pensao_iniciou_em_2026: boolean
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
export const dependentePodeSerDeclarado = (
  dependente: RegistroDependente,
  despesas: readonly RegistroDespesa[],
) =>
  !dependente.em_outra_declaracao &&
  !despesas.some(
    (despesa) =>
      despesa.categoria === 'pensao' &&
      despesa.beneficiario === 'dependente' &&
      despesa.dependente_id === dependente.id &&
      !despesa.pensao_iniciou_em_2026,
  )

const dependenteValido = (
  id: string | null,
  dependentes: readonly RegistroDependente[],
  despesas: readonly RegistroDespesa[],
) => {
  const dependente = dependentes.find((item) => item.id === id)
  if (!dependente) throw new Error(`Dependente ${id} não está na lista de dependentes`)
  return dependentePodeSerDeclarado(dependente, despesas)
}

export function avaliarDespesa(
  despesa: RegistroDespesa,
  dependentes: readonly RegistroDependente[],
  despesas: readonly RegistroDespesa[] = [despesa],
): AvaliacaoDespesa {
  const tipo = tipoDespesa(despesa.tipo)
  if (!tipo || tipo.categoria !== despesa.categoria) {
    return { deduz: false, motivo: 'tipo_desconhecido' }
  }
  if (!tipo.dedutivel) return { deduz: false, motivo: 'tipo_nao_dedutivel' }

  // Na pensão, o beneficiário é quem recebe, que não é dependente. Vale a base legal.
  if (despesa.categoria === 'pensao') {
    if (!despesa.recebedor.trim()) return { deduz: false, motivo: 'beneficiario_invalido' }
    return despesa.base_legal_ok === true
      ? { deduz: true }
      : { deduz: false, motivo: 'sem_base_legal' }
  }

  const beneficiarioValido =
    despesa.beneficiario === 'titular' ||
    (despesa.beneficiario === 'dependente' &&
      dependenteValido(despesa.dependente_id, dependentes, despesas))
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
    dedutivel: avaliarDespesa(despesa, dependentes, despesas).deduz,
  }))
  const daCategoria = (categoria: CategoriaDespesa) =>
    avaliadas.filter(({ despesa }) => despesa.categoria === categoria)

  return {
    fontes: fontes
      .filter(
        (fonte) =>
          fonte.dependente_id === null ||
          dependenteValido(fonte.dependente_id, dependentes, despesas),
      )
      .map((fonte) => ({
        rendimentos: fonte.rendimentos_centavos,
        previdencia: fonte.previdencia_centavos,
        irrf: fonte.irrf_centavos,
      })),
    dependentes: dependentes.filter((dependente) =>
      dependentePodeSerDeclarado(dependente, despesas),
    ).length,
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
