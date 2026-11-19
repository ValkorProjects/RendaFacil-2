export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      declaracoes: Table<
        {
          id: string
          user_id: string
          ano_calendario: number
          fontes_esperadas: number
          questionario_etapa: string | null
          questionario_concluido: boolean
          triagem: Json
          resultado_real_tipo: string | null
          resultado_real_centavos: number | null
          resultado_real_modelo: string | null
          resultado_estimado_centavos: number | null
          criado_em: string
          atualizado_em: string
        },
        {
          id?: string
          user_id: string
          ano_calendario: number
          fontes_esperadas?: number
          questionario_etapa?: string | null
          questionario_concluido?: boolean
          triagem?: Json
          resultado_real_tipo?: string | null
          resultado_real_centavos?: number | null
          resultado_real_modelo?: string | null
          resultado_estimado_centavos?: number | null
          criado_em?: string
          atualizado_em?: string
        }
      >
      dependentes: Table<
        {
          id: string
          user_id: string
          declaracao_id: string
          apelido: string
          relacao: string
          em_outra_declaracao: boolean
          teve_renda: boolean
        },
        {
          id?: string
          user_id: string
          declaracao_id: string
          apelido: string
          relacao: string
          em_outra_declaracao?: boolean
          teve_renda?: boolean
        }
      >
      despesas: Table<
        {
          id: string
          user_id: string
          declaracao_id: string
          categoria: string
          tipo: string
          beneficiario: string
          dependente_id: string | null
          valor_centavos: number
          reembolso_centavos: number
          data: string
          descricao: string | null
          base_legal_ok: boolean | null
          recebedor: string
          pensao_iniciou_em_2026: boolean
        },
        {
          id?: string
          user_id: string
          declaracao_id: string
          categoria: string
          tipo: string
          beneficiario: string
          dependente_id?: string | null
          valor_centavos: number
          reembolso_centavos?: number
          data: string
          descricao?: string | null
          base_legal_ok?: boolean | null
          recebedor?: string
          pensao_iniciou_em_2026?: boolean
        }
      >
      fontes_pagadoras: Table<
        {
          id: string
          user_id: string
          declaracao_id: string
          cadastro_id: string
          categoria: string
          dependente_id: string | null
          nome: string
          rendimentos_centavos: number
          previdencia_centavos: number
          irrf_centavos: number
          rendimentos_mensais_centavos: number | null
          previdencia_mensal_centavos: number | null
          irrf_mensal_centavos: number | null
          decimo_terceiro_centavos: number
          irrf_13_centavos: number
          plr_centavos: number
        },
        {
          id?: string
          user_id: string
          declaracao_id: string
          cadastro_id?: string
          categoria?: string
          dependente_id?: string | null
          nome: string
          rendimentos_centavos: number
          previdencia_centavos?: number
          irrf_centavos?: number
          rendimentos_mensais_centavos?: number | null
          previdencia_mensal_centavos?: number | null
          irrf_mensal_centavos?: number | null
          decimo_terceiro_centavos?: number
          irrf_13_centavos?: number
          plr_centavos?: number
        }
      >
      perfis: Table<
        {
          id: string
          nome: string | null
          consentimento_versao: string
          consentimento_em: string
        },
        {
          id: string
          nome?: string | null
          consentimento_versao: string
          consentimento_em: string
        }
      >
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
