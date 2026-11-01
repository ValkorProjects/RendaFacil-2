export const PARAMETROS_2026 = {
  anoCalendario: 2026,
  tabelaAnual: [
    { ate: 2_914_560, aliquotaBp: 0, parcela: 0 },
    { ate: 3_391_980, aliquotaBp: 750, parcela: 218_592 },
    { ate: 4_501_260, aliquotaBp: 1500, parcela: 472_991 },
    { ate: 5_597_616, aliquotaBp: 2250, parcela: 810_585 },
    { ate: Infinity, aliquotaBp: 2750, parcela: 1_090_466 },
  ],
  reducaoAnual: {
    zeroAte: 6_000_000,
    maxima: 269_415,
    parcialAte: 8_820_000,
    constante: 842_973,
    fatorMilionesimos: 95_575,
  },
  dependente: 227_508,
  limiteEducacaoPorPessoa: 356_150,
  simplificado: {
    percentual: 20,
    teto: 1_764_000,
  },
  tetoPrevidenciaMensal: 98_809,
} as const

export type ParametrosIrpf = typeof PARAMETROS_2026
