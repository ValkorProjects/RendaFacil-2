import type { ParametrosIrpf } from './tipos'

// Fonte: https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026
// A fonte de cada valor está em docs/calculo-irpf-2026.md.
export const PARAMETROS_2026 = {
  anoCalendario: 2026,
  // tabela progressiva anual: base até (centavos), alíquota (pontos-base), parcela a deduzir (centavos)
  tabelaAnual: [
    { ate: 2_914_560, aliquotaBp: 0, parcela: 0 }, // até 29.145,60
    { ate: 3_391_980, aliquotaBp: 750, parcela: 218_592 }, // até 33.919,80 · 7,5% · 2.185,92
    { ate: 4_501_260, aliquotaBp: 1500, parcela: 472_991 }, // até 45.012,60 · 15% · 4.729,91
    { ate: 5_597_616, aliquotaBp: 2250, parcela: 810_585 }, // até 55.976,16 · 22,5% · 8.105,85
    { ate: Infinity, aliquotaBp: 2750, parcela: 1_090_466 }, // acima de 55.976,16 · 27,5% · 10.904,66
  ],
  // redução anual: Lei 15.270/2025, que incluiu o art. 11-A na Lei 9.250/1995
  reducaoAnual: {
    zeraAte: 6_000_000, // rendimentos tributáveis até 60.000,00
    maxima: 269_415, // até 2.694,15
    parcialAte: 8_820_000, // até 88.200,00
    constante: 842_973, // 8.429,73
    fatorMilionesimos: 95_575, // 0,095575 × rendimentos tributáveis do ano
  },
  dependente: 227_508, // 2.275,08 por dependente
  limiteEducacaoPorPessoa: 356_150, // 3.561,50
  simplificado: { percentual: 20, teto: 1_764_000 }, // 20%, teto de 17.640,00
  tetoPrevidenciaMensal: 98_809, // 988,09, só para o aviso do RF-12
  // folha de pagamento, mês a mês: usada para estimar o informe a partir do salário
  mensal: {
    // INSS do empregado: cada faixa paga a própria alíquota sobre a parte do salário dentro dela
    inss: [
      { ate: 162_100, aliquotaBp: 750 }, // até 1.621,00 · 7,5%
      { ate: 290_284, aliquotaBp: 900 }, // até 2.902,84 · 9%
      { ate: 435_427, aliquotaBp: 1200 }, // até 4.354,27 · 12%
      { ate: 847_555, aliquotaBp: 1400 }, // até 8.475,55 (teto) · 14%
    ],
    tabela: [
      { ate: 242_880, aliquotaBp: 0, parcela: 0 }, // até 2.428,80
      { ate: 282_665, aliquotaBp: 750, parcela: 18_216 }, // até 2.826,65 · 7,5% · 182,16
      { ate: 375_105, aliquotaBp: 1500, parcela: 39_416 }, // até 3.751,05 · 15% · 394,16
      { ate: 466_468, aliquotaBp: 2250, parcela: 67_549 }, // até 4.664,68 · 22,5% · 675,49
      { ate: Infinity, aliquotaBp: 2750, parcela: 90_873 }, // acima de 4.664,68 · 27,5% · 908,73
    ],
    dependente: 18_959, // 189,59 por dependente
    descontoSimplificado: 60_720, // 607,20
    // redução mensal: art. 3º-A da Lei 9.250/1995, também incluído pela Lei 15.270/2025
    reducao: {
      zeraAte: 500_000, // salário bruto até 5.000,00
      maxima: 31_289, // até 312,89
      parcialAte: 735_000, // até 7.350,00
      constante: 97_862, // 978,62
      fatorMilionesimos: 133_145, // 0,133145 × salário bruto
    },
  },
} as const satisfies ParametrosIrpf
