<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Money3Component } from 'v-money3'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import PageCard from '@/components/PageCard.vue'
import TaxEstimateCard from '@/components/TaxEstimateCard.vue'
import { parametros } from '@/irpf'
import { cents, formatCurrency, moneyConfig } from '@/utils/currency'
import {
  exclusiveTaxation,
  incomeCategoryLabels,
  incomeEntryError,
  incomeEntryWarnings,
  sourceTitle,
  type IncomeCategory,
  type IncomeRegistration,
  type RegisteredIncomeEntry,
  useIncomeStore,
} from '@/stores/income'

const incomeCategories = (Object.entries(incomeCategoryLabels) as [IncomeCategory, string][]).map(
  ([value, label]) => ({
    value,
    label,
  }),
)

const router = useRouter()
const incomeStore = useIncomeStore()
const dependentDeduction = parametros(2026).dependente
const confirmingDeleteId = ref<number | null>(null)
const salaryErrors = ref<Record<number, string>>({})
const isEditing = computed(() => incomeStore.draftEditingRegistrationId !== null)

// The payslip checks use the declaration's dependents for the holder's sources.
const incomeWarnings = (income: RegisteredIncomeEntry) =>
  incomeEntryWarnings(income, income.dependentId == null ? incomeStore.dependentCount : 0)

const fillFromSalary = (id: number) => {
  salaryErrors.value[id] = incomeStore.fillDraftIncomeFromSalary(id)
}

// "Empresa A e Empresa B": the sources a lançamento holds, for its delete confirmation.
const sourceList = (registration: IncomeRegistration) => {
  const names = registration.incomes.map(sourceTitle)
  const last = names[names.length - 1] ?? ''
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${last}` : last
}

const setConfirmingDelete = (registrationId: number, open: boolean) => {
  if (open) confirmingDeleteId.value = registrationId
  else if (confirmingDeleteId.value === registrationId) confirmingDeleteId.value = null
}

const goToForm = async () => {
  await nextTick()
  document.getElementById('income-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Editing loads the saved lançamento into the form, with every field.
const startEdit = (registrationId: number) => {
  confirmingDeleteId.value = null
  if (incomeStore.beginEditRegistration(registrationId)) void goToForm()
}

// "Lançar rendimento" starts a new one: leave edit mode first, or saving would overwrite the
// lançamento that was open.
const newIncome = async () => {
  if (isEditing.value) incomeStore.cancelEdit()
  await goToForm()
}

const updateExpected = (event: Event) => {
  incomeStore.setExpectedStatements(Number((event.target as HTMLInputElement).value))
}

// The store keeps the number between 0 and 20: show the one it kept ("25" typed at 20 stays 20).
const syncExpected = (event: Event) => {
  ;(event.target as HTMLInputElement).value = String(incomeStore.expectedStatements)
}

const saveIncome = () => {
  const wasEditing = isEditing.value
  if (!incomeStore.saveDraft()) return
  if (!wasEditing) router.push({ name: 'home' })
}
</script>

<template>
  <div class="income-page">
    <PageCard eyebrow="Declaração de 2027 · ano-calendário 2026" title="Rendas">
      <p class="intro">
        Informe os valores mensais de cada fonte, como estão no holerite, e acompanhe a estimativa
        ao longo do ano: ela conta 12 meses iguais e muda enquanto você digita. Quando o informe de
        rendimentos chegar, use os valores do ano divididos por 12.
      </p>

      <section class="statements-summary glass" aria-labelledby="statements-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Total</p>
            <h2 id="statements-title">Rendimentos no ano</h2>
          </div>
          <strong class="statements-total">{{ formatCurrency(incomeStore.taxableTotal) }}</strong>
        </div>
        <p class="statements-counter" role="status">
          {{ incomeStore.statementCount }} de {{ incomeStore.expectedStatements }}
          {{ incomeStore.expectedStatements === 1 ? 'empresa lançada' : 'empresas lançadas' }}
        </p>
        <label class="field-label" for="expected-statements">
          Quantas empresas te pagaram salário em 2026?
        </label>
        <input
          id="expected-statements"
          :value="incomeStore.expectedStatements"
          class="field-control count-control"
          type="number"
          min="0"
          max="20"
          inputmode="numeric"
          @input="updateExpected"
          @change="syncExpected"
        />
        <button class="add-button" type="button" @click="newIncome">
          <span aria-hidden="true">+</span>
          Lançar rendimento
        </button>
      </section>

      <section
        v-if="incomeStore.registrations.length"
        class="saved-section glass"
        aria-labelledby="saved-income-title"
      >
        <div class="section-heading">
          <div>
            <p class="section-kicker">Lançados</p>
            <h2 id="saved-income-title">Fontes pagadoras</h2>
          </div>
          <span class="section-status">{{ incomeStore.registrations.length }}</span>
        </div>
        <div class="saved-registration-list">
          <article
            v-for="(registration, registrationIndex) in incomeStore.registrations"
            :key="registration.id"
            class="saved-registration"
            :class="{ editing: incomeStore.draftEditingRegistrationId === registration.id }"
          >
            <div
              v-for="income in registration.incomes"
              :key="income.id"
              class="saved-income source-card"
            >
              <div class="entry-topline">
                <strong class="source-name">{{ sourceTitle(income) }}</strong>
                <span class="source-owner">{{ incomeStore.incomeOwner(income) }}</span>
              </div>
              <div class="saved-entry">
                <span>Rendimento mensal</span>
                <strong>{{ formatCurrency(cents(income.amount)) }}</strong>
              </div>
              <div class="saved-entry saved-entry-detail">
                <span>INSS no mês</span>
                <strong>{{ formatCurrency(cents(income.inss)) }}</strong>
              </div>
              <div class="saved-entry saved-entry-detail">
                <span>IR retido no mês</span>
                <strong>{{ formatCurrency(cents(income.irrf)) }}</strong>
              </div>
              <p v-if="exclusiveTaxation(income)" class="exclusive-note">
                <template v-if="cents(income.thirteenth ?? '')">
                  13º {{ formatCurrency(cents(income.thirteenth ?? '')) }}
                </template>
                <template
                  v-if="cents(income.thirteenth ?? '') && cents(income.profitSharing ?? '')"
                >
                  ·
                </template>
                <template v-if="cents(income.profitSharing ?? '')">
                  PLR {{ formatCurrency(cents(income.profitSharing ?? '')) }}
                </template>
                — valores do ano, não entram no ajuste
              </p>
            </div>
            <div
              class="saved-actions"
              :class="{ confirming: confirmingDeleteId === registration.id }"
            >
              <button
                v-if="confirmingDeleteId !== registration.id"
                class="edit-button"
                type="button"
                :aria-label="`Editar lançamento ${registrationIndex + 1}`"
                @click="startEdit(registration.id)"
              >
                Editar
              </button>
              <ConfirmDelete
                :open="confirmingDeleteId === registration.id"
                :item-label="`o lançamento ${registrationIndex + 1}`"
                @update:open="setConfirmingDelete(registration.id, $event)"
                @confirm="incomeStore.removeRegistration(registration.id)"
              >
                <p>Saem da estimativa: {{ sourceList(registration) }}.</p>
              </ConfirmDelete>
            </div>
          </article>
        </div>
        <p v-if="incomeStore.exclusiveTaxationTotal" class="field-help">
          13º e PLR somam {{ formatCurrency(incomeStore.exclusiveTaxationTotal) }} no ano e não
          entram no ajuste: têm tributação exclusiva na fonte.
        </p>
      </section>

      <section class="form-section glass" aria-labelledby="income-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">{{ isEditing ? 'Editando' : 'Novo' }}</p>
            <h2 id="income-title">
              {{ isEditing ? 'Editar lançamento' : 'Lançar rendimento' }}
            </h2>
          </div>
          <span class="section-status">Valores mensais</span>
        </div>

        <div class="entry-list">
          <article
            v-for="(income, index) in incomeStore.draftIncomes"
            :key="income.id"
            class="entry-card"
          >
            <div class="entry-topline">
              <span>Fonte pagadora {{ index + 1 }}</span>
              <button
                v-if="incomeStore.draftIncomes.length > 1"
                class="remove-button"
                type="button"
                :aria-label="`Remover fonte pagadora ${index + 1}`"
                @click="incomeStore.removeDraftIncome(income.id)"
              >
                Remover
              </button>
            </div>
            <label class="field-label" :for="`income-employer-${income.id}`">
              Nome da empresa <small class="informe-ref">Informe: quadro 1</small>
            </label>
            <input
              :id="`income-employer-${income.id}`"
              v-model="income.employer"
              class="field-control"
              autocomplete="organization"
              maxlength="80"
            />
            <label class="field-label" :for="`income-owner-${income.id}`"
              >De quem é o rendimento?</label
            >
            <select
              :id="`income-owner-${income.id}`"
              v-model="income.dependentId"
              class="field-control"
            >
              <option :value="null">Titular</option>
              <option
                v-for="dependent in incomeStore.dependents"
                :key="dependent.id"
                :value="dependent.id"
              >
                {{ dependent.apelido
                }}{{
                  dependent.em_outra_declaracao ? ' (em outra declaração — não entra na conta)' : ''
                }}
              </option>
            </select>
            <label class="field-label" :for="`income-type-${income.id}`">Categoria</label>
            <select
              :id="`income-type-${income.id}`"
              v-model="income.category"
              class="field-control"
            >
              <option
                v-for="category in incomeCategories"
                :key="category.value"
                :value="category.value"
              >
                {{ category.label }}
              </option>
            </select>
            <label class="field-label" :for="`income-amount-${income.id}`">
              Valor mensal
              <small class="informe-ref">Informe: quadro 3, linha 01 ÷ 12</small>
            </label>
            <Money3Component
              :id="`income-amount-${income.id}`"
              class="field-control currency-input"
              inputmode="numeric"
              autocomplete="off"
              v-model="income.amount"
              v-bind="moneyConfig"
            />
            <div class="withheld-grid">
              <div>
                <label class="field-label" :for="`income-inss-${income.id}`">
                  INSS descontado no mês
                  <small class="informe-ref">Informe: quadro 3, linha 02 ÷ 12</small>
                </label>
                <Money3Component
                  :id="`income-inss-${income.id}`"
                  class="field-control currency-input"
                  inputmode="numeric"
                  autocomplete="off"
                  v-model="income.inss"
                  v-bind="moneyConfig"
                />
              </div>
              <div>
                <label class="field-label" :for="`income-irrf-${income.id}`">
                  IR retido na fonte no mês
                  <small class="informe-ref">Informe: quadro 3, linha 05 ÷ 12</small>
                </label>
                <Money3Component
                  :id="`income-irrf-${income.id}`"
                  class="field-control currency-input"
                  inputmode="numeric"
                  autocomplete="off"
                  v-model="income.irrf"
                  v-bind="moneyConfig"
                />
              </div>
            </div>
            <template v-if="income.category === 'clt'">
              <button
                class="add-button salary-button"
                type="button"
                :disabled="!cents(income.amount)"
                @click="fillFromSalary(income.id)"
              >
                Calcular INSS e IR pelo salário
              </button>
              <p class="field-help">
                Supõe o mesmo salário todos os meses e considera os dependentes. A pensão paga é
                lançada em Despesas e entra no ajuste da declaração, não nesta simulação mensal.
              </p>
            </template>
            <p v-if="salaryErrors[income.id]" class="field-error" role="alert">
              Não foi possível calcular pelo salário. {{ salaryErrors[income.id] }}
            </p>

            <fieldset class="exclusive-fields">
              <legend>
                13º e PLR <small class="informe-ref">valores do ano, não entram no ajuste</small>
              </legend>
              <div class="withheld-grid">
                <div>
                  <label class="field-label" :for="`income-thirteenth-${income.id}`">
                    13º salário <small class="informe-ref">Informe: quadro 5, linha 01</small>
                  </label>
                  <Money3Component
                    :id="`income-thirteenth-${income.id}`"
                    class="field-control currency-input"
                    inputmode="numeric"
                    autocomplete="off"
                    :model-value="income.thirteenth ?? ''"
                    @update:model-value="income.thirteenth = String($event)"
                    v-bind="moneyConfig"
                  />
                </div>
                <div>
                  <label class="field-label" :for="`income-thirteenth-irrf-${income.id}`">
                    IRRF sobre o 13º <small class="informe-ref">Informe: quadro 5, linha 02</small>
                  </label>
                  <Money3Component
                    :id="`income-thirteenth-irrf-${income.id}`"
                    class="field-control currency-input"
                    inputmode="numeric"
                    autocomplete="off"
                    :model-value="income.thirteenthIrrf ?? ''"
                    @update:model-value="income.thirteenthIrrf = String($event)"
                    v-bind="moneyConfig"
                  />
                </div>
              </div>
              <label class="field-label" :for="`income-plr-${income.id}`">
                PLR, se houver
                <small class="informe-ref">Informe: quadro 5, linha 03 ("Outros")</small>
              </label>
              <Money3Component
                :id="`income-plr-${income.id}`"
                class="field-control currency-input"
                inputmode="numeric"
                autocomplete="off"
                :model-value="income.profitSharing ?? ''"
                @update:model-value="income.profitSharing = String($event)"
                v-bind="moneyConfig"
              />
            </fieldset>

            <p v-if="incomeEntryError(income)" class="field-error" role="alert">
              {{ incomeEntryError(income) }}
            </p>
            <p
              v-for="warning in incomeWarnings(income)"
              :key="warning"
              class="field-warning"
              role="status"
            >
              {{ warning }}
            </p>
          </article>
        </div>

        <p class="field-help">
          A pensão alimentícia e o plano de saúde descontados em folha (no informe, quadro 3, linha
          04, e quadro 7) vão em <RouterLink :to="{ name: 'deductions' }">Despesas</RouterLink>, a
          cada pagamento, e não aqui.
        </p>

        <p v-if="incomeStore.summaryInssWarning" class="field-warning" role="status">
          {{ incomeStore.summaryInssWarning }}
        </p>

        <button class="add-button" type="button" @click="incomeStore.addDraftIncome">
          <span aria-hidden="true">+</span>
          Adicionar outra fonte neste lançamento
        </button>
      </section>

      <section class="form-section glass" aria-labelledby="dependents-title">
        <h2 id="dependents-title">Possui dependentes?</h2>
        <p>
          Cadastre cada pessoa pelo apelido. Cada dependente válido deduz
          {{ formatCurrency(dependentDeduction) }} por ano no modelo completo.
        </p>
        <p>
          {{ incomeStore.dependents.length }} cadastrado(s),
          {{ incomeStore.dependentCount }} válido(s) para esta declaração.
        </p>
        <RouterLink class="button" :to="{ name: 'dependents' }"
          >Cadastrar ou gerenciar dependentes</RouterLink
        >
        <p v-if="incomeStore.pendingDependents.length" class="field-warning" role="status">
          Estimativa provisória: falta lançar o informe de
          {{ incomeStore.pendingDependents.map((dependent) => dependent.apelido).join(', ') }}.
          Selecione o apelido em “De quem é o rendimento?” e salve o lançamento.
        </p>
      </section>

      <footer class="summary-card" aria-labelledby="summary-title">
        <div class="summary-heading">
          <div>
            <p class="section-kicker">Resumo</p>
            <h2 id="summary-title">Visão geral</h2>
          </div>
          <span class="summary-badge">IRPF</span>
        </div>
        <dl class="summary-list">
          <div>
            <dt>
              Total anual de Rendimentos Tributáveis
              <small>Titular + rendas tributáveis dos dependentes</small>
            </dt>
            <dd>{{ formatCurrency(incomeStore.summaryTaxableTotal) }}</dd>
          </div>
          <div>
            <dt>
              Total anual de Rendimentos Isentos
              <small>Pensão alimentícia</small>
            </dt>
            <dd>{{ formatCurrency(incomeStore.exemptTotal) }}</dd>
          </div>
          <div>
            <dt>
              Dependentes para dedução
              <small>Valem para a declaração inteira</small>
            </dt>
            <dd>{{ incomeStore.dependentCount }}</dd>
          </div>
        </dl>
      </footer>
      <TaxEstimateCard
        :estimate="incomeStore.summaryTaxEstimate"
        :payroll="incomeStore.summaryPayroll"
      />
      <button
        class="button add-registration-button"
        type="button"
        :disabled="!incomeStore.canSaveDraft"
        @click="saveIncome"
      >
        {{ isEditing ? 'Salvar alterações' : 'Adicionar' }}
      </button>
      <button
        v-if="isEditing"
        class="button secondary add-registration-button"
        type="button"
        @click="incomeStore.cancelEdit"
      >
        Cancelar edição
      </button>
    </PageCard>
  </div>
</template>

<style scoped>
.income-page {
  display: grid;
  justify-items: center;
  width: 100%;
}

.income-page :deep(.page-card) {
  max-width: 52rem;
  padding: 1.25rem;
  text-align: left;
}

.income-page :deep(.body) {
  justify-items: stretch;
}

.section-kicker {
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.intro {
  max-width: 36rem;
  margin-top: 0.75rem;
  color: var(--color-text-muted);
}

.form-section,
.summary-card,
.saved-section {
  padding: 1.25rem;
  border-radius: 1.25rem;
}

.section-heading,
.summary-heading,
.entry-topline,
.toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

h2 {
  margin-top: 0.15rem;
  font-size: 1.2rem;
  line-height: 1.2;
}

.section-status,
.summary-badge {
  flex-shrink: 0;
  padding: 0.3rem 0.6rem;
  border: 1px solid color-mix(in srgb, var(--color-accent), transparent 65%);
  border-radius: 999px;
  color: var(--color-accent);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}

.section-status.optional {
  color: var(--color-text-muted);
  border-color: var(--glass-border);
}

.entry-list,
.dependent-list,
.saved-registration-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.dependent-list {
  max-height: min(34rem, 55vh);
  overflow-y: auto;
  padding-right: 0.25rem;
}

.entry-card,
.dependent-card,
.saved-registration {
  padding: 1rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.9rem;
  background: var(--glass-bg-raised-solid);
}

.saved-section {
  margin-top: 1rem;
}

.saved-registration-list {
  max-height: min(24rem, 45vh);
  overflow-y: auto;
  padding-right: 0.25rem;
}

.saved-entry-list {
  display: grid;
  gap: 0.45rem;
}

.saved-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.saved-entry strong {
  color: var(--color-text);
  white-space: nowrap;
}

.saved-money-input {
  width: min(100%, 14rem);
  min-width: 0;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  background: var(--glass-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  text-align: right;
}

.edit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.entry-topline {
  align-items: center;
  margin-bottom: 1rem;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
}

.saved-registration .entry-topline {
  flex-wrap: wrap;
}

.saved-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  /* Stays on the right when the row wraps on a narrow phone. */
  margin-left: auto;
}

/* The delete confirmation takes the whole row under the title. */
.saved-actions.confirming {
  flex-basis: 100%;
  text-transform: none;
  font-weight: 400;
  font-size: 1rem;
}

.remove-button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: 0 0.5rem;
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.edit-button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: 0 0.5rem;
  border: 0;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.field-label {
  display: block;
  margin: 0.85rem 0 0.35rem;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.field-control {
  width: 100%;
  min-height: 2.9rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.65rem;
  background: var(--glass-bg-raised);
  color: var(--color-text);
  font: inherit;
}

select.field-control,
select.field-control option {
  background-color: var(--glass-bg-raised-solid);
  color: var(--color-text);
}

.currency-input {
  max-width: 100%;
  min-width: 0;
  /* The plain accent is just under 4.5:1 on the dark input background */
  color: color-mix(in srgb, var(--color-accent), var(--color-text) 30%);
  font-size: clamp(0.9rem, 4vw, 1.15rem);
  font-weight: 750;
  text-align: right;
}

.add-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  margin-top: 1rem;
  padding: 0.5rem 0;
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.add-button span {
  font-size: 1.35rem;
  line-height: 1;
}

.toggle-row {
  align-items: center;
  margin-top: 1.25rem;
}

.toggle-row strong {
  font-size: 0.95rem;
}

.toggle-row p,
.empty-state,
.exempt-note,
.summary-list small {
  margin-top: 0.2rem;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

/* The padding makes the touch target 44 px tall (RF-09) without changing the drawn toggle. */
.switch {
  position: relative;
  display: block;
  box-sizing: content-box;
  width: 3.2rem;
  height: 1.8rem;
  padding: 0.5rem 0.25rem;
  flex-shrink: 0;
}

.switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.switch span:not(.sr-only) {
  position: absolute;
  inset: 0.5rem 0.25rem;
  border-radius: 999px;
  background: var(--color-text-muted);
  cursor: pointer;
  transition: background 180ms ease;
}

.switch span:not(.sr-only)::after {
  position: absolute;
  top: 0.2rem;
  left: 0.2rem;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--color-on-accent);
  content: '';
  transition: transform 180ms ease;
}

.switch input:checked + span {
  background: var(--color-accent);
}

.switch input:checked + span::after {
  transform: translateX(1.4rem);
}

/* The real checkbox is invisible, so the drawn toggle shows the keyboard focus. */
.switch input:focus-visible + span {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.dependents-content {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--glass-border);
}

.count-control {
  max-width: 8rem;
}

.dependent-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
}

.dependent-number {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.65rem;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-size: 0.8rem;
  font-weight: 800;
}

.dependent-fields {
  min-width: 0;
}

.exempt-note {
  color: var(--color-accent);
  font-weight: 700;
}

.empty-state {
  padding: 1rem 0 0;
}

.summary-card {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.summary-card .section-kicker,
.summary-card small {
  /* 10% keeps the muted text above 4.5:1 on the accent background */
  color: color-mix(in srgb, var(--color-on-accent), transparent 10%);
}

.summary-badge {
  border-color: color-mix(in srgb, var(--color-on-accent), transparent 60%);
  color: inherit;
}

.summary-list {
  display: grid;
  gap: 1rem;
  margin: 1.25rem 0 0;
}

.summary-list div {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.1rem 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid color-mix(in srgb, var(--color-on-accent), transparent 70%);
}

.summary-list dt {
  font-size: 0.84rem;
  font-weight: 700;
}

.summary-list dd {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  align-self: center;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  text-align: right;
}

.summary-list small {
  display: block;
  font-weight: 400;
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
  .income-page :deep(.page-card) {
    padding: 1.5rem;
  }

  .form-section,
  .summary-card {
    padding: 1.5rem;
  }
}

.saved-income {
  display: grid;
  gap: 0.2rem;
}

.dependent-income-badge {
  justify-self: start;
  max-width: 100%;
  margin-bottom: 0.35rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--color-accent), transparent 70%);
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--color-accent), transparent 92%);
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.saved-entry-detail {
  padding-left: 0.75rem;
  font-size: 0.76rem;
}

.withheld-grid {
  display: grid;
  gap: 0 0.75rem;
}

.field-help {
  margin-top: 0.35rem;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.field-error {
  margin-top: 0.35rem;
  color: var(--color-danger);
  font-size: 0.8rem;
  font-weight: 700;
}

.field-warning {
  margin-top: 0.35rem;
  padding-left: 0.6rem;
  border-left: 3px solid var(--color-accent);
  color: var(--color-text);
  font-size: 0.8rem;
}

.salary-button {
  margin-top: 0.5rem;
  min-height: 2.75rem;
}

.salary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (min-width: 30rem) {
  .withheld-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.add-registration-button {
  width: 100%;
}

.add-registration-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.statements-summary {
  display: grid;
  gap: 0.5rem;
  width: 100%;
  padding: 1.25rem;
  border-radius: 1.25rem;
  text-align: left;
}

.statements-total {
  font-size: 1.25rem;
}

.statements-counter {
  font-weight: 600;
}

.informe-ref {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.exclusive-fields {
  display: grid;
  gap: 0.25rem;
  margin: 0.75rem 0 0;
  padding: 0.75rem;
  border: 1px dashed var(--glass-border, rgb(127 127 127 / 0.35));
  border-radius: 0.875rem;
}

.exclusive-fields legend {
  padding: 0 0.25rem;
  font-weight: 600;
}

.exclusive-note {
  margin-top: 0.25rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.source-card + .source-card {
  margin-top: 0.75rem;
}

.source-owner {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
