export const relationshipLabels = {
  filho_enteado: 'Filho(a) ou enteado(a)',
  conjuge_companheiro: 'Cônjuge ou companheiro(a)',
  pais_avos_bisavos: 'Pais, avós ou bisavós',
  outro: 'Outro',
} as const

export interface RegisteredDependent {
  id: number
  dbId?: string
  apelido: string
  relacao: keyof typeof relationshipLabels
  em_outra_declaracao: boolean
  teve_renda_propria: boolean
}

export type DependentFields = Omit<RegisteredDependent, 'id'>

export const emptyDependent = (): DependentFields => ({
  apelido: '',
  relacao: 'filho_enteado',
  em_outra_declaracao: false,
  teve_renda_propria: false,
})

export const dependentError = (dependent: DependentFields) => {
  if (!dependent.apelido.trim() || dependent.apelido.trim().length > 60) {
    return 'Informe um apelido com até 60 caracteres.'
  }
  if (!Object.hasOwn(relationshipLabels, dependent.relacao)) return 'Selecione a relação.'
  return ''
}
