<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Money3Component } from 'v-money3'
import PageCard from '@/components/PageCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import {
  useIncomeStore,
  incomeCategoryLabels,
  incomeEntryError,
  fillIncomeFromSalary,
  type RegisteredIncomeEntry,
} from '@/stores/income'
import { parametros, tipoDespesa } from '@/irpf'
import { cents, formatCurrency, moneyConfig } from '@/utils/currency'
import {
  dependentError,
  emptyDependent,
  relationshipLabels,
  type RegisteredDependent,
} from '@/utils/dependents'

const store = useIncomeStore()
const draft = ref(emptyDependent())
const editingId = ref<number | undefined>()
const formOpen = ref(false)
const nicknameInput = ref<HTMLInputElement | null>(null)
const addButton = ref<HTMLButtonElement | null>(null)
const confirmingId = ref<number | null>(null)
const message = ref('')
const incomeDrafts = ref<RegisteredIncomeEntry[]>([])
const fillIncomeLater = ref(false)
const saveError = ref('')
const salaryErrors = ref<Record<number, string>>({})
let nextIncomeDraftId = -1
const addIncome = () =>
  incomeDrafts.value.push({
    id: nextIncomeDraftId--,
    category: 'clt',
    amount: '',
    inss: '',
    irrf: '',
  })
const hasSavedIncome = computed(() => incomeDrafts.value.some((income) => income.id >= 0))
const incomeQuestionError = (income: RegisteredIncomeEntry) =>
  incomeEntryError(income) ||
  (cents(income.amount) <= 0 ? 'Informe um valor mensal maior que zero.' : '')
// Quem aparece em outra declaração não entra na conta: a renda dele não é pedida.
const asksIncome = computed(
  () => draft.value.teve_renda_propria && !draft.value.em_outra_declaracao,
)
const canSave = computed(
  () =>
    !dependentError(draft.value) &&
    (!asksIncome.value ||
      fillIncomeLater.value ||
      (incomeDrafts.value.length > 0 &&
        incomeDrafts.value.every((income) => !incomeQuestionError(income)))),
)
const deduction = computed(() => store.dependentCount * parametros(2026).dependente)
const openForm = async (dependent?: RegisteredDependent) => {
  editingId.value = dependent?.id
  draft.value = dependent
    ? {
        apelido: dependent.apelido,
        relacao: dependent.relacao,
        em_outra_declaracao: dependent.em_outra_declaracao,
        teve_renda_propria: dependent.teve_renda_propria,
      }
    : emptyDependent()
  confirmingId.value = null
  incomeDrafts.value = dependent
    ? store.incomesForDependent(dependent.id).map((income) => ({ ...income }))
    : []
  if (!incomeDrafts.value.length) addIncome()
  fillIncomeLater.value = false
  saveError.value = ''
  salaryErrors.value = {}
  message.value = ''
  formOpen.value = true
  await nextTick()
  nicknameInput.value?.focus()
}
const closeForm = async () => {
  formOpen.value = false
  await nextTick()
  addButton.value?.focus()
}
const save = async () => {
  if (store.saving || !canSave.value) return
  const incomes = asksIncome.value && !fillIncomeLater.value ? incomeDrafts.value : []
  if (!(await store.saveDependentWithIncomes(draft.value, incomes, editingId.value))) {
    saveError.value =
      'Não foi possível salvar. Confira os valores dos rendimentos e tente novamente.'
    return
  }
  message.value =
    editingId.value === undefined ? 'Dependente adicionado.' : 'Dependente atualizado.'
  void closeForm()
}
// The dependent's own salary: no dependents of their own in this declaration.
const fillFromSalary = (income: RegisteredIncomeEntry) => {
  salaryErrors.value[income.id] = fillIncomeFromSalary(income, 0)
}
const remove = async (dependent: RegisteredDependent) => {
  if (!(await store.removeDependent(dependent.id))) return
  confirmingId.value = null
  message.value = `${dependent.apelido} e os lançamentos vinculados foram excluídos.`
  await nextTick()
  addButton.value?.focus()
}
const pending = (id: number) => store.pendingDependents.some((dependent) => dependent.id === id)
const linkedIncomes = (id: number) =>
  store.registrations
    .flatMap((registration) => registration.incomes)
    .filter((income) => income.dependentId === id).length
</script>

<template>
  <PageCard class="dependents-page" eyebrow="Declaração de 2026" title="Dependentes">
    <p>Cadastre cada pessoa uma vez. Use o apelido para identificar seus rendimentos e despesas.</p>
    <details class="help">
      <summary>Quem pode ser dependente?</summary>
      <p>
        Filho(a) ou enteado(a) até 21 anos, ou até 24 anos se estiver na faculdade ou em escola
        técnica de nível médio; em qualquer idade, se for incapaz para o trabalho.
      </p>
      <p>
        As demais relações têm regras específicas. Confira se a pessoa atende aos critérios da
        Receita.
      </p>
      <p>
        Um dependente só pode constar em uma declaração. Quem aparece em outra declaração não entra
        nesta estimativa, nem com sua renda ou suas despesas.
      </p>
      <a
        href="https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/imposto-de-renda/dirpf/deducoes/29-despesa-com-dependente"
        target="_blank"
        rel="noopener noreferrer"
        >Consultar as regras da Receita Federal (abre em nova aba)</a
      >
    </details>
    <p class="deduction">
      <strong>{{ store.dependentCount }} dependente(s) válido(s)</strong> · Dedução anual no modelo
      completo: {{ formatCurrency(deduction) }}
    </p>
    <p class="muted">
      {{ formatCurrency(parametros(2026).dependente) }} por dependente válido. Este é o valor da
      dedução da base, não uma restituição garantida.
    </p>
    <p v-if="message" role="status">{{ message }}</p>
    <button ref="addButton" class="button" type="button" @click="openForm()">
      Adicionar dependente
    </button>

    <form
      v-if="formOpen"
      class="dependent-form"
      @submit.prevent="save"
      @keydown.esc.stop="closeForm"
    >
      <h2>{{ editingId === undefined ? 'Novo dependente' : 'Editar dependente' }}</h2>
      <label for="dependent-nickname">Apelido</label>
      <input
        id="dependent-nickname"
        ref="nicknameInput"
        v-model="draft.apelido"
        maxlength="60"
        required
        placeholder="Ex.: Lia"
        autocomplete="off"
      />
      <label for="dependent-relationship">Relação</label>
      <select id="dependent-relationship" v-model="draft.relacao">
        <option v-for="(label, value) in relationshipLabels" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
      <label class="check"
        ><input v-model="draft.em_outra_declaracao" type="checkbox" />Esta pessoa aparece como
        dependente na declaração de outra pessoa?</label
      >
      <p v-if="draft.em_outra_declaracao" class="notice" role="status">
        Um dependente só pode constar em uma declaração. Esta pessoa não entrará na conta, nem suas
        rendas ou despesas.
      </p>
      <label class="check"
        ><input v-model="draft.teve_renda_propria" type="checkbox" />Teve renda própria em
        2026?</label
      >
      <section
        v-if="asksIncome"
        class="income-questionnaire"
        aria-labelledby="dependent-income-title"
      >
        <h3 id="dependent-income-title">
          Rendimentos de {{ draft.apelido.trim() || 'seu dependente' }}
        </h3>
        <p>
          Preencha a renda desta pessoa. Ao salvar o dependente, os lançamentos também aparecerão em
          Rendas, já vinculados ao seu apelido.
        </p>
        <label v-if="!hasSavedIncome" class="check">
          <input v-model="fillIncomeLater" type="checkbox" />Não tenho os valores agora. Preencher
          depois.
        </label>
        <p v-if="fillIncomeLater" class="notice">
          A estimativa fica provisória até você preencher a renda deste dependente, aqui ou em
          Rendas.
        </p>
        <template v-else>
          <p class="muted">
            Informe os valores mensais de 2026. Se estiver usando o informe anual, divida os valores
            do ano por 12, como na tela de Rendas.
          </p>
          <fieldset
            v-for="(income, index) in incomeDrafts"
            :key="income.id"
            class="income-questions"
          >
            <legend>Rendimento {{ index + 1 }}</legend>
            <label :for="`dependent-income-type-${income.id}`">Qual é o tipo de rendimento?</label>
            <select :id="`dependent-income-type-${income.id}`" v-model="income.category">
              <option
                v-for="(label, category) in incomeCategoryLabels"
                :key="category"
                :value="category"
              >
                {{ label }}
              </option>
            </select>
            <label :for="`dependent-income-amount-${income.id}`">Quanto recebeu por mês?</label>
            <Money3Component
              :id="`dependent-income-amount-${income.id}`"
              v-model="income.amount"
              v-bind="moneyConfig"
              inputmode="numeric"
            />
            <label :for="`dependent-income-inss-${income.id}`">INSS descontado no mês</label>
            <Money3Component
              :id="`dependent-income-inss-${income.id}`"
              v-model="income.inss"
              v-bind="moneyConfig"
              inputmode="numeric"
            />
            <label :for="`dependent-income-irrf-${income.id}`">IR retido na fonte no mês</label>
            <Money3Component
              :id="`dependent-income-irrf-${income.id}`"
              v-model="income.irrf"
              v-bind="moneyConfig"
              inputmode="numeric"
            />
            <template v-if="income.category === 'clt'">
              <button
                class="button secondary"
                type="button"
                :disabled="!cents(income.amount)"
                @click="fillFromSalary(income)"
              >
                Calcular INSS e IR pelo salário
              </button>
              <p class="muted">
                Supõe o mesmo salário todos os meses, sem dependentes nem pensão de
                {{ draft.apelido.trim() || 'seu dependente' }}.
              </p>
            </template>
            <p v-if="salaryErrors[income.id]" class="notice" role="alert">
              Não foi possível calcular pelo salário. {{ salaryErrors[income.id] }}
            </p>
            <p v-if="income.category === 'pensaoAlimenticia'" class="muted">
              Pensão alimentícia recebida é isenta. Deixe INSS e IR retido zerados.
            </p>
            <p v-if="incomeQuestionError(income)" class="notice" role="status">
              {{ incomeQuestionError(income) }}
            </p>
            <button
              v-if="income.id < 0 && incomeDrafts.length > 1"
              class="button secondary"
              type="button"
              :aria-label="`Remover rendimento ${index + 1}`"
              @click="incomeDrafts.splice(index, 1)"
            >
              Remover rendimento
            </button>
          </fieldset>
          <button class="button secondary" type="button" @click="addIncome">
            Adicionar outro rendimento do dependente
          </button>
        </template>
      </section>
      <p v-else-if="hasSavedIncome" class="notice">
        Os rendimentos já cadastrados serão mantidos. Para excluí-los, acesse Rendas.
      </p>
      <p v-if="saveError" role="alert">{{ saveError }}</p>
      <div class="actions">
        <button class="button secondary" type="button" @click="closeForm">Cancelar</button>
        <button
          class="button"
          type="submit"
          :disabled="!canSave || !store.loaded"
          :aria-disabled="store.saving"
        >
          Salvar dependente
        </button>
      </div>
    </form>

    <EmptyState
      v-if="!store.dependents.length && !formOpen"
      icon="user"
      title="Nenhum dependente cadastrado"
      text="Adicione uma pessoa para vincular rendimentos e despesas à declaração."
    />
    <ul class="dependent-list">
      <li v-for="dependent in store.dependents" :key="dependent.id" class="dependent-card">
        <h2>{{ dependent.apelido }}</h2>
        <p>{{ relationshipLabels[dependent.relacao] }}</p>
        <p v-if="dependent.em_outra_declaracao" class="notice">
          Em outra declaração: não entra na conta. Suas rendas e despesas também ficam fora da
          estimativa.
        </p>
        <p v-else>Dedução anual: {{ formatCurrency(parametros(2026).dependente) }}</p>
        <p v-if="pending(dependent.id)" class="notice">
          Estimativa provisória: falta preencher a renda de {{ dependent.apelido }}.
        </p>
        <button
          v-if="pending(dependent.id) && !formOpen"
          class="button secondary"
          type="button"
          @click="openForm(dependent)"
        >
          Preencher renda de {{ dependent.apelido }}
        </button>
        <p v-else>
          {{
            dependent.teve_renda_propria
              ? 'Teve renda própria em 2026.'
              : 'Sem renda própria em 2026.'
          }}
        </p>
        <RouterLink
          v-if="dependent.teve_renda_propria && !dependent.em_outra_declaracao"
          :to="{ name: 'income' }"
          >Lançar ou conferir informe em Rendas</RouterLink
        >
        <div v-if="!formOpen" class="actions">
          <button
            class="button secondary"
            type="button"
            :aria-label="`Editar ${dependent.apelido}`"
            @click="openForm(dependent)"
          >
            Editar
          </button>
          <ConfirmDelete
            :open="confirmingId === dependent.id"
            :item-label="dependent.apelido"
            @update:open="confirmingId = $event ? dependent.id : null"
            @confirm="remove(dependent)"
          >
            <template v-if="store.expensesForDependent(dependent.id).length">
              <p>As seguintes despesas serão apagadas:</p>
              <ul>
                <li v-for="expense in store.expensesForDependent(dependent.id)" :key="expense.id">
                  {{ expense.descricao || tipoDespesa(expense.tipo)?.rotulo || expense.tipo }} —
                  {{ formatCurrency(expense.valor_centavos) }}
                </li>
              </ul>
            </template>
            <p v-else>Não há despesas vinculadas a esta pessoa.</p>
            <p v-if="linkedIncomes(dependent.id)">
              Também serão apagados {{ linkedIncomes(dependent.id) }} rendimento(s) desta pessoa.
            </p>
            <p v-if="store.draftIncomes.some((income) => income.dependentId === dependent.id)">
              O rascunho de rendimento desta pessoa também será descartado.
            </p>
          </ConfirmDelete>
        </div>
      </li>
    </ul>
    <RouterLink :to="{ name: 'income' }">Voltar ao questionário de Rendas</RouterLink>
    <p class="muted">
      Os dependentes e rendimentos vinculados são salvos na sua declaração de 2026.
    </p>
  </PageCard>
</template>

<style scoped>
.dependents-page {
  text-align: left;
}
.dependents-page :deep(.body) {
  justify-items: stretch;
}
.help,
.dependent-card,
.dependent-form {
  padding: 1rem;
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  background: var(--glass-bg-raised);
}
.help p {
  margin-block: 0.75rem;
}
summary {
  cursor: pointer;
  color: var(--color-text);
  font-weight: 600;
}
.dependent-form,
.income-questionnaire,
.income-questions,
.dependent-card,
.dependent-list {
  display: grid;
  gap: 0.75rem;
}
.income-questions {
  min-width: 0;
  margin: 0;
  padding: 0.75rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
}
.income-questions legend {
  padding-inline: 0.25rem;
  font-weight: 600;
}
.dependent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
h2 {
  color: var(--color-text);
  font-size: 1.2rem;
  overflow-wrap: anywhere;
}
input:not([type='checkbox']),
select {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.6rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.6rem;
  background: var(--glass-bg-raised-solid);
  color: var(--color-text);
  font: inherit;
}
.check {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}
.check input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.2rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}
.secondary {
  background: var(--glass-bg-raised-solid);
  color: var(--color-text);
}
.notice {
  padding: 0.75rem;
  border-left: 3px solid var(--color-accent);
  background: var(--glass-bg-raised);
  /* Inside a card the two translucent backgrounds add up: muted text loses contrast in dark mode. */
  color: var(--color-text);
}
.muted {
  font-size: 0.875rem;
}
.deduction {
  color: var(--color-text);
}
a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--color-accent);
}
</style>
