<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Money3Component } from 'v-money3'
import PageCard from '@/components/PageCard.vue'
import { cents, formatCurrency, moneyConfig } from '@/utils/currency'
import {
  dependentIncomeLabels,
  incomeCategoryLabels,
  type DependentIncome,
  type IncomeCategory,
  type RegisteredDependent,
  type RegisteredIncomeEntry,
  useIncomeStore,
} from '@/stores/income'

const incomeCategories = (Object.entries(incomeCategoryLabels) as [IncomeCategory, string][]).map(
  ([value, label]) => ({
    value,
    label,
  }),
)

const dependentIncomeTypes = (
  Object.entries(dependentIncomeLabels) as [DependentIncome, string][]
).map(([value, label]) => ({
  value,
  label,
}))

const router = useRouter()
const incomeStore = useIncomeStore()
const editingRegistrationId = ref<number | null>(null)
const editingIncomes = ref<RegisteredIncomeEntry[]>([])
const editingDependents = ref<RegisteredDependent[]>([])

const updateDependentCount = (event: Event) => {
  incomeStore.setDraftDependentCount(Number((event.target as HTMLInputElement).value))
}

const updateHasDependents = (event: Event) => {
  incomeStore.setDraftHasDependents((event.target as HTMLInputElement).checked)
}

const startInlineEdit = (registrationId: number) => {
  const registration = incomeStore.registrations.find((item) => item.id === registrationId)
  if (!registration) return

  editingRegistrationId.value = registrationId
  editingIncomes.value = registration.incomes.map((income) => ({ ...income }))
  editingDependents.value = registration.dependents.map((dependent) => ({ ...dependent }))
}

const cancelInlineEdit = () => {
  editingRegistrationId.value = null
  editingIncomes.value = []
  editingDependents.value = []
}

const canSaveInlineEdit = computed(
  () =>
    editingIncomes.value.some((income) => cents(income.amount) > 0) ||
    editingDependents.value.some((dependent) => cents(dependent.amount) > 0),
)

const updateEditingIncomeAmount = (index: number, amount: string | number) => {
  const income = editingIncomes.value[index]
  if (income) income.amount = String(amount)
}

const updateEditingDependentAmount = (index: number, amount: string | number) => {
  const dependent = editingDependents.value[index]
  if (dependent) dependent.amount = String(amount)
}

const saveInlineEdit = () => {
  if (editingRegistrationId.value === null || !canSaveInlineEdit.value) return

  incomeStore.updateRegistration({
    id: editingRegistrationId.value,
    incomes: editingIncomes.value.filter((income) => cents(income.amount) > 0),
    dependents: editingDependents.value.filter((dependent) => cents(dependent.amount) > 0),
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
        Informe os valores mensais recebidos para preparar sua declaração anual de IRPF.
      </p>

      <section v-if="incomeStore.registrations.length" class="saved-section glass" aria-labelledby="saved-income-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Cadastros</p>
            <h2 id="saved-income-title">Rendimentos adicionados</h2>
          </div>
          <span class="section-status">{{ incomeStore.registrations.length }}</span>
        </div>
        <div class="saved-registration-list">
          <article
            v-for="registration in incomeStore.registrations"
            :key="registration.id"
            class="saved-registration"
            :class="{ editing: editingRegistrationId === registration.id }"
          >
            <div class="entry-topline">
              <span>Cadastro de rendimentos</span>
              <div class="saved-actions">
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
                  v-else
                  class="edit-button"
                  type="button"
                  :aria-label="`Editar cadastro de rendimentos ${registration.id}`"
                  @click="startInlineEdit(registration.id)"
                >
                  Editar
                </button>
                <button
                  v-if="editingRegistrationId !== registration.id"
                  class="remove-button"
                  type="button"
                  :aria-label="`Remover cadastro de rendimentos ${registration.id}`"
                  @click="incomeStore.removeRegistration(registration.id)"
                >
                  Remover
                </button>
              </div>
            </div>
            <div class="saved-entry-list">
              <div
                v-for="(income, index) in registration.incomes"
                :key="income.id"
                class="saved-entry"
              >
                <span>{{ incomeCategoryLabels[income.category] }}</span>
                <Money3Component
                  v-if="editingRegistrationId === registration.id"
                  :model-value="editingIncomes[index]?.amount ?? ''"
                  class="saved-money-input"
                  v-bind="moneyConfig"
                  inputmode="numeric"
                  aria-label="Editar valor do rendimento"
                  @update:model-value="updateEditingIncomeAmount(index, $event)"
                />
                <strong v-else>{{ formatCurrency(cents(income.amount)) }}</strong>
              </div>
              <div
                v-for="(dependent, index) in registration.dependents.filter(
                  (item) => item.incomeType !== 'none',
                )"
                :key="dependent.id"
                class="saved-entry"
              >
                <span>{{ dependentIncomeLabels[dependent.incomeType] }}</span>
                <Money3Component
                  v-if="editingRegistrationId === registration.id"
                  :model-value="editingDependents[index]?.amount ?? ''"
                  class="saved-money-input"
                  v-bind="moneyConfig"
                  inputmode="numeric"
                  aria-label="Editar valor do rendimento do dependente"
                  @update:model-value="updateEditingDependentAmount(index, $event)"
                />
                <strong v-else>{{ formatCurrency(cents(dependent.amount)) }}</strong>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="form-section glass" aria-labelledby="income-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">01</p>
            <h2 id="income-title">Rendimentos do titular</h2>
          </div>
          <span class="section-status">Obrigatório</span>
        </div>

        <div class="entry-list">
          <article v-for="(income, index) in incomeStore.draftIncomes" :key="income.id" class="entry-card">
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
          </article>
        </div>

        <button class="add-button" type="button" @click="incomeStore.addDraftIncome">
          <span aria-hidden="true">+</span>
          Adicionar outro rendimento
        </button>
      </section>

      <section class="form-section glass" aria-labelledby="dependents-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">02</p>
            <h2 id="dependents-title">Dependentes</h2>
          </div>
          <span class="section-status optional">Opcional</span>
        </div>

        <div class="toggle-row">
          <div>
            <strong>Possui dependentes?</strong>
            <p>Adicione as informações de renda de cada dependente.</p>
          </div>
          <label class="switch">
            <input
              :checked="incomeStore.draftHasDependents"
              type="checkbox"
              @change="updateHasDependents"
            />
            <span aria-hidden="true" />
            <span class="sr-only">Possui dependentes?</span>
          </label>
        </div>

        <div v-if="incomeStore.draftHasDependents" class="dependents-content">
          <label class="field-label" for="dependent-count">Quantos dependentes?</label>
          <input
            id="dependent-count"
            :value="incomeStore.draftDependentCount"
            class="field-control count-control"
            type="number"
            min="0"
            max="20"
            inputmode="numeric"
            @input="updateDependentCount"
          />

          <div v-if="incomeStore.draftDependents.length" class="dependent-list">
            <article
              v-for="(dependent, index) in incomeStore.draftDependents"
              :key="dependent.id"
              class="dependent-card"
            >
              <div class="dependent-number">{{ String(index + 1).padStart(2, '0') }}</div>
              <div class="dependent-fields">
                <label class="field-label" :for="`dependent-type-${dependent.id}`">
                  Dependente {{ index + 1 }} · Tipo de renda
                </label>
                <select
                  :id="`dependent-type-${dependent.id}`"
                  v-model="dependent.incomeType"
                  class="field-control"
                >
                  <option
                    v-for="incomeType in dependentIncomeTypes"
                    :key="incomeType.value"
                    :value="incomeType.value"
                  >
                    {{ incomeType.label }}
                  </option>
                </select>
                <template v-if="dependent.incomeType !== 'none'">
                  <label class="field-label" :for="`dependent-amount-${dependent.id}`"
                    >Valor mensal</label
                  >
                  <Money3Component
                    :id="`dependent-amount-${dependent.id}`"
                    class="field-control currency-input"
                    inputmode="numeric"
                    autocomplete="off"
                    v-model="dependent.amount"
                    v-bind="moneyConfig"
                    aria-label="Valor mensal do dependente em reais"
                  />
                  <p v-if="dependent.incomeType === 'pensao'" class="exempt-note">
                    Este rendimento é isento.
                  </p>
                </template>
              </div>
            </article>
          </div>
          <p v-else class="empty-state">Informe a quantidade para adicionar os dependentes.</p>
        </div>
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
            <dt>Total anual de Rendimentos Tributáveis</dt>
            <dd>{{ formatCurrency(incomeStore.summaryTaxableTotal) }}</dd>
            <small>Titular + rendas tributáveis dos dependentes</small>
          </div>
          <div>
            <dt>Total anual de Rendimentos Isentos</dt>
            <dd>{{ formatCurrency(incomeStore.summaryExemptTotal) }}</dd>
            <small>Pensão alimentícia</small>
          </div>
          <div>
            <dt>Dependentes para dedução</dt>
            <dd>{{ incomeStore.draftHasDependents ? incomeStore.draftDependentCount : 0 }}</dd>
            <small>Quantidade informada</small>
          </div>
        </dl>
      </footer>
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

.saved-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.remove-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.edit-button {
  padding: 0;
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
  color: var(--color-accent);
  font-size: clamp(0.9rem, 4vw, 1.15rem);
  font-weight: 750;
  text-align: right;
}

.add-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
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

.switch {
  position: relative;
  display: block;
  width: 3.2rem;
  height: 1.8rem;
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
  inset: 0;
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
  color: color-mix(in srgb, var(--color-on-accent), transparent 22%);
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
  grid-row: span 2;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  text-align: right;
}

.summary-list small {
  display: block;
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

.add-registration-button {
  width: 100%;
}

.add-registration-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
