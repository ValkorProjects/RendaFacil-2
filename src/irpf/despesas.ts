export type CategoriaDespesa = 'saude' | 'educacao' | 'pensao'

export interface TipoDespesa {
  categoria: CategoriaDespesa
  rotulo: string
  dedutivel: boolean
}

// Tipos do formulário de Dedutíveis (RF-13). A chave é o valor gravado em `despesas.tipo`.
// Saúde dedutível não tem limite; educação dedutível tem limite anual por pessoa; pensão deduz
// sem limite quando fixada por decisão judicial, acordo homologado ou escritura pública.
export const TIPOS_DESPESA = {
  consulta_medica: { categoria: 'saude', rotulo: 'Consulta médica', dedutivel: true },
  dentista: { categoria: 'saude', rotulo: 'Dentista', dedutivel: true },
  psicologo: { categoria: 'saude', rotulo: 'Psicólogo', dedutivel: true },
  terapias: {
    categoria: 'saude',
    rotulo: 'Fisioterapeuta, fonoaudiólogo ou terapeuta ocupacional',
    dedutivel: true,
  },
  exames: { categoria: 'saude', rotulo: 'Exames de laboratório e de imagem', dedutivel: true },
  hospital: { categoria: 'saude', rotulo: 'Hospital ou internação', dedutivel: true },
  plano_saude: { categoria: 'saude', rotulo: 'Plano de saúde', dedutivel: true },
  aparelhos_proteses: {
    categoria: 'saude',
    rotulo: 'Aparelhos e próteses ortopédicas ou dentárias',
    dedutivel: true,
  },
  remedio_farmacia: {
    categoria: 'saude',
    rotulo: 'Remédio de farmácia (fora da conta do hospital)',
    dedutivel: false,
  },
  oculos_lentes: { categoria: 'saude', rotulo: 'Óculos e lentes', dedutivel: false },
  academia: { categoria: 'saude', rotulo: 'Academia', dedutivel: false },
  creche_pre_escola: { categoria: 'educacao', rotulo: 'Creche e pré-escola', dedutivel: true },
  ensino_fundamental: { categoria: 'educacao', rotulo: 'Ensino fundamental', dedutivel: true },
  ensino_medio: { categoria: 'educacao', rotulo: 'Ensino médio', dedutivel: true },
  graduacao: { categoria: 'educacao', rotulo: 'Graduação', dedutivel: true },
  pos_graduacao: {
    categoria: 'educacao',
    rotulo: 'Pós-graduação, mestrado ou doutorado',
    dedutivel: true,
  },
  ensino_tecnico: {
    categoria: 'educacao',
    rotulo: 'Ensino técnico ou tecnológico',
    dedutivel: true,
  },
  curso_idiomas: { categoria: 'educacao', rotulo: 'Curso de idiomas', dedutivel: false },
  material_uniforme: {
    categoria: 'educacao',
    rotulo: 'Material escolar e uniforme',
    dedutivel: false,
  },
  cursos_livres: { categoria: 'educacao', rotulo: 'Cursinho e cursos livres', dedutivel: false },
  pensao_alimenticia: { categoria: 'pensao', rotulo: 'Pensão alimentícia', dedutivel: true },
} as const satisfies Record<string, TipoDespesa>

export type IdTipoDespesa = keyof typeof TIPOS_DESPESA

export const tipoDespesa = (id: string): TipoDespesa | undefined =>
  Object.hasOwn(TIPOS_DESPESA, id) ? TIPOS_DESPESA[id as IdTipoDespesa] : undefined
