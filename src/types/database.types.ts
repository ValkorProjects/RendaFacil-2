export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      declaracoes: {
        Row: {
          ano_calendario: number
          atualizado_em: string
          criado_em: string
          fontes_esperadas: number
          id: string
          questionario_concluido: boolean
          questionario_etapa: string | null
          resultado_estimado_centavos: number | null
          resultado_real_centavos: number | null
          resultado_real_modelo: string | null
          resultado_real_tipo: string | null
          triagem: NonNullable<Json>
          user_id: string
        }
        ComputedFields: never
        Insert: {
          ano_calendario: number
          atualizado_em?: string
          criado_em?: string
          fontes_esperadas?: number
          id?: string
          questionario_concluido?: boolean
          questionario_etapa?: string | null
          resultado_estimado_centavos?: number | null
          resultado_real_centavos?: number | null
          resultado_real_modelo?: string | null
          resultado_real_tipo?: string | null
          triagem?: NonNullable<Json>
          user_id: string
        }
        Update: {
          ano_calendario?: number
          atualizado_em?: string
          criado_em?: string
          fontes_esperadas?: number
          id?: string
          questionario_concluido?: boolean
          questionario_etapa?: string | null
          resultado_estimado_centavos?: number | null
          resultado_real_centavos?: number | null
          resultado_real_modelo?: string | null
          resultado_real_tipo?: string | null
          triagem?: NonNullable<Json>
          user_id?: string
        }
        Relationships: []
      }
      dependentes: {
        Row: {
          apelido: string
          declaracao_id: string
          em_outra_declaracao: boolean
          id: string
          relacao: string
          teve_renda: boolean
          user_id: string
        }
        ComputedFields: never
        Insert: {
          apelido: string
          declaracao_id: string
          em_outra_declaracao?: boolean
          id?: string
          relacao: string
          teve_renda?: boolean
          user_id: string
        }
        Update: {
          apelido?: string
          declaracao_id?: string
          em_outra_declaracao?: boolean
          id?: string
          relacao?: string
          teve_renda?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'dependentes_declaracao_id_fkey'
            columns: ['declaracao_id']
            isOneToOne: false
            referencedRelation: 'declaracoes'
            referencedColumns: ['id']
          },
        ]
      }
      despesas: {
        Row: {
          base_legal_ok: boolean | null
          beneficiario: string
          categoria: string
          data: string
          declaracao_id: string
          dependente_id: string | null
          descricao: string | null
          id: string
          pensao_iniciou_em_2026: boolean
          recebedor: string
          reembolso_centavos: number
          tipo: string
          user_id: string
          valor_centavos: number
        }
        ComputedFields: never
        Insert: {
          base_legal_ok?: boolean | null
          beneficiario: string
          categoria: string
          data: string
          declaracao_id: string
          dependente_id?: string | null
          descricao?: string | null
          id?: string
          pensao_iniciou_em_2026?: boolean
          recebedor?: string
          reembolso_centavos?: number
          tipo: string
          user_id: string
          valor_centavos: number
        }
        Update: {
          base_legal_ok?: boolean | null
          beneficiario?: string
          categoria?: string
          data?: string
          declaracao_id?: string
          dependente_id?: string | null
          descricao?: string | null
          id?: string
          pensao_iniciou_em_2026?: boolean
          recebedor?: string
          reembolso_centavos?: number
          tipo?: string
          user_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: 'despesas_declaracao_id_fkey'
            columns: ['declaracao_id']
            isOneToOne: false
            referencedRelation: 'declaracoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'despesas_dependente_id_fkey'
            columns: ['dependente_id']
            isOneToOne: false
            referencedRelation: 'dependentes'
            referencedColumns: ['id']
          },
        ]
      }
      fontes_pagadoras: {
        Row: {
          cadastro_id: string
          categoria: string
          decimo_terceiro_centavos: number
          declaracao_id: string
          dependente_id: string | null
          id: string
          irrf_13_centavos: number
          irrf_centavos: number
          nome: string
          plr_centavos: number
          previdencia_centavos: number
          rendimentos_centavos: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          cadastro_id?: string
          categoria?: string
          decimo_terceiro_centavos?: number
          declaracao_id: string
          dependente_id?: string | null
          id?: string
          irrf_13_centavos?: number
          irrf_centavos?: number
          nome: string
          plr_centavos?: number
          previdencia_centavos?: number
          rendimentos_centavos: number
          user_id: string
        }
        Update: {
          cadastro_id?: string
          categoria?: string
          decimo_terceiro_centavos?: number
          declaracao_id?: string
          dependente_id?: string | null
          id?: string
          irrf_13_centavos?: number
          irrf_centavos?: number
          nome?: string
          plr_centavos?: number
          previdencia_centavos?: number
          rendimentos_centavos?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fontes_pagadoras_declaracao_id_fkey'
            columns: ['declaracao_id']
            isOneToOne: false
            referencedRelation: 'declaracoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fontes_pagadoras_dependente_id_fkey'
            columns: ['dependente_id']
            isOneToOne: false
            referencedRelation: 'dependentes'
            referencedColumns: ['id']
          },
        ]
      }
      perfis: {
        Row: {
          consentimento_em: string
          consentimento_versao: string
          created_at: string
          id: string
          nome: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          consentimento_em: string
          consentimento_versao: string
          created_at?: string
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          consentimento_em?: string
          consentimento_versao?: string
          created_at?: string
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      salvar_lancamentos: {
        Args: { p_alteracoes: Json; p_declaracao_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
