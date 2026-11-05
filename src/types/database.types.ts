// Schema types for the repository migrations. Regenerate when the schema changes:
//
//   npx supabase gen types typescript --project-id <project-ref> > src/types/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      perfis: {
        Row: {
          id: string
          name: string
          phone: string
          created_at: string
          updated_at: string
          consentimento_versao: string | null
          consentimento_em: string | null
        }
        Insert: {
          id: string
          name?: string
          phone?: string
          created_at?: string
          updated_at?: string
          consentimento_versao?: string | null
          consentimento_em?: string | null
        }
        Update: { name?: string; phone?: string }
        Relationships: []
      }
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
