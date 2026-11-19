<script setup lang="ts">
import { computed, ref } from 'vue'
import { Money3Component } from 'v-money3'
import { RouterLink } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import PageCard from '@/components/PageCard.vue'
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
.deductions-page {
  text-align: left;
}
.deductions-page :deep(.body) {
  justify-items: stretch;
}
.expense-form,
.expenses {
  display: grid;
  gap: 0.75rem;
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
.expenses li {
  padding: 1rem;
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  overflow-wrap: anywhere;
}
.expense-form input:not([type='checkbox']),
.expense-form select {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.6rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.6rem;
  background: var(--glass-bg-raised-solid);
  color: var(--color-text);
  font: inherit;
}
a {
  color: var(--color-accent);
}
</style>
