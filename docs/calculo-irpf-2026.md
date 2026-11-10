# Cálculo do IRPF 2026 (declaração de 2027)

Este documento explica como o motor em [`src/irpf/`](../src/irpf/) estima a declaração de 2027, com a renda de 2026. Ele traz as fórmulas, os parâmetros e as fontes de cada um, as convenções de arredondamento e o que fica fora do MVP. É a referência para revisar o motor e para atualizá-lo no ano que vem.

Nos textos e nas fórmulas, os valores estão em reais. No código, todo valor em dinheiro é um inteiro em centavos, as alíquotas estão em pontos-base (750 = 7,5%) e o fator da redução está em milionésimos (95.575 = 0,095575).

## Sumário

1. [Glossário](#1-glossário)
2. [Parâmetros de 2026](#2-parâmetros-de-2026)
3. [Ajuste anual](#3-ajuste-anual)
4. [Exemplo: caso F1](#4-exemplo-caso-f1)
5. [Arredondamento](#5-arredondamento)
6. [Folha mensal × ajuste anual](#6-folha-mensal--ajuste-anual)
7. [Quais despesas deduzem](#7-quais-despesas-deduzem)
8. [Como usar o motor](#8-como-usar-o-motor)
9. [Fora do escopo do MVP](#9-fora-do-escopo-do-mvp)
10. [Apêndice: cálculo mensal](#apêndice-cálculo-mensal-folha-de-pagamento)
11. [Fontes](#fontes)

## 1. Glossário

| Termo                             | Significado                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rendimento tributável** ($`A`$) | Salários e férias do ano, no quadro 3, linha 01 do informe de rendimentos. Soma todas as fontes do titular e dos dependentes. O 13º e a PLR têm tributação exclusiva e não entram. |
| **Dedução**                       | Valor que a lei permite tirar do rendimento antes de aplicar a tabela: INSS, dependentes, pensão alimentícia, saúde e educação.                                                    |
| **Base de cálculo**               | Rendimento menos deduções. A tabela é aplicada sobre ela, e não sobre o rendimento inteiro.                                                                                        |
| **Faixa**                         | Linha da tabela progressiva onde está o topo da base.                                                                                                                              |
| **Alíquota da faixa**             | Percentual da faixa da base, de 0% a 27,5%. Não é o percentual pago sobre a renda toda: cada fatia da base paga a alíquota da própria faixa.                                       |
| **Alíquota efetiva**              | Imposto devido dividido pelo rendimento tributável, ou seja, o percentual realmente pago. É sempre menor que a alíquota da faixa.                                                  |
| **Parcela a deduzir**             | Valor fixo de cada faixa que faz "base × alíquota − parcela" dar o mesmo que somar as fatias, cada uma com a sua alíquota.                                                         |
| **Redução**                       | Desconto da Lei 15.270/2025 aplicado sobre o próprio imposto. É calculado sobre o rendimento bruto. Uma dedução diminui a base; a redução diminui o imposto.                       |
| **IRRF**                          | Imposto de Renda Retido na Fonte: o que as empresas já descontaram do salário no ano (quadro 3, linha 05).                                                                         |
| **Modelo completo**               | Usa as deduções legais: INSS, dependentes, pensão, saúde e educação.                                                                                                               |
| **Modelo simplificado**           | Troca todas as deduções por 20% do rendimento tributável, até R$ 17.640,00.                                                                                                        |
| **Resultado**                     | IRRF menos imposto devido. Positivo é restituição; negativo é imposto a pagar.                                                                                                     |

## 2. Parâmetros de 2026

Todos os valores ficam em [`src/irpf/parametros/2026.ts`](../src/irpf/parametros/2026.ts). Nenhum número da lei aparece fora desse arquivo, e o motor recebe os parâmetros como argumento. O ano-calendário 2027 entra com um arquivo novo, registrado em `parametros(ano)`.

**Tabela progressiva anual** (`tabelaAnual`) · [Receita Federal][receita-2026]

| Faixa | Base de cálculo anual      | Alíquota | Parcela a deduzir |
| ----- | -------------------------- | -------: | ----------------: |
| 1     | até 29.145,60              |       0% |                 — |
| 2     | de 29.145,61 até 33.919,80 |     7,5% |          2.185,92 |
| 3     | de 33.919,81 até 45.012,60 |      15% |          4.729,91 |
| 4     | de 45.012,61 até 55.976,16 |    22,5% |          8.105,85 |
| 5     | acima de 55.976,16         |    27,5% |         10.904,66 |

**Demais parâmetros anuais**

| Parâmetro                                            | Valor                                          | No código                        | Fonte                                                            |
| ---------------------------------------------------- | ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Redução: rendimento até o qual vale a redução máxima | 60.000,00                                      | `reducaoAnual.zeroAte`           | [Lei 15.270/2025][lei-15270] · [Receita][receita-2026]           |
| Redução máxima                                       | 2.694,15                                       | `reducaoAnual.maxima`            | [Lei 15.270/2025][lei-15270] · [Receita][receita-2026]           |
| Redução: fim da faixa de redução parcial             | 88.200,00                                      | `reducaoAnual.parcialAte`        | [Lei 15.270/2025][lei-15270] · [Receita][receita-2026]           |
| Redução parcial: constante                           | 8.429,73                                       | `reducaoAnual.constante`         | [Lei 15.270/2025][lei-15270] · [Receita][receita-2026]           |
| Redução parcial: fator                               | 0,095575                                       | `reducaoAnual.fatorMilionesimos` | [Lei 15.270/2025][lei-15270] · [Receita][receita-2026]           |
| Dedução por dependente                               | 2.275,08                                       | `dependente`                     | [Receita][receita-2026]                                          |
| Limite de educação por pessoa                        | 3.561,50                                       | `limiteEducacaoPorPessoa`        | [Receita][receita-2026]                                          |
| Desconto simplificado: percentual                    | 20%                                            | `simplificado.percentual`        | [Lei 9.250/1995, art. 10][lei-9250]                              |
| Desconto simplificado: teto                          | 17.640,00                                      | `simplificado.teto`              | [Lei 9.250/1995, art. 10, X][lei-9250] · [Receita][receita-2026] |
| Teto mensal do INSS (só para o aviso do RF-12)       | 988,09, o INSS de quem recebe 8.475,55 ou mais | `tetoPrevidenciaMensal`          | [Tabela do INSS 2026][inss-2026]                                 |

Os parâmetros da folha mensal estão no [apêndice](#apêndice-cálculo-mensal-folha-de-pagamento).

## 3. Ajuste anual

Implementado em [`calcularAjusteAnual`](../src/irpf/ajusteAnual.ts) (RF-06). É uma função pura: recebe os informes, os dependentes e as despesas, calcula os dois modelos e fica com o de menor imposto. Devolve todos os valores intermediários, para a tela explicar a conta.

### 3.1 Entradas

Para cada fonte pagadora $`f`$, do titular ou de um dependente válido, o informe traz o rendimento $`r_f`$ (quadro 3, linha 01), a previdência oficial $`p_f`$ (linha 02) e o IRRF $`i_f`$ (linha 05):

```math
A = \sum_{f} r_f \qquad \mathrm{INSS} = \sum_{f} p_f \qquad \mathrm{IRRF} = \sum_{f} i_f
```

O 13º, o IRRF sobre o 13º e a PLR (quadro 5) ficam fora, porque têm tributação exclusiva.

### 3.2 Deduções do modelo completo

Saúde não tem limite, mas desconta o reembolso do plano, $`\rho_k`$. Só entram despesas dedutíveis (veja a [seção 7](#7-quais-despesas-deduzem)):

```math
S = \sum_{k \,\in\, \text{saúde dedutível}} \max\left(0,\; v_k - \rho_k\right)
```

Educação tem limite anual por pessoa, $`L_{\mathrm{edu}} = 3.561{,}50`$:

```math
E = \sum_{q \,\in\, \text{pessoas}} \min\left(L_{\mathrm{edu}},\; \sum_{k \,\in\, \text{educação dedutível de } q} v_k\right)
```

Com $`n`$ dependentes válidos e a soma das pensões válidas, $`\mathrm{Pen}`$:

```math
D_c = \mathrm{INSS} + 2.275{,}08 \cdot n + \mathrm{Pen} + S + E
```

### 3.3 Desconto simplificado

```math
D_s = \min\left(\operatorname{arred}(0{,}20 \cdot A),\; 17.640{,}00\right)
```

### 3.4 Imposto de cada modelo

Para cada modelo $`m \in \{c, s\}`$ (completo e simplificado), a base é:

```math
B_m = \max\left(0,\; A - D_m\right)
```

A faixa $`k`$ é a primeira linha da tabela com $`B_m \le L_k`$, onde $`L_k`$ é o limite "até" da faixa, $`a_k`$ a alíquota e $`d_k`$ a parcela a deduzir:

```math
T_m = \max\left(0,\; \operatorname{arred}(B_m \cdot a_k) - d_k\right), \qquad k = \min\{\, j : B_m \le L_j \,\}
```

A redução depende só do rendimento bruto do ano, $`A`$, e não da base. Por isso é a mesma nos dois modelos, e deduções não a mudam:

```math
R_{\mathrm{lei}}(A) =
\begin{cases}
2.694{,}15 & \text{se } A \le 60.000{,}00 \\
\max\left(0,\; 8.429{,}73 - \operatorname{arred}(0{,}095575 \cdot A)\right) & \text{se } 60.000{,}00 < A \le 88.200{,}00 \\
0 & \text{se } A > 88.200{,}00
\end{cases}
```

A redução nunca passa do imposto pela tabela, então o imposto devido não fica negativo:

```math
R_m = \min\left(R_{\mathrm{lei}}(A),\; T_m\right) \qquad \mathrm{Devido}_m = T_m - R_m
```

Logo acima de 60.000,00, a fórmula dá um pouco mais que 2.694,15 (2.695,23 com $`A = 60.000{,}01`$). O motor segue a fórmula da lei; o caso B1 dos testes cobre isso.

### 3.5 Escolha do modelo e resultado

```math
m^{*} =
\begin{cases}
c & \text{se } \mathrm{Devido}_c < \mathrm{Devido}_s \\
s & \text{caso contrário: o empate fica com o simplificado}
\end{cases}
```

```math
\mathrm{Resultado} = \mathrm{IRRF} - \mathrm{Devido}_{m^{*}}
```

Resultado positivo é restituição, negativo é imposto a pagar e zero é sem saldo. Quando o simplificado vence, a tela mostra quanto falta em deduções para o completo valer a pena:

```math
\mathrm{Falta} = \max\left(0,\; D_s - D_c\right)
```

A alíquota efetiva é $`\mathrm{Devido}_{m^{*}} / A`$.

## 4. Exemplo: caso F1

Doze meses de salário de 6.500,00, com 2 dependentes e pensão alimentícia judicial de 800,00 por mês:

```math
A = 78.000{,}00 \qquad \mathrm{INSS} = 8.538{,}12 \qquad \mathrm{IRRF} = 2.981{,}04 \qquad n = 2 \qquad \mathrm{Pen} = 9.600{,}00
```

| Passo               | Completo                                                       | Simplificado                                      |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Deduções            | $`8.538{,}12 + 2 \cdot 2.275{,}08 + 9.600{,}00 = 22.688{,}28`$ | $`\min(15.600{,}00;\ 17.640{,}00) = 15.600{,}00`$ |
| Base                | $`78.000{,}00 - 22.688{,}28 = 55.311{,}72`$ (faixa de 22,5%)   | $`62.400{,}00`$ (faixa de 27,5%)                  |
| Imposto pela tabela | $`12.445{,}14 - 8.105{,}85 = 4.339{,}29`$                      | $`17.160{,}00 - 10.904{,}66 = 6.255{,}34`$        |
| Redução             | $`8.429{,}73 - 7.454{,}85 = 974{,}88`$                         | $`974{,}88`$                                      |
| Imposto devido      | $`4.339{,}29 - 974{,}88 = 3.364{,}41`$                         | $`6.255{,}34 - 974{,}88 = 5.280{,}46`$            |

O completo vence, e o resultado é $`2.981{,}04 - 3.364{,}41 = -383{,}37`$: **R$ 383,37 de imposto a pagar**. Os testes conferem esses números com o motor: o caso F1 em `ajusteAnual.spec.ts`, e a conta a partir do salário mensal em `folhaMensal.spec.ts`.

## 5. Arredondamento

- Dinheiro é sempre um inteiro em centavos. O motor não usa `float` para dinheiro e recusa (com `RangeError`) valores negativos, fracionários ou `NaN`.
- Toda multiplicação por alíquota ou fator passa por `mulDiv`, que arredonda para o centavo mais próximo, com a metade para cima:

  ```math
  \operatorname{mulDiv}(a, b, d) = \left\lfloor \frac{a \cdot b + \lfloor d/2 \rfloor}{d} \right\rfloor
  \qquad
  \operatorname{arred}(B \cdot a_k) = \operatorname{mulDiv}(B,\ a_k^{\mathrm{bp}},\ 10.000)
  ```

  Por exemplo, $`0{,}095575 \cdot A`$ vira `mulDiv(A, 95575, 1000000)`. Com 88.200,00, o produto é 8.429,715 e arredonda para 8.429,72, o que deixa a redução em 0,01 (caso B2).

- Cada produto é arredondado uma vez, na hora em que é feito: o imposto pela tabela, o produto da redução (antes de subtrair da constante) e os 20% do simplificado (antes de aplicar o teto). Somas, subtrações, mínimos e máximos são exatos.
- A parcela a deduzir é o valor oficial, já arredondado pela Receita. Por isso "base × alíquota − parcela" pode diferir em até 1 centavo da soma das fatias. Vale o valor oficial, porque é o que a lei define.
- Na folha mensal, o INSS soma as fatias com todas as casas decimais e arredonda só no total. Na redução mensal, o produto é arredondado antes da subtração, como nos exemplos do [Sipec][sipec]. Num caso de meio centavo exato, a folha de uma empresa pode diferir em R$ 0,01.

## 6. Folha mensal × ajuste anual

Todo mês, a empresa desconta o IRRF pela tabela mensal (veja o [apêndice](#apêndice-cálculo-mensal-folha-de-pagamento)). É um adiantamento. Na declaração, a conta é refeita com a renda do ano inteiro e as tabelas anuais, e o resultado é comparado com tudo o que foi retido. As duas contas não precisam bater, mesmo com uma empresa só e salário igual o ano todo.

No caso F1, o IRRF mensal é 248,42, e 12 × 248,42 = 2.981,04. O ajuste calcula 3.364,41 de imposto devido, e por isso cobra 383,37:

|                     |               12 × mês |      Ano | Diferença |
| ------------------- | ---------------------: | -------: | --------: |
| Imposto pela tabela | 12 × 361,60 = 4.339,20 | 4.339,29 |     +0,09 |
| Redução             | 12 × 113,18 = 1.358,16 |   974,88 |   −383,28 |
| Imposto devido      | 12 × 248,42 = 2.981,04 | 3.364,41 |   +383,37 |

- **Redução (383,28):** a redução anual é menor que a soma das 12 reduções mensais. Com salário igual o ano todo, entre 5.000,00 e 7.350,00 por mês, a diferença antes dos arredondamentos é:

  ```math
  12 \cdot R_{\text{mês}} - R_{\text{ano}} = 12 \cdot (978{,}62 - 0{,}133145 \cdot b) - (8.429{,}73 - 0{,}095575 \cdot A) = 3.313{,}71 - 0{,}03757 \cdot A, \qquad A = 12\,b
  ```

  Ela cai de cerca de 1.059,51 logo acima de $`A = 60.000`$ até praticamente zero em $`A = 88.200`$. Com $`A = 78.000`$, dá 383,25; com os arredondamentos, 383,28.

- **Tabela (0,09):** 0,06 vêm de arredondar o produto da tabela todo mês ($`4.609{,}31 \cdot 22{,}5\% = 1.037{,}09475`$, arredondado para 1.037,09 doze vezes). Os outros 0,03 vêm da parcela anual (8.105,85), que não é exatamente 12 × 675,49 = 8.105,88.

O efeito contrário também existe: o desconto simplificado anual (20% do rendimento, até 17.640,00) é bem maior que 12 × 607,20 = 7.286,40. Quem tem poucas deduções costuma receber restituição. No caso F2 (6.000,00 por mês, sem deduções), o simplificado anual de 14.400,00 vence e a restituição é de 1.234,19. O sinal do ajuste depende das deduções de cada pessoa.

## 7. Quais despesas deduzem

O catálogo fica em [`src/irpf/despesas.ts`](../src/irpf/despesas.ts). A chave de cada tipo é o valor gravado em `despesas.tipo`. Pela pesquisa do projeto, 13 de 35 pessoas achavam que remédio de farmácia deduz, por isso o formulário começa pelo tipo.

| Categoria                         | Deduz                                                                                                                                                                                                                  | Não deduz                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Saúde, sem limite                 | consulta médica; dentista; psicólogo; fisioterapeuta, fonoaudiólogo ou terapeuta ocupacional; exames de laboratório e de imagem; hospital ou internação; plano de saúde; aparelhos e próteses ortopédicas ou dentárias | remédio de farmácia (fora da conta do hospital); óculos e lentes; academia |
| Educação, até 3.561,50 por pessoa | creche e pré-escola; ensino fundamental; ensino médio; graduação; pós-graduação, mestrado ou doutorado; ensino técnico ou tecnológico                                                                                  | curso de idiomas; material escolar e uniforme; cursinho e cursos livres    |
| Pensão alimentícia, sem limite    | fixada por decisão judicial, acordo homologado na Justiça ou escritura pública                                                                                                                                         | sem essa base legal confirmada                                             |

[`avaliarDespesa`](../src/irpf/entrada.ts) aplica as regras abaixo e diz o motivo quando a despesa não deduz:

| Regra                                                                                         | Motivo devolvido        |
| --------------------------------------------------------------------------------------------- | ----------------------- |
| Tipo fora do catálogo ou de outra categoria                                                   | `tipo_desconhecido`     |
| Tipo que não deduz (ex.: remédio de farmácia)                                                 | `tipo_nao_dedutivel`    |
| Saúde ou educação de outra pessoa, ou de um dependente que está na declaração de outra pessoa | `beneficiario_invalido` |
| Pensão sem a base legal confirmada                                                            | `sem_base_legal`        |
| Reembolso do plano maior ou igual ao valor                                                    | `reembolsado`           |

- Um dependente só conta numa declaração. O dependente marcado como "em outra declaração" não entra na contagem, e a renda e as despesas dele também ficam fora desta declaração.
- Saúde dedutível é o valor menos o reembolso, nunca negativa (caso F10).
- O limite de educação é aplicado pelo motor, por pessoa (caso F8: duas pessoas com 4.000,00 deduzem 7.123,00).
- A data da despesa precisa ser de 2026. Essa validação é do formulário (RF-13).

## 8. Como usar o motor

A API pública fica em [`src/irpf/index.ts`](../src/irpf/index.ts). As telas leem as linhas da declaração no Supabase e passam para o motor, sem fazer conta própria:

```ts
import { calcularAjusteAnual, montarEntrada } from '@/irpf'

// linhas de fontes_pagadoras, dependentes e despesas da declaração de 2026
const resultado = calcularAjusteAnual(montarEntrada({ fontes, dependentes, despesas }))

resultado.resultado // > 0 restituição · < 0 imposto a pagar · 0 sem saldo
resultado.modelo // 'completo' ou 'simplificado'
resultado.completo // deduções, base, alíquota, imposto pela tabela, redução e imposto devido
resultado.faltaParaCompleto // deduções que faltam para o completo valer a pena
```

Antes de o informe de rendimentos chegar, dá para estimar a fonte a partir do salário mensal. A estimativa supõe o mesmo salário em todos os meses e não inclui o terço de férias:

```ts
import { calcularAjusteAnual, estimarFonteAnual } from '@/irpf'

const salario = { bruto: 650_000, dependentes: 2, pensao: 80_000 } // centavos
const resultado = calcularAjusteAnual({
  fontes: [estimarFonteAnual(salario)],
  dependentes: 2,
  pensoes: 12 * salario.pensao,
  saude: [],
  educacao: [],
})
```

- **Efeito de uma despesa (RF-07):** calcule o imposto devido com e sem a despesa. Cada cálculo escolhe o melhor modelo de novo.
- **Texto "não deduz" (RF-13):** use `avaliarDespesa(despesa, dependentes)` e `TIPOS_DESPESA[tipo].rotulo`.
- **Testes:** `npm test` roda os casos de referência do RF-08 (`src/irpf/__tests__/`), os da folha mensal e os testes ao lado do código (`*.test.ts`). O CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) roda os testes, o lint, a formatação, o type-check e o build em todo PR para `dev` e `main`. Todo bug de cálculo encontrado vira um caso novo.

### 8.1 Estimativa parcial na tela de Rendas

Enquanto as telas de Rendas (RF-12), Dedutíveis (RF-13) e a Home (RF-14) não existem na forma final, a tela de cadastro de rendimentos já usa o motor, com os dados guardados só em memória:

| Na tela (por mês)                                | No motor (por ano, × 12)                     |
| ------------------------------------------------ | -------------------------------------------- |
| Valor mensal de cada rendimento                  | `fontes[].rendimentos`                       |
| INSS descontado no mês                           | `fontes[].previdencia`                       |
| IR retido na fonte no mês                        | `fontes[].irrf`                              |
| Renda tributável de dependente (estágio, outros) | uma fonte a mais, sem INSS nem IRRF          |
| Pensão recebida por dependente                   | fica fora (isenta)                           |
| Cada dependente, com ou sem renda                | `dependentes`                                |
| Pensão alimentícia paga                          | `pensoes`                                    |
| —                                                | `saude` e `educacao` vazios (sem tela ainda) |

Para uma fonte CLT, a tela compara o INSS e o IR retido digitados com a folha mensal (`incomeEntryWarnings`) e avisa, sem bloquear, quando diferem mais de R$ 0,10 (INSS acima da tabela, IR retido diferente da tabela). Férias, 13º, um segundo empregador e deduções extras explicam diferenças legítimas, e o informe de rendimentos é o que vale. A visão **Mensal** do cartão mostra a conta da folha ao lado dos valores informados. Ela supõe o mesmo salário o ano todo; escolher um mês específico está como TODO em `TaxEstimateCard.vue`.

Duas outras proteções, também sem bloquear: `inssCeilingWarning` avisa quando o INSS somado de todas as fontes passa do teto anual (12 × 988,09 = 11.857,08, critério do RF-12), o que acontece com mais de um empregador; e o cartão lista as categorias que não são CLT ("Tratado como salário: …"), porque aluguéis, autônomo/PJ e aposentadoria passam pelo motor como se fossem salário. Quem tem uma renda de PJ sem retenção, por exemplo, paga o carnê-leão mês a mês, e esse imposto ainda não é descontado da estimativa (seção 9).

A conversão fica em `buildTaxInput`, em [`src/stores/income.ts`](../src/stores/income.ts). O botão "Calcular INSS e IR pelo salário" usa `calcularFolhaMensal` com os dependentes e a pensão do formulário. Todas as categorias de renda são tratadas como rendimento tributável; aluguéis, trabalho autônomo e aposentadoria têm regras próprias que ficam fora do MVP (seção 9), e o cartão da estimativa avisa isso.

## 9. Fora do escopo do MVP

O MVP calcula só salários (CLT) e as deduções acima. Ficam de fora:

- Rendimentos que não são salário: aluguel recebido, trabalho autônomo, MEI ou PJ (carnê-leão), aposentadoria e pensão recebidas e renda do exterior. A triagem do questionário (RF-10) marca a estimativa como provisória quando a pessoa tem algum deles.
- Venda de bens com lucro (ganho de capital) e operações na bolsa.
- Rendimentos isentos e de tributação exclusiva, como 13º, PLR e aplicações financeiras. Eles não entram no ajuste; o informe guarda 13º e PLR só para exibir.
- Outras deduções do modelo completo, como previdência complementar (PGBL e Funpresp) e livro-caixa.
- Doações e incentivos que abatem o imposto devido (fundos da criança e do idoso, cultura, esporte).
- Declaração de espólio e de saída definitiva do país.
- Cálculo mês a mês ao longo do ano com salário variável. O apêndice traz a conta mensal, e `estimarFonteAnual` cobre o caso de salário fixo.

## Apêndice: cálculo mensal (folha de pagamento)

Implementado em [`calcularFolhaMensal`](../src/irpf/folhaMensal.ts). É o desconto do holerite num mês comum de empregado CLT, sem 13º, férias, PLR, previdência privada ou outros rendimentos. Serve para estimar o informe a partir do salário e para o futuro modo "ao longo do ano".

**Parâmetros mensais** (`PARAMETROS_2026.mensal`)

| Parâmetro                    | Valor                                                                                                                                 | Fonte                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| INSS do empregado            | 7,5% até 1.621,00 · 9% até 2.902,84 · 12% até 4.354,27 · 14% até 8.475,55 (teto)                                                      | [Tabela do INSS 2026][inss-2026] · [Portaria Interministerial MPS/MF nº 13/2026][portaria-inss] |
| Tabela mensal do IRRF        | 0% até 2.428,80 · 7,5% até 2.826,65 (parcela 182,16) · 15% até 3.751,05 (394,16) · 22,5% até 4.664,68 (675,49) · 27,5% acima (908,73) | [Receita][receita-2026] · [Lei 15.191/2025][lei-15191]                                          |
| Dedução por dependente       | 189,59                                                                                                                                | [Receita][receita-2026] · [Lei 9.250/1995, art. 4º][lei-9250]                                   |
| Desconto simplificado mensal | 607,20 (25% do limite da faixa isenta, 2.428,80)                                                                                      | [Receita][receita-2026] · [Lei 9.250/1995, art. 4º, § 2º][lei-9250]                             |
| Redução mensal               | até 312,89 com bruto até 5.000,00; 978,62 − 0,133145 × bruto até 7.350,00                                                             | [Lei 15.270/2025][lei-15270] · [Receita][receita-2026]                                          |

**Fórmulas**, com salário bruto $`b`$ e $`n`$ dependentes:

```math
\mathrm{INSS} = \operatorname{arred}\left(\sum_{k=1}^{4} \max\left(0,\; \min(b, L_k) - L_{k-1}\right) \cdot a_k\right), \qquad L_0 = 0
```

```math
D = \mathrm{INSS} + 189{,}59 \cdot n + \text{pensão} \qquad B = \max\left(0,\; b - \max(D,\; 607{,}20)\right)
```

```math
T = \max\left(0,\; \operatorname{arred}(B \cdot a_k) - d_k\right), \qquad k = \min\{\, j : B \le L_j \,\}
```

```math
R =
\begin{cases}
\min\left(312{,}89,\; T\right) & \text{se } b \le 5.000{,}00 \\
\min\left(\max\left(0,\; 978{,}62 - \operatorname{arred}(0{,}133145 \cdot b)\right),\; T\right) & \text{se } 5.000{,}00 < b \le 7.350{,}00 \\
0 & \text{se } b > 7.350{,}00
\end{cases}
\qquad
\mathrm{IRRF} = T - R
```

Como no ajuste anual, a redução usa o salário bruto. Dependentes e pensão diminuem a base, mas não mudam a redução. O INSS de quem ganha acima do teto fica em 988,09.

**Exemplo:** bruto de 6.500,00, 2 dependentes e pensão de 800,00:

| Passo               | Conta                                                             |      Valor |
| ------------------- | ----------------------------------------------------------------- | ---------: |
| INSS                | $`121{,}575 + 115{,}3656 + 174{,}1716 + 300{,}4022 = 711{,}5144`$ |     711,51 |
| Deduções            | $`711{,}51 + 2 \cdot 189{,}59 + 800{,}00`$ (maior que 607,20)     |   1.890,69 |
| Base                | $`6.500{,}00 - 1.890{,}69`$ (faixa de 22,5%)                      |   4.609,31 |
| Imposto pela tabela | $`\operatorname{arred}(1.037{,}09475) - 675{,}49`$                |     361,60 |
| Redução             | $`978{,}62 - \operatorname{arred}(865{,}4425)`$                   |     113,18 |
| IRRF                | $`361{,}60 - 113{,}18`$                                           | **248,42** |

**Conferência:** com salário de 5.250,00, sem dependentes nem pensão, o motor dá IRRF de 89,53, o mesmo do exemplo oficial do [Sipec][sipec].

## Fontes

- [Receita Federal: tabelas de 2026][receita-2026]: tabelas anual e mensal, deduções por dependente, limite de educação, descontos simplificados e reduções anual e mensal.
- [Receita Federal: exemplos de aplicação da Lei 15.270/2025][receita-exemplos]: exemplos da redução mensal.
- [Lei 15.270/2025][lei-15270]: redução mensal e anual (arts. 3º-A e 11-A da Lei 9.250/1995) e teto do simplificado de 2026.
- [Lei 15.191/2025][lei-15191]: tabela mensal do IRRF em vigor em 2026.
- [Lei 9.250/1995][lei-9250]: desconto simplificado de 20% (art. 10), deduções da base mensal (art. 4º) e reduções (arts. 3º-A e 11-A).
- [Tabela de contribuição do INSS de 2026][inss-2026], com valores da [Portaria Interministerial MPS/MF nº 13, de 9 de janeiro de 2026][portaria-inss]: faixas e teto do INSS do empregado.
- [Comunicado Sipec 566295][sipec]: exemplos de cálculo mensal da folha federal com a Lei 15.270/2025.

[receita-2026]: https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026
[receita-exemplos]: https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025
[lei-15270]: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm
[lei-15191]: https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2025/Lei/L15191.htm
[lei-9250]: https://www.planalto.gov.br/ccivil_03/leis/l9250.htm
[inss-2026]: https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
[portaria-inss]: https://www.gov.br/previdencia/pt-br/assuntos/rpps/documentos/PortariaInterministerialMPSMF13de9dejaneirode2026.pdf
[sipec]: https://www.gov.br/servidor/pt-br/canais_atendimento/central-sipec/comunicas-1/dezembro/comunicado-566295-adequacao-sistemica-lei-15-270-de-26-de-novembro-de-2025.pdf
