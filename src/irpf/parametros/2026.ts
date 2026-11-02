// Fonte: https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026
export const PARAMETROS_2026 = {
  anoCalendario: 2026,
  // tabela progressiva anual: base até (centavos), alíquota (pontos-base), parcela a deduzir (centavos)
  tabelaAnual: [
    { ate: 2_914_560, aliquotaBp: 0,    parcela: 0 },         // até 29.145,60
    { ate: 3_391_980, aliquotaBp: 750,  parcela: 218_592 },   // até 33.919,80 · 7,5% · 2.185,92
    { ate: 4_501_260, aliquotaBp: 1500, parcela: 472_991 },   // até 45.012,60 · 15% · 4.729,91
    { ate: 5_597_616, aliquotaBp: 2250, parcela: 810_585 },   // até 55.976,16 · 22,5% · 8.105,85
    { ate: Infinity,  aliquotaBp: 2750, parcela: 1_090_466 }, // acima de 55.976,16 · 27,5% · 10.904,66
  ],
  // redução anual: Lei 15.270/2025, que incluiu o art. 11-A na Lei 9.250/1995
  reducaoAnual: {
    zeroAte: 6_000_000,          // rendimentos tributáveis até 60.000,00
    maxima: 269_415,             // até 2.694,15
    parcialAte: 8_820_000,       // até 88.200,00
    constante: 842_973,          // // 8.429,73
    fatorMilionesimos: 95_575,   // 0,095575 × rendimentos tributáveis do ano
  },
  dependente: 227_508,                              // 2.275,08 por dependente
  limiteEducacaoPorPessoa: 356_150,                 // 3.561,50
  simplificado: { percentual: 20, teto: 1_764_000 },// 20%, teto de 17.640,00
  tetoPrevidenciaMensal: 98_809,                   // 988,09, só para o aviso do RF-12
} as const;

export type ParametrosIrpf = typeof PARAMETROS_2026;