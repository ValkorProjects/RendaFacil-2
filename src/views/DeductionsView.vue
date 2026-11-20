<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Money3Component } from 'v-money3'
import { RouterLink } from 'vue-router'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import PageCard from '@/components/PageCard.vue'
import { parametros } from '@/irpf'
import { previaEfeito, reais, type EfeitoDespesa } from '@/irpf/efeitos'
import { TIPOS_DESPESA, type CategoriaDespesa, type IdTipoDespesa } from '@/irpf/despesas'
import type { RegisteredExpense } from '@/stores/income'
import { useIncomeStore } from '@/stores/income'
import { cents, formatCurrency, formatMoneyInput, moneyConfig } from '@/utils/currency'

const CATEGORY_LABELS: Record<CategoriaDespesa, string> = {
  saude: 'Saúde',
  educacao: 'Educação',
  pensao: 'Pensão alimentícia',
}
const CATEGORIES = Object.keys(CATEGORY_LABELS) as CategoriaDespesa[]
const EXPENSE_TYPES = Object.entries(TIPOS_DESPESA) as [
  IdTipoDespesa,
  (typeof TIPOS_DESPESA)[IdTipoDespesa],
][]
const EDUCATION_LIMIT = parametros(2026).limiteEducacaoPorPessoa

const incomeStore = useIncomeStore()
const blankExpense = (): Omit<RegisteredExpense, 'id'> => ({
  categoria: 'saude',
  tipo: 'consulta_medica',
  beneficiario: 'titular',
  dependente_id: null,
  valor_centavos: 0,
  reembolso_centavos: 0,
  base_legal_ok: null,
  data: '',
  descricao: '',
  recebedor: '',
  pensao_iniciou_em_2026: false,
})
const form = reactive(blankExpense())
const valorInput = ref('')
const reembolsoInput = ref('')
const editingId = ref<number | null>(null)
const step = ref<1 | 2>(1)
const formError = ref('')
const confirmingId = ref<number | null>(null)

const typesForCategory = computed(() =>
  EXPENSE_TYPES.filter(([, type]) => type.categoria === form.categoria),
)
// The declaration's dependents (registered on /dependentes), with string ids as the engine and
// the expenses use them.
const allDependents = computed(() =>
  incomeStore.dependents.map((dependent) => ({ ...dependent, id: String(dependent.id) })),
)
const declaredDependents = computed(() =>
  allDependents.value.filter((dependent) => !dependent.em_outra_declaracao),
)
const selectedType = computed(() => TIPOS_DESPESA[form.tipo as IdTipoDespesa])
// Says up front whether the chosen type deducts, before anything is typed.
const typeHint = computed(() => {
  if (!selectedType.value.dedutivel) {
    return 'Não deduz. Você pode registrar a despesa, mas ela não entra na conta.'
  }
  if (form.categoria === 'saude') {
    return 'Deduz sem limite, descontado o reembolso do plano de saúde.'
  }
  if (form.categoria === 'educacao') {
    return `Deduz até ${formatCurrency(EDUCATION_LIMIT)} por pessoa no ano.`
  }
  return 'Deduz sem limite, se fixada por decisão judicial, acordo homologado na Justiça ou escritura pública.'
})
// Only a deductible health expense is reduced by a reimbursement.
const asksRefund = computed(() => form.categoria === 'saude' && selectedType.value.dedutivel)
const expensesByCategory = computed(() =>
  CATEGORIES.map((category) => ({
    category,
    entries: incomeStore.expenses
      .map((expense, index) => ({ expense, effect: incomeStore.deductionEffects?.despesas[index] }))
      .filter(({ expense }) => expense.categoria === category),
  })).filter((group) => group.entries.length > 0),
)
const preview = computed<{ effect: EfeitoDespesa | null; error: string }>(() => {
  const amount = cents(valorInput.value)
  if (!form.data || !amount) return { effect: null, error: '' }
  try {
    const expenses = incomeStore.declarationData.despesas.filter(
      (_, index) => incomeStore.expenses[index]?.id !== editingId.value,
    )
    return {
      effect: previaEfeito(
        { ...incomeStore.declarationData, despesas: expenses },
        {
          categoria: form.categoria,
          tipo: form.tipo,
          beneficiario: form.beneficiario,
          dependente_id: form.dependente_id,
          valor_centavos: amount,
          reembolso_centavos: asksRefund.value ? cents(reembolsoInput.value) : 0,
          base_legal_ok: form.categoria === 'pensao' ? form.base_legal_ok : null,
          recebedor: form.categoria === 'pensao' ? form.recebedor.trim() : '',
          pensao_iniciou_em_2026: form.categoria === 'pensao' && form.pensao_iniciou_em_2026,
        },
      ),
      error: '',
    }
  } catch (error) {
    return { effect: null, error: error instanceof Error ? error.message : String(error) }
  }
})
const educationLabel = (personId: string) => {
  if (personId === 'titular') return 'Titular'
  return allDependents.value.find((dependent) => dependent.id === personId)?.apelido || 'Dependente'
}
const pensionReceiverWarning = computed(() => {
  const receiver = form.recebedor.trim().toLocaleLowerCase('pt-BR')
  if (!receiver || form.pensao_iniciou_em_2026) return ''
  const dependent = allDependents.value.find(
    (item) => item.apelido.toLocaleLowerCase('pt-BR') === receiver,
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

const saveExpense = async () => {
  if (incomeStore.saving) return
  formError.value = validate()
  if (formError.value) return

  const expense: Omit<RegisteredExpense, 'id'> = {
    ...form,
    valor_centavos: cents(valorInput.value),
    reembolso_centavos: asksRefund.value ? cents(reembolsoInput.value) : 0,
    base_legal_ok: form.categoria === 'pensao' ? form.base_legal_ok : null,
    recebedor: form.categoria === 'pensao' ? form.recebedor.trim() : '',
    pensao_iniciou_em_2026: form.categoria === 'pensao' && form.pensao_iniciou_em_2026,
    descricao: form.descricao.trim(),
  }
  const saved =
    editingId.value === null
      ? await incomeStore.addExpense(expense)
      : await incomeStore.updateExpense({ ...expense, id: editingId.value })
  // A failed save keeps the form as it is; the sync banner says whether it was the connection.
  if (!saved) {
    formError.value = 'Não foi possível salvar. Confira os dados da despesa.'
    return
  }
  resetForm()
}

const editExpense = (expense: RegisteredExpense) => {
  Object.assign(form, expense)
  valorInput.value = formatMoneyInput(expense.valor_centavos)
  reembolsoInput.value = formatMoneyInput(expense.reembolso_centavos)
  editingId.value = expense.id
  step.value = 2
  formError.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const remove = async (expense: RegisteredExpense) => {
  if (incomeStore.saving) return
  if (!(await incomeStore.removeExpense(expense.id))) return
  confirmingId.value = null
  if (editingId.value === expense.id) resetForm()
}
const expenseLabel = (expense: RegisteredExpense) =>
  expense.descricao || (TIPOS_DESPESA[expense.tipo as IdTipoDespesa]?.rotulo ?? expense.tipo)

const dateLabel = (date: string) => {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : date
}
const beneficiaryLabel = (expense: RegisteredExpense) => {
  if (expense.beneficiario === 'titular') return 'Titular'
  if (expense.beneficiario === 'outra') return 'Outra pessoa'
  return educationLabel(expense.dependente_id ?? '')
}

const effectLabel = (effect: EfeitoDespesa | undefined) => {
  if (!effect) return ''
  if (effect.situacao === 'nao_deduz') return effect.mensagens[0] ?? 'Não deduz'
  if (effect.efeito > 0) return `Pode reduzir o imposto em até ${reais(effect.efeito)}`
  return effect.mensagens[0] ?? 'Não altera o imposto estimado'
}

const pensionWarning = (expense: RegisteredExpense) => {
  const receiver = expense.recebedor.trim().toLocaleLowerCase('pt-BR')
  if (!receiver || expense.pensao_iniciou_em_2026) return ''
  const match = allDependents.value.find(
    (dependent) => dependent.apelido.toLocaleLowerCase('pt-BR') === receiver,
  )
  return match
    ? 'O recebedor também está cadastrado como dependente; confira o ano em que a pensão começou.'
    : ''
}
</script>

<template>
  <div class="deductibles-page">
    <PageCard eyebrow="Declaração de 2026" title="Despesas">
      <p class="intro">
        Cadastre despesas de saúde, educação e pensão alimentícia para atualizar a estimativa do
        imposto. A lista de tipos já diz quais deduzem: as que não deduzem podem ser registradas,
        mas não entram na conta. Guarde os comprovantes; os dados são usados na estimativa e limpos
        ao sair da conta.
      </p>

      <section class="form-section glass" aria-labelledby="expense-form-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">
              {{ editingId === null ? `Etapa ${step} de 2` : `Edição · etapa ${step} de 2` }}
            </p>
            <h2 id="expense-form-title">
              {{ editingId === null ? 'Adicionar despesa' : 'Editar despesa' }}
            </h2>
          </div>
          <span class="section-status optional">2026</span>
        </div>

        <template v-if="step === 1">
          <label class="field-label" for="expense-category">Categoria</label>
          <select id="expense-category" v-model="form.categoria" class="field-control">
            <option v-for="category in CATEGORIES" :key="category" :value="category">
              {{ CATEGORY_LABELS[category] }}
            </option>
          </select>

          <label class="field-label" for="expense-type">Tipo</label>
          <select
            id="expense-type"
            v-model="form.tipo"
            class="field-control"
            aria-describedby="expense-type-hint"
          >
            <option v-for="[id, type] in typesForCategory" :key="id" :value="id">
              {{ type.rotulo }}{{ type.dedutivel ? '' : ' (não dedutível)' }}
            </option>
          </select>
          <p
            id="expense-type-hint"
            class="field-help"
            :class="{ 'no-deduction': !selectedType.dedutivel }"
          >
            {{ typeHint }}
          </p>
          <button class="primary-button" type="button" @click="step = 2">Continuar</button>
        </template>

        <template v-else>
          <template v-if="form.categoria !== 'pensao'">
            <label class="field-label" for="expense-beneficiary">De quem é a despesa?</label>
            <select id="expense-beneficiary" v-model="form.beneficiario" class="field-control">
              <option value="titular">Titular</option>
              <option value="dependente" :disabled="!declaredDependents.length">Dependente</option>
              <option value="outra">Outra pessoa</option>
            </select>
            <template v-if="form.beneficiario === 'dependente'">
              <label class="field-label" for="expense-dependent">Dependente</label>
              <select
                id="expense-dependent"
                v-model="form.dependente_id"
                class="field-control"
                :disabled="!declaredDependents.length"
              >
                <option
                  v-for="dependent in declaredDependents"
                  :key="dependent.id"
                  :value="dependent.id"
                >
                  {{ dependent.apelido }}
                </option>
              </select>
              <p v-if="!declaredDependents.length" class="field-error" role="alert">
                Cadastre um dependente nesta declaração primeiro.
              </p>
            </template>
            <RouterLink class="text-link" :to="{ name: 'dependents' }"
              >Cadastrar ou gerenciar dependentes</RouterLink
            >
            <p v-if="form.categoria === 'educacao'" class="field-help">
              O limite anual de dedução é {{ formatCurrency(EDUCATION_LIMIT) }} por pessoa.
            </p>
          </template>
          <template v-else>
            <label class="field-label" for="expense-receiver">Quem recebeu a pensão?</label>
            <input
              id="expense-receiver"
              v-model="form.recebedor"
              class="field-control"
              maxlength="120"
              autocomplete="off"
            />
            <label class="dependent-declaration">
              <input v-model="form.pensao_iniciou_em_2026" type="checkbox" />
              A pensão começou em 2026
            </label>
            <p v-if="pensionReceiverWarning" class="field-warning" role="status">
              {{ pensionReceiverWarning }}
            </p>
            <label class="dependent-declaration">
              <input v-model="form.base_legal_ok" type="checkbox" />
              Foi fixada por decisão judicial, acordo homologado ou escritura pública
            </label>
          </template>

          <label class="field-label" for="expense-amount">Valor pago</label>
          <Money3Component
            id="expense-amount"
            v-model="valorInput"
            class="field-control currency-input"
            inputmode="numeric"
            autocomplete="off"
            v-bind="moneyConfig"
          />
          <template v-if="asksRefund">
            <label class="field-label" for="expense-reimbursement">Valor reembolsado</label>
            <Money3Component
              id="expense-reimbursement"
              v-model="reembolsoInput"
              class="field-control currency-input"
              inputmode="numeric"
              autocomplete="off"
              v-bind="moneyConfig"
            />
          </template>

          <label class="field-label" for="expense-date">Data do pagamento</label>
          <input
            id="expense-date"
            v-model="form.data"
            class="field-control"
            type="date"
            min="2026-01-01"
            max="2026-12-31"
          />
          <label class="field-label" for="expense-description">Descrição (opcional)</label>
          <input
            id="expense-description"
            v-model="form.descricao"
            class="field-control"
            maxlength="120"
            autocomplete="off"
          />
          <p class="field-help">Não inclua diagnósticos ou informações médicas sensíveis.</p>

          <p v-if="preview.error" class="field-error" role="alert">
            Não foi possível calcular a prévia. {{ preview.error }}
          </p>
          <p v-else-if="preview.effect" class="preview-message" role="status">
            {{ effectLabel(preview.effect) }}
            <span v-if="preview.effect.foraDoLimite > 0">
              · {{ reais(preview.effect.foraDoLimite) }} acima do limite de educação
            </span>
          </p>
          <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>

          <div class="form-actions">
            <button class="secondary-button" type="button" @click="step = 1">Voltar</button>
            <button
              class="primary-button"
              type="button"
              :disabled="!incomeStore.loaded"
              :aria-disabled="incomeStore.saving"
              @click="saveExpense"
            >
              {{
                incomeStore.saving
                  ? 'Salvando…'
                  : editingId === null
                    ? 'Adicionar despesa'
                    : 'Salvar alterações'
              }}
            </button>
            <button
              v-if="editingId !== null"
              class="secondary-button"
              type="button"
              @click="resetForm"
            >
              Cancelar edição
            </button>
          </div>
        </template>
      </section>

      <section
        v-if="incomeStore.deductionEffects?.educacaoPorPessoa.length"
        class="education-section glass"
        aria-labelledby="education-title"
      >
        <div class="section-heading">
          <div>
            <p class="section-kicker">Limite por pessoa</p>
            <h2 id="education-title">Uso do limite de educação</h2>
          </div>
        </div>
        <div
          v-for="usage in incomeStore.deductionEffects?.educacaoPorPessoa"
          :key="usage.pessoa"
          class="education-usage"
        >
          <div class="education-usage-heading">
            <strong>{{ educationLabel(usage.pessoa) }}</strong>
            <span>{{ formatCurrency(usage.uso) }} de {{ formatCurrency(usage.limite) }}</span>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            :aria-label="`Limite de educação usado por ${educationLabel(usage.pessoa)}`"
            :aria-valuenow="usage.uso"
            :aria-valuemin="0"
            :aria-valuemax="usage.limite"
            :aria-valuetext="`${formatCurrency(usage.uso)} de ${formatCurrency(usage.limite)}`"
          >
            <span :style="{ width: `${(usage.uso / usage.limite) * 100}%` }" />
          </div>
          <small>Restante: {{ formatCurrency(usage.restante) }}</small>
        </div>
      </section>

      <section class="saved-section glass" aria-labelledby="saved-expenses-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Cadastros</p>
            <h2 id="saved-expenses-title">Despesas adicionadas</h2>
          </div>
          <span class="section-status">{{ incomeStore.expenses.length }}</span>
        </div>
        <p v-if="!incomeStore.expenses.length" class="empty-state">
          Nenhuma despesa cadastrada ainda.
        </p>
        <section
          v-for="group in expensesByCategory"
          :key="group.category"
          class="expense-group"
          :aria-label="CATEGORY_LABELS[group.category]"
        >
          <h3>{{ CATEGORY_LABELS[group.category] }}</h3>
          <article
            v-for="{ expense, effect } in group.entries"
            :key="expense.id"
            class="expense-card"
          >
            <div class="expense-heading">
              <div>
                <h4>{{ TIPOS_DESPESA[expense.tipo as IdTipoDespesa]?.rotulo ?? expense.tipo }}</h4>
                <p>
                  {{ dateLabel(expense.data) }} ·
                  {{
                    expense.categoria === 'pensao' ? expense.recebedor : beneficiaryLabel(expense)
                  }}
                </p>
              </div>
              <strong>{{ formatCurrency(expense.valor_centavos) }}</strong>
            </div>
            <p v-if="expense.descricao" class="expense-description">{{ expense.descricao }}</p>
            <p
              v-if="expense.categoria === 'saude' && expense.reembolso_centavos"
              class="field-help"
            >
              Reembolso: {{ formatCurrency(expense.reembolso_centavos) }}
            </p>
            <p class="expense-effect">{{ effectLabel(effect) }}</p>
            <p v-if="pensionWarning(expense)" class="field-warning" role="status">
              {{ pensionWarning(expense) }}
            </p>
            <div class="saved-actions">
              <button class="secondary-button" type="button" @click="editExpense(expense)">
                Editar
              </button>
              <ConfirmDelete
                :open="confirmingId === expense.id"
                :item-label="expenseLabel(expense)"
                @update:open="confirmingId = $event ? expense.id : null"
                @confirm="remove(expense)"
              />
            </div>
          </article>
        </section>
        <p v-if="incomeStore.deductionEffects" class="total-effect">
          Redução estimada pelas despesas de saúde e educação:
          <strong>{{ formatCurrency(incomeStore.deductionEffects.efeitoTotal) }}</strong>
        </p>
      </section>
    </PageCard>
  </div>
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

.section-heading,
.education-usage-heading,
.expense-heading,
.form-actions,
.saved-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
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

.field-label {
  margin-top: 0.25rem;
  font-weight: 700;
}

.field-control {
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
