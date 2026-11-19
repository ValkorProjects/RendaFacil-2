<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Money3Component } from 'v-money3'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import PageCard from '@/components/PageCard.vue'
import TaxEstimateCard from '@/components/TaxEstimateCard.vue'
import { parametros } from '@/irpf'
import { cents, formatCurrency, moneyConfig } from '@/utils/currency'
import {
  incomeCategoryLabels,
  incomeEntryError,
  incomeEntryWarnings,
  type IncomeCategory,
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
const editingRegistrationId = ref<number | null>(null)
const confirmingDeleteId = ref<number | null>(null)
const editingIncomes = ref<RegisteredIncomeEntry[]>([])
const salaryErrors = ref<Record<number, string>>({})

// The payslip checks use the declaration's dependents and alimony, whichever source it is.
const incomeWarnings = (income: RegisteredIncomeEntry | undefined) =>
  income
    ? incomeEntryWarnings(
        income,
        income.dependentId == null ? incomeStore.dependentCount : 0,
        income.dependentId == null ? incomeStore.household.alimonyPaid : '',
      )
    : []

const fillFromSalary = (id: number) => {
  salaryErrors.value[id] = incomeStore.fillDraftIncomeFromSalary(id)
}

const setConfirmingDelete = (registrationId: number, open: boolean) => {
  if (open) confirmingDeleteId.value = registrationId
  else if (confirmingDeleteId.value === registrationId) confirmingDeleteId.value = null
}

const startInlineEdit = (registrationId: number) => {
  const registration = incomeStore.registrations.find((item) => item.id === registrationId)
  if (!registration) return

  confirmingDeleteId.value = null
  editingRegistrationId.value = registrationId
  editingIncomes.value = registration.incomes.map((income) => ({ ...income }))
}

const cancelInlineEdit = () => {
  editingRegistrationId.value = null
  editingIncomes.value = []
}

const canSaveInlineEdit = computed(
  () =>
    editingIncomes.value.some((income) => cents(income.amount) > 0) &&
    editingIncomes.value.every((income) => !incomeEntryError(income)),
)

const updateEditingIncome = (
  index: number,
  field: 'amount' | 'inss' | 'irrf',
  value: string | number,
) => {
  const income = editingIncomes.value[index]
  if (income) income[field] = String(value)
}

const setEditingOwner = (index: number, event: Event) => {
  const income = editingIncomes.value[index]
  const value = (event.target as HTMLSelectElement).value
  if (income) income.dependentId = value === '' ? null : Number(value)
}

const saveInlineEdit = () => {
  if (editingRegistrationId.value === null || !canSaveInlineEdit.value) return

  incomeStore.updateRegistration({
    id: editingRegistrationId.value,
    incomes: editingIncomes.value.filter((income) => cents(income.amount) > 0),
  })
  cancelInlineEdit()
}

const saveIncomeAndReturn = () => {
  if (incomeStore.saveDraft()) router.push({ name: 'home' })
}
</script>

<template>
  <div class="income-page">
    <PageCard eyebrow="Declaração anual" title="Cadastro de rendimentos">
      <p class="intro">
        Informe os valores mensais recebidos para preparar sua declaração anual de IRPF. A
        estimativa do imposto, no fim da página, muda enquanto você digita.
      </p>

      <section
        v-if="incomeStore.registrations.length"
        class="saved-section glass"
        aria-labelledby="saved-income-title"
      >
        <div class="section-heading">
          <div>
            <p class="section-kicker">Cadastros</p>
            <h2 id="saved-income-title">Rendimentos adicionados</h2>
          </div>
          <span class="section-status">{{ incomeStore.registrations.length }}</span>
        </div>
        <div class="saved-registration-list">
          <article
            v-for="(registration, registrationIndex) in incomeStore.registrations"
            :key="registration.id"
            class="saved-registration"
            :class="{ editing: editingRegistrationId === registration.id }"
          >
            <div class="entry-topline">
              <span>Cadastro de rendimentos</span>
              <div
                class="saved-actions"
                :class="{ confirming: confirmingDeleteId === registration.id }"
              >
                <template v-if="editingRegistrationId === registration.id">
                  <button
                    class="edit-button"
                    type="button"
                    :disabled="!canSaveInlineEdit"
                    @click="saveInlineEdit"
                  >
                    Salvar
                  </button>
                  <button class="remove-button" type="button" @click="cancelInlineEdit">
                    Cancelar
                  </button>
                </template>
                <button
                  v-else-if="confirmingDeleteId !== registration.id"
                  class="edit-button"
                  type="button"
                  :aria-label="`Editar cadastro de rendimentos ${registrationIndex + 1}`"
                  @click="startInlineEdit(registration.id)"
                >
                  Editar
                </button>
                <ConfirmDelete
                  v-if="editingRegistrationId !== registration.id"
                  :open="confirmingDeleteId === registration.id"
                  :item-label="`o cadastro de rendimentos ${registrationIndex + 1}`"
                  @update:open="setConfirmingDelete(registration.id, $event)"
                  @confirm="incomeStore.removeRegistration(registration.id)"
                >
                  <p>Os rendimentos deste cadastro saem da estimativa.</p>
                </ConfirmDelete>
              </div>
            </div>
            <div class="saved-entry-list">
              <div
                v-for="(income, index) in registration.incomes"
                :key="income.id"
                class="saved-income"
              >
                <span v-if="income.dependentId != null" class="dependent-income-badge">
                  Dependente: {{ incomeStore.incomeOwner(income) }}
                </span>
                <div class="saved-entry">
                  <span>
                    {{ incomeCategoryLabels[income.category] }}
                    <template v-if="income.dependentId == null"> · Titular</template>
                  </span>
                  <Money3Component
                    v-if="editingRegistrationId === registration.id"
                    :model-value="editingIncomes[index]?.amount ?? ''"
                    class="saved-money-input"
                    v-bind="moneyConfig"
                    inputmode="numeric"
                    aria-label="Editar valor do rendimento"
                    @update:model-value="updateEditingIncome(index, 'amount', $event)"
                  />
                  <strong v-else>{{ formatCurrency(cents(income.amount)) }}</strong>
                </div>
                <div
                  v-if="editingRegistrationId === registration.id && editingIncomes[index]"
                  class="saved-entry"
                >
                  <label :for="`edit-owner-${income.id}`">De quem é o rendimento?</label>
                  <select
                    :id="`edit-owner-${income.id}`"
                    :value="editingIncomes[index]?.dependentId ?? ''"
                    class="field-control"
                    @change="setEditingOwner(index, $event)"
                  >
                    <option value="">Titular</option>
                    <option
                      v-for="dependent in incomeStore.dependents"
                      :key="dependent.id"
                      :value="dependent.id"
                    >
                      {{ dependent.apelido }}
                    </option>
                  </select>
                </div>
                <div class="saved-entry saved-entry-detail">
                  <span>INSS por mês</span>
                  <Money3Component
                    v-if="editingRegistrationId === registration.id"
                    :model-value="editingIncomes[index]?.inss ?? ''"
                    class="saved-money-input"
                    v-bind="moneyConfig"
                    inputmode="numeric"
                    aria-label="Editar INSS do rendimento"
                    @update:model-value="updateEditingIncome(index, 'inss', $event)"
                  />
                  <strong v-else>{{ formatCurrency(cents(income.inss)) }}</strong>
                </div>
                <div class="saved-entry saved-entry-detail">
                  <span>IR retido por mês</span>
                  <Money3Component
                    v-if="editingRegistrationId === registration.id"
                    :model-value="editingIncomes[index]?.irrf ?? ''"
                    class="saved-money-input"
                    v-bind="moneyConfig"
                    inputmode="numeric"
                    aria-label="Editar IR retido do rendimento"
                    @update:model-value="updateEditingIncome(index, 'irrf', $event)"
                  />
                  <strong v-else>{{ formatCurrency(cents(income.irrf)) }}</strong>
                </div>
                <p
                  v-if="
                    editingRegistrationId === registration.id &&
                    editingIncomes[index] &&
                    incomeEntryError(editingIncomes[index])
                  "
                  class="field-error"
                  role="alert"
                >
                  {{ incomeEntryError(editingIncomes[index]) }}
                </p>
                <template v-if="editingRegistrationId === registration.id">
                  <p
                    v-for="warning in incomeWarnings(editingIncomes[index])"
                    :key="warning"
                    class="field-warning"
                    role="status"
                  >
                    {{ warning }}
                  </p>
                </template>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="form-section glass" aria-labelledby="income-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">01</p>
            <h2 id="income-title">Rendimentos do titular e dos dependentes</h2>
          </div>
          <span class="section-status">Obrigatório</span>
        </div>

        <div class="entry-list">
          <article
            v-for="(income, index) in incomeStore.draftIncomes"
            :key="income.id"
            class="entry-card"
          >
            <div class="entry-topline">
              <span>Fonte de renda {{ index + 1 }}</span>
              <button
                v-if="incomeStore.draftIncomes.length > 1"
                class="remove-button"
                type="button"
                :aria-label="`Remover fonte de renda ${index + 1}`"
                @click="incomeStore.removeDraftIncome(income.id)"
              >
                Remover
              </button>
            </div>
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
            <label class="field-label" :for="`income-amount-${income.id}`">Valor mensal</label>
            <Money3Component
              :id="`income-amount-${income.id}`"
              class="field-control currency-input"
              inputmode="numeric"
              autocomplete="off"
              v-model="income.amount"
              v-bind="moneyConfig"
              aria-label="Valor mensal em reais"
            />
            <div class="withheld-grid">
              <div>
                <label class="field-label" :for="`income-inss-${income.id}`">
                  INSS descontado no mês
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
            <p class="field-help">
              Os dois estão no holerite. Com o informe de rendimentos, use os valores do ano
              divididos por 12.
            </p>
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
                Supõe o mesmo salário todos os meses e usa os dependentes e a pensão informados
                abaixo.
              </p>
            </template>
            <p v-if="salaryErrors[income.id]" class="field-error" role="alert">
              Não foi possível calcular pelo salário. {{ salaryErrors[income.id] }}
            </p>
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

        <p v-if="incomeStore.summaryInssWarning" class="field-warning" role="status">
          {{ incomeStore.summaryInssWarning }}
        </p>

        <button class="add-button" type="button" @click="incomeStore.addDraftIncome">
          <span aria-hidden="true">+</span>
          Adicionar outro rendimento
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

      <section class="form-section glass" aria-labelledby="alimony-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">03</p>
            <h2 id="alimony-title">Pensão alimentícia paga</h2>
          </div>
          <span class="section-status optional">Opcional</span>
        </div>
        <p class="field-help">
          Só deduz a pensão fixada por decisão judicial, acordo homologado na Justiça ou escritura
          pública. A pensão recebida deve ser lançada em Rendas, na categoria isenta e com o
          beneficiário correto.
        </p>
        <p class="field-help">
          Informe o total pago por mês uma vez só: vale para a declaração inteira, não para cada
          fonte de renda.
        </p>
        <label class="field-label" for="alimony-amount">Valor mensal</label>
        <Money3Component
          id="alimony-amount"
          class="field-control currency-input"
          inputmode="numeric"
          autocomplete="off"
          v-model="incomeStore.alimonyPaid"
          v-bind="moneyConfig"
        />
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
        @click="saveIncomeAndReturn"
      >
        Adicionar
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
</style>
