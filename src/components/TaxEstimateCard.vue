<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PayrollRow, TaxEstimate } from '@/stores/income'
import { formatCurrency } from '@/utils/currency'
import { describeTaxResult, formatRate } from '@/utils/taxResult'

const props = defineProps<{ estimate: TaxEstimate | null; payroll: PayrollRow[] }>()

// 'anual' is the declaration (yearly totals); 'mensal' shows the payslip calculation behind the
// INSS and income tax figures, to check them against the holerite.
// TODO: let the user pick a specific month. Férias, 13º and raises make months differ, and the
// monthly view assumes the same salary all year.
const view = ref<'anual' | 'mensal'>('anual')
// Categories other than CLT go through the engine as if they were salary.
const untreated = computed(() => [
  ...new Set(props.payroll.filter((row) => !row.folha).map((row) => row.label)),
])
const showMonthly = computed(() => view.value === 'mensal' && props.payroll.length > 0)

// Informed minus calculated, ignoring differences under the R$ 0,10 rounding tolerance.
const delta = (informado: number, calculado: number) => {
  const diff = informado - calculado
  return Math.abs(diff) > 10 ? diff : 0
}
const deltaText = (diff: number) =>
  diff === 0
    ? 'Confere com o cálculo'
    : `${diff > 0 ? 'Acima' : 'Abaixo'} do cálculo em ${formatCurrency(Math.abs(diff))}`

const result = computed(() => (props.estimate?.ok ? props.estimate.result : null))
const headline = computed(() => (result.value ? describeTaxResult(result.value.resultado) : null))
const otherModel = computed(() =>
  result.value?.modelo === 'completo' ? result.value.simplificado : result.value?.completo,
)
</script>

<template>
  <section class="tax-estimate glass" aria-labelledby="tax-estimate-title" aria-live="polite">
    <p class="kicker">Estimativa do imposto</p>

    <div v-if="payroll.length" class="view-switch" role="group" aria-label="Visão da estimativa">
      <button type="button" :aria-pressed="view === 'anual'" @click="view = 'anual'">Anual</button>
      <button type="button" :aria-pressed="view === 'mensal'" @click="view = 'mensal'">
        Mensal
      </button>
    </div>

    <template v-if="showMonthly">
      <h2 id="tax-estimate-title" class="headline">
        <span>Cálculo mensal da folha</span>
      </h2>
      <p class="line">
        Supõe o mesmo salário em todos os meses. Na declaração vale o informe de rendimentos; aqui
        dá para conferir os números do holerite, com valores menores.
      </p>
      <section
        v-for="row in payroll"
        :key="row.id"
        class="payroll-row"
        :aria-label="`Folha mensal: ${row.label}`"
      >
        <h3>{{ row.label }}</h3>
        <p v-if="!row.folha" class="line">
          Sem cálculo mensal para esta categoria: ela tem regras próprias, que ficam fora do MVP.
          Vale o que foi informado (INSS {{ formatCurrency(row.informado.inss) }}, IR retido
          {{ formatCurrency(row.informado.irrf) }}).
        </p>
        <template v-else>
          <div class="table-scroll">
            <table>
              <caption class="sr-only">
                Cálculo da folha mensal de
                {{
                  row.label
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">Calculado</th>
                  <th scope="col">Informado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Salário bruto</th>
                  <td>{{ formatCurrency(row.folha.bruto) }}</td>
                  <td>{{ formatCurrency(row.informado.bruto) }}</td>
                </tr>
                <tr class="deduction">
                  <th scope="row">INSS</th>
                  <td>{{ formatCurrency(row.folha.inss) }}</td>
                  <td>{{ formatCurrency(row.informado.inss) }}</td>
                </tr>
                <tr class="deduction">
                  <th scope="row">Dependentes ({{ row.dependentes }})</th>
                  <td>{{ formatCurrency(row.deducaoDependentes) }}</td>
                  <td>—</td>
                </tr>
                <tr class="deduction">
                  <th scope="row">Pensão alimentícia</th>
                  <td>{{ formatCurrency(row.pensao) }}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row">
                    {{
                      row.folha.usouSimplificado
                        ? 'Desconto simplificado mensal'
                        : 'Total de deduções'
                    }}
                  </th>
                  <td>{{ formatCurrency(row.folha.deducaoUsada) }}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row">Base de cálculo</th>
                  <td>{{ formatCurrency(row.folha.base) }}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row">Alíquota da faixa</th>
                  <td>{{ formatRate(row.folha.aliquotaBp) }}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row">Imposto pela tabela</th>
                  <td>{{ formatCurrency(row.folha.impostoTabela) }}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row">Redução (Lei 15.270/2025)</th>
                  <td>− {{ formatCurrency(row.folha.reducao) }}</td>
                  <td>—</td>
                </tr>
                <tr class="total">
                  <th scope="row">IR retido na fonte</th>
                  <td>{{ formatCurrency(row.folha.irrf) }}</td>
                  <td>{{ formatCurrency(row.informado.irrf) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="line">
            INSS: {{ deltaText(delta(row.informado.inss, row.folha.inss)) }}. IR retido:
            {{ deltaText(delta(row.informado.irrf, row.folha.irrf)) }}.
          </p>
        </template>
      </section>
    </template>

    <p v-else-if="!estimate" id="tax-estimate-title" class="empty">
      Informe um rendimento para ver a estimativa da sua declaração.
    </p>

    <template v-else-if="!estimate.ok">
      <p id="tax-estimate-title" class="error" role="alert">
        Não foi possível calcular a estimativa. Confira os valores informados.
      </p>
      <small class="detail">{{ estimate.error }}</small>
    </template>

    <template v-else-if="result && headline && otherModel">
      <h2 id="tax-estimate-title" class="headline">
        <span>{{ headline.label }}</span>
        <strong v-if="headline.amount">{{ formatCurrency(headline.amount) }}</strong>
      </h2>
      <p class="line">
        Imposto devido {{ formatCurrency(result.impostoDevido) }} · já descontado na fonte
        {{ formatCurrency(result.irrfRetido) }}
      </p>
      <p class="line">Renda tributável do ano: {{ formatCurrency(result.rendimentos) }}</p>
      <p class="line">
        Modelo recomendado: <strong>{{ result.modelo }}</strong
        >. No outro modelo, o imposto devido seria {{ formatCurrency(otherModel.impostoDevido) }}.
      </p>
      <p v-if="result.modelo === 'simplificado' && result.faltaParaCompleto" class="line">
        Faltam {{ formatCurrency(result.faltaParaCompleto) }} em deduções para o modelo completo
        valer a pena.
      </p>

      <details class="calculation">
        <summary>Ver o cálculo</summary>
        <div class="table-scroll">
          <table>
            <caption class="sr-only">
              Cálculo do imposto nos dois modelos
            </caption>
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Completo</th>
                <th scope="col">Simplificado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Rendimentos tributáveis</th>
                <td>{{ formatCurrency(result.rendimentos) }}</td>
                <td>{{ formatCurrency(result.rendimentos) }}</td>
              </tr>
              <tr class="deduction">
                <th scope="row">INSS</th>
                <td>{{ formatCurrency(result.totalPrevidencia) }}</td>
                <td>—</td>
              </tr>
              <tr class="deduction">
                <th scope="row">Dependentes</th>
                <td>{{ formatCurrency(result.deducaoDependentes) }}</td>
                <td>—</td>
              </tr>
              <tr class="deduction">
                <th scope="row">Pensão alimentícia</th>
                <td>{{ formatCurrency(result.totalPensoes) }}</td>
                <td>—</td>
              </tr>
              <tr class="deduction">
                <th scope="row">Saúde</th>
                <td>{{ formatCurrency(result.totalSaude) }}</td>
                <td>—</td>
              </tr>
              <tr class="deduction">
                <th scope="row">Educação</th>
                <td>{{ formatCurrency(result.totalEducacao) }}</td>
                <td>—</td>
              </tr>
              <tr class="deduction">
                <th scope="row">Desconto simplificado (20%)</th>
                <td>—</td>
                <td>{{ formatCurrency(result.simplificado.deducoes) }}</td>
              </tr>
              <tr>
                <th scope="row">Total de deduções</th>
                <td>{{ formatCurrency(result.completo.deducoes) }}</td>
                <td>{{ formatCurrency(result.simplificado.deducoes) }}</td>
              </tr>
              <tr>
                <th scope="row">Base de cálculo</th>
                <td>{{ formatCurrency(result.completo.base) }}</td>
                <td>{{ formatCurrency(result.simplificado.base) }}</td>
              </tr>
              <tr>
                <th scope="row">Alíquota da faixa</th>
                <td>{{ formatRate(result.completo.aliquotaBp) }}</td>
                <td>{{ formatRate(result.simplificado.aliquotaBp) }}</td>
              </tr>
              <tr>
                <th scope="row">Imposto pela tabela</th>
                <td>{{ formatCurrency(result.completo.impostoTabela) }}</td>
                <td>{{ formatCurrency(result.simplificado.impostoTabela) }}</td>
              </tr>
              <tr>
                <th scope="row">Redução (Lei 15.270/2025)</th>
                <td>− {{ formatCurrency(result.completo.reducao) }}</td>
                <td>− {{ formatCurrency(result.simplificado.reducao) }}</td>
              </tr>
              <tr class="total">
                <th scope="row">Imposto devido</th>
                <td :class="{ chosen: result.modelo === 'completo' }">
                  {{ formatCurrency(result.completo.impostoDevido) }}
                </td>
                <td :class="{ chosen: result.modelo === 'simplificado' }">
                  {{ formatCurrency(result.simplificado.impostoDevido) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <dl class="outcome">
          <div>
            <dt>IR retido na fonte</dt>
            <dd>{{ formatCurrency(result.irrfRetido) }}</dd>
          </div>
          <div>
            <dt>Imposto devido no modelo {{ result.modelo }}</dt>
            <dd>{{ formatCurrency(result.impostoDevido) }}</dd>
          </div>
          <div>
            <dt>{{ headline.label }}</dt>
            <dd>{{ formatCurrency(headline.amount) }}</dd>
          </div>
        </dl>
      </details>
    </template>

    <p v-if="untreated.length" class="note" role="status">
      <strong>Tratado como salário: {{ untreated.join(', ') }}.</strong> Essas rendas têm regras
      próprias (o imposto pago no carnê-leão, por exemplo, não é descontado aqui), então o resultado
      pode estar acima ou abaixo do real.
    </p>
    <p class="note">
      Estimativa parcial: despesas de saúde e educação ainda não entram na conta, porque a tela de
      dedutíveis ainda não existe. Todas as rendas informadas são tratadas como rendimentos
      tributáveis; aluguéis, trabalho autônomo e aposentadoria têm regras próprias que ainda não são
      calculadas.
    </p>
    <p class="note">
      Estimativa. Não substitui a declaração oficial nem a orientação de um contador.
    </p>
  </section>
</template>

<style scoped>
.tax-estimate {
  display: grid;
  gap: 0.5rem;
  padding: 1.25rem;
  border-radius: 1.25rem;
}

.kicker {
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.headline {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  font-size: 1.1rem;
  line-height: 1.25;
}

.headline strong {
  color: var(--color-accent);
  font-size: 1.5rem;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.line,
.empty,
.detail {
  color: var(--color-text-muted);
  font-size: 0.88rem;
}

.line strong {
  color: var(--color-text);
}

.error {
  font-weight: 700;
}

.detail {
  overflow-wrap: anywhere;
}

.view-switch {
  display: inline-grid;
  grid-auto-flow: column;
  justify-self: start;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

.view-switch button {
  min-width: 5rem;
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.view-switch button[aria-pressed='true'] {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.payroll-row {
  display: grid;
  gap: 0.35rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--glass-border);
}

.payroll-row h3 {
  font-size: 0.95rem;
}

.calculation {
  margin-top: 0.5rem;
  border-top: 1px solid var(--glass-border);
  padding-top: 0.75rem;
}

.calculation summary {
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  color: var(--color-accent);
  font-weight: 700;
  cursor: pointer;
}

.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

th,
td {
  padding: 0.45rem 0.35rem;
  border-bottom: 1px solid var(--glass-border);
  text-align: right;
  white-space: nowrap;
}

thead th {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
}

tbody th {
  color: var(--color-text);
  font-weight: 600;
  text-align: left;
  white-space: normal;
}

.deduction th {
  padding-left: 1rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

.total th,
.total td {
  font-weight: 800;
}

td.chosen {
  color: var(--color-accent);
}

.outcome {
  display: grid;
  gap: 0.35rem;
  margin: 0.75rem 0 0;
}

.outcome div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.88rem;
}

.outcome dt {
  color: var(--color-text-muted);
}

.outcome dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.outcome div:last-child {
  padding-top: 0.35rem;
  border-top: 1px solid var(--glass-border);
}

.outcome div:last-child dd {
  color: var(--color-accent);
}

.note {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (min-width: 48rem) {
  .tax-estimate {
    padding: 1.5rem;
  }
}
</style>
