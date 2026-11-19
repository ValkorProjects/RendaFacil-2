<script setup lang="ts">
import { computed, ref } from 'vue'
import { Money3Component } from 'v-money3'
import { RouterLink } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import PageCard from '@/components/PageCard.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import TaxEstimateCard from '@/components/TaxEstimateCard.vue'
import {
  TIPOS_DESPESA,
  avaliarDespesa,
  parametros,
  tipoDespesa,
  type CategoriaDespesa,
  type IdTipoDespesa,
  type MotivoNaoDeduz,
} from '@/irpf'
import { useIncomeStore, type RegisteredExpense } from '@/stores/income'
import { cents, formatCurrency, moneyConfig } from '@/utils/currency'

const store = useIncomeStore()
// Minimal expense entry so a beneficiary can be linked to a dependent (RF-11).
// Alimony remains in Rendas until the full RF-13 flow is implemented.
const educationLimit = formatCurrency(parametros(2026).limiteEducacaoPorPessoa)
// The type list says up front whether each expense deducts (RF-13), so nobody types a gym or
// glasses expecting a deduction.
const typeGroups = (
  [
    { categoria: 'saude', dedutivel: true, label: 'Saúde: deduz sem limite' },
    { categoria: 'saude', dedutivel: false, label: 'Saúde: não deduz' },
    {
      categoria: 'educacao',
      dedutivel: true,
      label: `Educação: deduz até ${educationLimit} por pessoa`,
    },
    { categoria: 'educacao', dedutivel: false, label: 'Educação: não deduz' },
  ] as const satisfies readonly { categoria: CategoriaDespesa; dedutivel: boolean; label: string }[]
).map((group) => ({
  ...group,
  types: (Object.keys(TIPOS_DESPESA) as IdTipoDespesa[]).filter(
    (id) =>
      TIPOS_DESPESA[id].categoria === group.categoria &&
      TIPOS_DESPESA[id].dedutivel === group.dedutivel,
  ),
}))
const description = ref('')
const type = ref<IdTipoDespesa>('consulta_medica')
const dependentId = ref<string | null>(null)
const amount = ref('')
const refund = ref('')
const message = ref('')
const selected = computed(() => TIPOS_DESPESA[type.value])
const typeHint = computed(() => {
  if (!selected.value.dedutivel) {
    return 'Não deduz. Você pode registrar a despesa, mas ela não entra na conta.'
  }
  return selected.value.categoria === 'saude'
    ? 'Deduz sem limite, descontado o reembolso do plano de saúde.'
    : `Deduz até ${educationLimit} por pessoa no ano.`
})
// Only a deductible health expense is reduced by a reimbursement.
const asksRefund = computed(() => selected.value.categoria === 'saude' && selected.value.dedutivel)
const canSave = computed(
  () =>
    description.value.trim() &&
    cents(amount.value) > 0 &&
    (!asksRefund.value || cents(refund.value) <= cents(amount.value)),
)
const save = () => {
  if (!canSave.value) return
  if (
    !store.addExpense({
      descricao: description.value,
      categoria: TIPOS_DESPESA[type.value].categoria,
      tipo: type.value,
      beneficiario: dependentId.value === null ? 'titular' : 'dependente',
      dependente_id: dependentId.value,
      valor_centavos: cents(amount.value),
      reembolso_centavos: asksRefund.value ? cents(refund.value) : 0,
      base_legal_ok: null,
    })
  )
    return
  description.value = ''
  amount.value = ''
  refund.value = ''
  message.value = 'Despesa adicionada.'
}
const beneficiary = (expense: RegisteredExpense) =>
  expense.dependente_id === null
    ? 'Titular'
    : store.dependents.find((dependent) => String(dependent.id) === expense.dependente_id)?.apelido
const notDeductibleReasons: Partial<Record<MotivoNaoDeduz, string>> = {
  tipo_nao_dedutivel: 'Este tipo de despesa não deduz no Imposto de Renda.',
  beneficiario_invalido: 'A pessoa beneficiada está em outra declaração.',
  reembolsado: 'O reembolso cobre todo o valor pago.',
}
// Why an expense does not deduct, or an empty string when it does.
const notDeductibleReason = (expense: RegisteredExpense) => {
  const evaluation = avaliarDespesa(
    expense,
    store.dependents.map((dependent) => ({
      id: String(dependent.id),
      em_outra_declaracao: dependent.em_outra_declaracao,
    })),
  )
  if (evaluation.deduz) return ''
  return notDeductibleReasons[evaluation.motivo] ?? 'Confira o tipo e a pessoa beneficiada.'
}
</script>

<template>
  <PageCard class="deductions-page" eyebrow="Declaração de 2026" title="Despesas">
    <p>
      Lance os valores anuais de saúde e educação e indique a pessoa beneficiada. A lista de tipos
      já diz quais despesas deduzem: as que não deduzem podem ser registradas, mas não entram na
      conta.
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
      <select id="expense-type" v-model="type" aria-describedby="expense-type-hint">
        <optgroup v-for="group in typeGroups" :key="group.label" :label="group.label">
          <option v-for="id in group.types" :key="id" :value="id">
            {{ TIPOS_DESPESA[id].rotulo }}
          </option>
        </optgroup>
      </select>
      <p id="expense-type-hint" class="type-hint" :class="{ 'no-deduction': !selected.dedutivel }">
        {{ typeHint }}
      </p>
      <label for="expense-beneficiary">Beneficiário</label>
      <select id="expense-beneficiary" v-model="dependentId">
        <option :value="null">Titular</option>
        <option
          v-for="dependent in store.dependents"
          :key="dependent.id"
          :value="String(dependent.id)"
        >
          {{ dependent.apelido }}{{ dependent.em_outra_declaracao ? ' (em outra declaração)' : '' }}
        </option>
      </select>
      <RouterLink :to="{ name: 'dependents' }">Cadastrar ou gerenciar dependentes</RouterLink>
      <label for="expense-amount">Valor anual pago em 2026</label>
      <Money3Component
        id="expense-amount"
        v-model="amount"
        v-bind="moneyConfig"
        inputmode="numeric"
      />
      <template v-if="asksRefund">
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
      <button class="button" type="submit" :disabled="!canSave">Adicionar despesa</button>
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
        <p>
          {{ tipoDespesa(expense.tipo)?.rotulo }} · {{ beneficiary(expense) }} ·
          {{ formatCurrency(expense.valor_centavos) }}
        </p>
        <p v-if="notDeductibleReason(expense)" class="no-deduction">
          <strong>Não deduz.</strong> {{ notDeductibleReason(expense) }}
        </p>
        <p v-else>Deduz.</p>
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
.expense-form input,
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
.type-hint {
  font-size: 0.875rem;
}
.no-deduction {
  padding-left: 0.75rem;
  border-left: 3px solid var(--color-accent);
}
a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--color-accent);
}
</style>
