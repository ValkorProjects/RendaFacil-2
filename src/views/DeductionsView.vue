<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Money3Component } from 'v-money3'
import { RouterLink } from 'vue-router'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import TaxEstimateCard from '@/components/TaxEstimateCard.vue'
import { TIPOS_DESPESA, avaliarDespesa, type IdTipoDespesa } from '@/irpf'
import { useIncomeStore, type RegisteredExpense } from '@/stores/income'
import { cents, formatCurrency, moneyConfig } from '@/utils/currency'

const store = useIncomeStore()
const types = Object.entries(TIPOS_DESPESA)
const description = ref('')
const type = ref<IdTipoDespesa>('consulta_medica')
const dependentId = ref<string | null>(null)
const recipient = ref('')
const pensionStartedIn2026 = ref(false)
const legalBasis = ref(false)
const amount = ref('')
const refund = ref('')
const message = ref('')
const health = computed(() => TIPOS_DESPESA[type.value].categoria === 'saude')
const pension = computed(() => TIPOS_DESPESA[type.value].categoria === 'pensao')
const canSave = computed(
  () =>
    description.value.trim() &&
    cents(amount.value) > 0 &&
    (!pension.value || recipient.value.trim()) &&
    (!health.value || cents(refund.value) <= cents(amount.value)),
)
const save = async () => {
  if (store.saving || !canSave.value) return
  if (
    !(await store.addExpense({
      descricao: description.value,
      categoria: TIPOS_DESPESA[type.value].categoria,
      tipo: type.value,
      beneficiario: pension.value
        ? dependentId.value === null
          ? 'outra'
          : 'dependente'
        : dependentId.value === null
          ? 'titular'
          : 'dependente',
      dependente_id: dependentId.value,
      recebedor: pension.value ? recipient.value.trim() : '',
      pensao_iniciou_em_2026: pension.value && pensionStartedIn2026.value,
      valor_centavos: cents(amount.value),
      reembolso_centavos: health.value ? cents(refund.value) : 0,
      base_legal_ok: pension.value ? legalBasis.value : null,
    }))
  )
  return dependent
    ? 'O recebedor está cadastrado como dependente. Confira com atenção a situação no ano em que a pensão começou.'
    : ''
})

watch(
  () => form.categoria,
  () => {
    const firstType = typesForCategory.value[0]
    if (firstType) form.tipo = firstType[0]
    form.beneficiario = 'titular'
    form.dependente_id = null
    form.reembolso_centavos = 0
    reembolsoInput.value = ''
    form.base_legal_ok = false
  },
  { flush: 'sync' },
)
watch(
  () => form.beneficiario,
  (beneficiary) => {
    form.dependente_id =
      beneficiary === 'dependente' ? (declaredDependents.value[0]?.id ?? null) : null
  },
  { flush: 'sync' },
)
watch(
  () => form.tipo,
  (type) => {
    if (type !== 'pensao_alimenticia') form.base_legal_ok = null
  },
)

const resetForm = () => {
  Object.assign(form, blankExpense())
  valorInput.value = ''
  reembolsoInput.value = ''
  editingId.value = null
  step.value = 1
  formError.value = ''
}

const validate = () => {
  const paymentDate = new Date(`${form.data}T00:00:00Z`)
  if (
    !form.data ||
    !form.data.startsWith('2026-') ||
    paymentDate.getUTCFullYear() !== 2026 ||
    paymentDate.toISOString().slice(0, 10) !== form.data
  ) {
    return 'Informe uma data de 2026.'
  }
  if (cents(valorInput.value) <= 0) return 'Informe um valor maior que zero.'
  if (
    asksRefund.value &&
    (cents(reembolsoInput.value) < 0 || cents(reembolsoInput.value) > cents(valorInput.value))
  ) {
    return 'O reembolso deve ficar entre zero e o valor da despesa.'
  }
  if (form.beneficiario === 'dependente' && !form.dependente_id) {
    return 'Cadastre primeiro um dependente nesta declaração.'
  }
  if (form.categoria === 'pensao' && !form.recebedor.trim()) {
    return 'Informe quem recebeu a pensão.'
  }
  if (form.descricao.length > 120) return 'A descrição deve ter no máximo 120 caracteres.'
  return ''
}

const saveExpense = () => {
  formError.value = validate()
  if (formError.value) return

  const expense: Omit<RegisteredExpense, 'id'> = {
    ...form,
    valor_centavos: cents(valorInput.value),
    reembolso_centavos: asksRefund.value ? cents(reembolsoInput.value) : 0,
    base_legal_ok: form.categoria === 'pensao' ? form.base_legal_ok : null,
    recebedor: form.categoria === 'pensao' ? form.recebedor.trim() : '',
    pensaoIniciouEm2026: form.categoria === 'pensao' && form.pensaoIniciouEm2026,
    descricao: form.descricao.trim(),
  }
  const saved =
    editingId.value === null
      ? incomeStore.addExpense(expense)
      : incomeStore.updateExpense({ ...expense, id: editingId.value })
  if (!saved) {
    formError.value = 'Não foi possível salvar. Confira os dados da despesa.'
    return
  description.value = ''
  amount.value = ''
  refund.value = ''
  recipient.value = ''
  pensionStartedIn2026.value = false
  legalBasis.value = false
  dependentId.value = null
  message.value = 'Despesa adicionada.'
}
const beneficiary = (expense: RegisteredExpense) =>
  expense.categoria === 'pensao'
    ? expense.recebedor
    : expense.dependente_id === null
      ? 'Titular'
      : store.dependents.find((dependent) => String(dependent.id) === expense.dependente_id)
          ?.apelido
const deductionWarning = (expense: RegisteredExpense) => {
  const result = avaliarDespesa(
    expense,
    store.dependents.map((dependent) => ({
      id: String(dependent.id),
      em_outra_declaracao: dependent.em_outra_declaracao,
    })),
    store.expenses,
  )
  if (result.deduz) return ''
  if (result.motivo === 'sem_base_legal')
    return 'Esta pensão não entra na dedução sem a base legal informada.'
  return 'Esta despesa não entra na dedução: confira o tipo, o beneficiário e o reembolso.'
}
</script>

<template>
  <PageCard class="deductions-page" eyebrow="Declaração de 2026" title="Dedutíveis">
    <p>
      Lance os valores anuais de saúde, educação e pensão alimentícia. O limite de educação é por
      pessoa.
    </p>
    <form class="expense-form" @submit.prevent="save">
      <label for="expense-description">Descrição</label>
      <input
        id="expense-description"
        v-model="description"
        required
        maxlength="120"
        placeholder="Ex.: Escola da Lia"
      />
      <label for="expense-type">Tipo de despesa</label>
      <select id="expense-type" v-model="type">
        <option v-for="[key, item] in types" :key="key" :value="key">{{ item.rotulo }}</option>
      </select>
      <label for="expense-beneficiary">{{
        pension ? 'Quem recebeu a pensão?' : 'Beneficiário'
      }}</label>
      <select id="expense-beneficiary" v-model="dependentId">
        <option :value="null">{{ pension ? 'Outra pessoa' : 'Titular' }}</option>
        <option
          v-for="dependent in store.dependents"
          :key="dependent.id"
          :value="String(dependent.id)"
        >
          {{ dependent.apelido }}{{ dependent.em_outra_declaracao ? ' (em outra declaração)' : '' }}
        </option>
      </select>
      <template v-if="pension">
        <label for="expense-recipient">Nome de quem recebeu</label>
        <input
          id="expense-recipient"
          v-model="recipient"
          required
          maxlength="120"
          placeholder="Nome do recebedor"
        />
        <label class="checkbox-field" for="pension-started-2026">
          <input id="pension-started-2026" v-model="pensionStartedIn2026" type="checkbox" />
          A pensão começou em 2026
        </label>
        <p v-if="dependentId && !pensionStartedIn2026" class="field-warning" role="status">
          Quem recebe só pode ser considerado dependente em 2026 se a pensão começou neste ano.
        </p>
        <label class="checkbox-field" for="pension-legal-basis">
          <input id="pension-legal-basis" v-model="legalBasis" type="checkbox" />
          Fixada por decisão judicial, acordo homologado ou escritura pública
        </label>
      </template>
      <RouterLink :to="{ name: 'dependents' }">Cadastrar ou gerenciar dependentes</RouterLink>
      <label for="expense-amount">Valor anual pago em 2026</label>
      <Money3Component
        id="expense-amount"
        v-model="amount"
        v-bind="moneyConfig"
        inputmode="numeric"
      />
      <template v-if="health">
        <label for="expense-refund">Reembolso recebido</label>
        <Money3Component
          id="expense-refund"
          v-model="refund"
          v-bind="moneyConfig"
          inputmode="numeric"
        />
        <p v-if="cents(refund) > cents(amount)" role="alert">
          O reembolso não pode superar o valor pago.
        </p>
      </template>
      <button
        class="button"
        type="submit"
        :disabled="!canSave || !store.loaded"
        :aria-disabled="store.saving"
      >
        Adicionar despesa
      </button>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <EmptyState
      v-if="!store.expenses.length"
      icon="deductions"
      title="Nenhuma despesa lançada"
      text="As despesas cadastradas aparecerão aqui, com seu beneficiário."
    />
    <ul v-else class="expenses">
      <li v-for="expense in store.expenses" :key="expense.id">
        <strong>{{ expense.descricao }}</strong>
        <p>{{ beneficiary(expense) }} · {{ formatCurrency(expense.valor_centavos) }}</p>
        <p
          v-if="
            expense.categoria === 'pensao' &&
            expense.beneficiario === 'dependente' &&
            !expense.pensao_iniciou_em_2026
          "
        >
          Quem recebe não será considerado dependente na declaração de 2026.
        </p>
        <p v-if="deductionWarning(expense)">{{ deductionWarning(expense) }}</p>
        <ConfirmDelete :item-label="expense.descricao" @confirm="store.removeExpense(expense.id)" />
      </li>
    </ul>
    <TaxEstimateCard :estimate="store.taxEstimate" :payroll="[]" />
  </PageCard>
</template>

<style scoped>
.deductibles-page {
  display: grid;
  justify-items: center;
  width: 100%;
}

.deductibles-page :deep(.page-card) {
  max-width: 52rem;
  padding: 1.25rem;
  text-align: left;
}

.deductibles-page :deep(.body) {
  justify-items: stretch;
}

.intro,
.field-help,
.empty-state {
  color: var(--color-text-muted);
  line-height: 1.55;
}

.intro {
  max-width: 36rem;
  margin-top: 0.75rem;
}

.form-section,
.education-section,
.saved-section {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 1.25rem;
  border-radius: 1.25rem;
}
.checkbox-field {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.checkbox-field input {
  width: auto;
  min-height: 1.25rem;
  margin: 0;
}
.expenses {
  padding: 0;
  margin: 0;
  list-style: none;
}

.section-kicker {
  margin: 0 0 0.25rem;
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3,
h4,
p {
  margin-top: 0;
}

h2 {
  margin-bottom: 0;
  font-size: 1.2rem;
}

.section-status {
  display: grid;
  min-width: 2rem;
  min-height: 2rem;
  place-items: center;
  border-radius: 999px;
  background: var(--glass-bg-raised);
  font-weight: 700;
}
.expense-form input:not([type='checkbox']),
.expense-form select {
  width: 100%;
  min-height: 2.8rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  background: var(--glass-bg-raised);
  color: var(--color-text);
  font: inherit;
}

select.field-control,
select.field-control option {
  background-color: var(--glass-bg-raised-solid);
  color: var(--color-text);
}

.field-control:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.field-help {
  margin-bottom: 0;
  font-size: 0.875rem;
}

.dependent-declaration {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-block: 0.35rem;
  color: var(--color-text-muted);
}

.dependent-declaration input {
  margin-top: 0.25rem;
  accent-color: var(--color-accent);
}

.preview-message,
.expense-effect {
  margin-bottom: 0;
  color: var(--color-accent);
  font-weight: 700;
}

.field-error,
.field-warning {
  color: var(--color-danger, #a32626);
}

.field-warning {
  margin-bottom: 0;
}

.primary-button,
.secondary-button {
  min-height: 2.5rem;
  padding: 0.5rem 0.85rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.7rem;
  background: var(--glass-bg-raised);
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  border-color: transparent;
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.form-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}

.education-usage {
  display: grid;
  gap: 0.45rem;
}

.education-usage-heading {
  flex-wrap: wrap;
}

.education-usage small {
  color: var(--color-text-muted);
}

.progress-track {
  height: 0.75rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--glass-bg-raised);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width 180ms ease;
}

.expense-group {
  display: grid;
  gap: 0.7rem;
}

.expense-group h3 {
  margin-bottom: 0;
}

.expense-card {
  display: grid;
  gap: 0.55rem;
  padding: 1rem;
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  background: var(--glass-bg-raised);
}

.expense-heading {
  align-items: flex-start;
}

.expense-heading h4 {
  margin-bottom: 0.2rem;
}

.expense-heading p,
.expense-description {
  margin-bottom: 0;
  color: var(--color-text-muted);
}

.total-effect {
  margin: 0.25rem 0 0;
  padding-top: 0.8rem;
  border-top: 1px solid var(--glass-border);
}

@media (max-width: 30rem) {
  .form-section,
  .education-section,
  .saved-section {
    padding: 1rem;
  }

  .expense-heading {
    flex-direction: column;
  }
}

@media (min-width: 48rem) {
  .deductibles-page :deep(.page-card) {
    padding: 1.5rem;
  }

  .form-section,
  .education-section {
    padding: 1.5rem;
  }
}

.no-deduction {
  padding-left: 0.75rem;
  border-left: 3px solid var(--color-accent);
}

.text-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--color-accent);
}
</style>
