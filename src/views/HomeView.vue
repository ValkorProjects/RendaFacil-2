<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageCard from '@/components/PageCard.vue'
import TaxEstimateCard from '@/components/TaxEstimateCard.vue'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useIncomeStore } from '@/stores/income'
import { cents, formatCurrency } from '@/utils/currency'
import { describeTaxResult } from '@/utils/taxResult'

const { canInstall, install } = usePwaInstall()
const router = useRouter()
const incomeStore = useIncomeStore()
const isIncomeSummaryOpen = ref(false)
const estimateHeadline = computed(() => {
  const estimate = incomeStore.taxEstimate
  return estimate?.ok ? describeTaxResult(estimate.result.resultado) : null
})

const openIncomeRegistration = () => {
  router.push({ name: 'income' })
}

const toggleIncomeSummary = () => {
  if (!incomeStore.items.length) {
    openIncomeRegistration()
    return
  }
  isIncomeSummaryOpen.value = !isIncomeSummaryOpen.value
}
</script>

<template>
  <div class="home">
    <PageCard eyebrow="Declaração de 2027 · ano-calendário 2026" title="Sua estimativa">
      <EmptyState
        v-if="!incomeStore.items.length"
        icon="income"
        title="Comece pelos seus rendimentos"
        text="Informe quanto recebeu em 2026 para ver se você vai restituir ou pagar imposto na declaração de 2027."
      >
        <RouterLink class="button" :to="{ name: 'income' }">Informar rendimentos</RouterLink>
      </EmptyState>
      <TaxEstimateCard
        v-else
        :estimate="incomeStore.summaryTaxEstimate"
        :payroll="incomeStore.summaryPayroll"
      />
    </PageCard>

    <nav class="shortcuts" aria-label="Atalhos da declaração">
      <RouterLink class="shortcut glass" :to="{ name: 'income' }">
        <AppIcon name="income" />
        <span>
          <strong>Rendimentos</strong>
          <small>{{ incomeStore.items.length }} lançado(s)</small>
        </span>
      </RouterLink>
      <RouterLink class="shortcut glass" :to="{ name: 'deductions' }">
        <AppIcon name="deductions" />
        <span>
          <strong>Dedutíveis</strong>
          <small>{{ incomeStore.expenses.length }} despesa(s)</small>
        </span>
      </RouterLink>
      <RouterLink class="shortcut glass" :to="{ name: 'income', hash: '#dependents-title' }">
        <AppIcon name="user" />
        <span>
          <strong>Dependentes</strong>
          <small>{{ incomeStore.dependentCount }} válido(s)</small>
        </span>
      </RouterLink>
    </nav>

    <button v-if="canInstall" class="button" type="button" @click="install">Instalar o app</button>

    <aside
      class="income-fly-card glass"
      :class="{ expanded: isIncomeSummaryOpen }"
      aria-label="Rendimentos cadastrados"
    >
      <button
        class="income-icons-button"
        type="button"
        :aria-label="
          incomeStore.items.length
            ? isIncomeSummaryOpen
              ? 'Fechar resumo dos rendimentos'
              : 'Abrir resumo dos rendimentos'
            : 'Adicionar rendimento'
        "
        :aria-expanded="isIncomeSummaryOpen"
        @click="toggleIncomeSummary"
      >
        <span v-if="!incomeStore.items.length" class="income-summary-plus" aria-hidden="true"
          >+</span
        >
        <span v-else-if="!isIncomeSummaryOpen" class="income-icon-stack" aria-hidden="true">
          <AppIcon
            v-for="item in incomeStore.items"
            :key="item.id"
            :name="item.icon"
            class="income-summary-icon"
          />
        </span>
        <span v-else class="income-summary-close" aria-hidden="true">×</span>
      </button>
      <div v-if="isIncomeSummaryOpen" class="income-summary-menu">
        <div class="income-detail-list">
          <article
            v-for="item in incomeStore.items"
            :key="`detail-${item.id}`"
            class="income-detail-card"
          >
            <AppIcon :name="item.icon" class="income-detail-icon" />
            <span class="income-detail-label">{{ item.label }}</span>
            <strong>{{ formatCurrency(cents(item.amount)) }}</strong>
          </article>
        </div>
        <div v-if="estimateHeadline" class="income-summary-row income-summary-estimate">
          <span>{{ estimateHeadline.label }}</span>
          <strong v-if="estimateHeadline.amount">{{
            formatCurrency(estimateHeadline.amount)
          }}</strong>
        </div>
        <div v-else-if="incomeStore.taxEstimate" class="income-summary-row" role="status">
          <span>Não foi possível calcular a estimativa</span>
        </div>
        <div class="income-summary-row">
          <span>Total tributável</span>
          <strong>{{ formatCurrency(incomeStore.taxableTotal) }}</strong>
        </div>
        <div class="income-summary-row">
          <span>Rendimentos isentos</span>
          <strong>{{ formatCurrency(incomeStore.exemptTotal) }}</strong>
        </div>
        <div class="income-summary-row">
          <span>Dependentes</span>
          <strong>{{ incomeStore.dependentCount }}</strong>
        </div>
        <button class="summary-add-button" type="button" @click="openIncomeRegistration">
          + Adicionar rendimento
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.home {
  display: grid;
  justify-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 56rem;
}

/* One column on phones, three across once there is room. */
.shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.75rem;
  width: 100%;
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  min-height: 3.5rem;
  padding: 0.875rem 1.25rem;
  border-radius: 1.25rem;
  color: var(--color-text);
  text-decoration: none;
}

.shortcut span {
  display: grid;
}

.shortcut :deep(svg) {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--color-accent);
}

.shortcut small {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.income-fly-card {
  position: fixed;
  z-index: 20;
  top: max(1rem, env(safe-area-inset-top));
  right: max(1rem, env(safe-area-inset-right));
  display: grid;
  width: 10vw;
  min-width: 5.5rem;
  max-width: 8rem;
  padding: 0.45rem;
  border-radius: 1.1rem;
}

.income-fly-card.expanded {
  width: max-content;
  min-width: min(12rem, 50vw);
  max-width: 50vw;
}

.income-icons-button {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 3.5rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  cursor: pointer;
}

.income-icon-stack {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  max-height: 12rem;
  overflow: hidden;
}

.income-summary-icon {
  width: 1.35rem;
  height: 1.35rem;
  padding: 0.22rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.income-summary-plus {
  display: grid;
  place-items: center;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-size: 2rem;
  line-height: 1;
}

.income-summary-close {
  color: var(--color-text-muted);
  font-size: 1.5rem;
  font-weight: 500;
  line-height: 1;
}

.income-summary-menu {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.45rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--glass-border);
}

.income-detail-list {
  display: grid;
  gap: 0.45rem;
  padding-bottom: 0.15rem;
}

.income-detail-card {
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  width: min(100%, 18rem);
  margin-inline: auto;
  padding: 0.45rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.85rem;
  background: var(--glass-bg-raised-solid);
  color: var(--color-text-muted);
  font-size: 0.72rem;
  text-align: center;
}

.income-detail-icon {
  width: 1.3rem;
  height: 1.3rem;
  padding: 0.2rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.income-detail-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.income-detail-card strong {
  color: var(--color-text);
  font-size: 0.75rem;
  white-space: nowrap;
}

.income-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.income-summary-row strong {
  color: var(--color-text);
  font-size: 0.78rem;
  text-align: right;
}

.income-summary-estimate {
  padding-bottom: 0.45rem;
  border-bottom: 1px solid var(--glass-border);
  color: var(--color-text);
  font-weight: 700;
}

.income-summary-estimate strong {
  color: var(--color-accent);
}

.summary-add-button {
  width: 100%;
  padding: 0.5rem;
  border: 0;
  border-radius: 0.6rem;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 30rem) {
  .income-fly-card {
    top: max(0.75rem, env(safe-area-inset-top));
    right: max(0.75rem, env(safe-area-inset-right));
    width: 10vw;
    min-width: 5.5rem;
  }

  .income-fly-card.expanded {
    width: max-content;
    min-width: min(12rem, 50vw);
    max-width: 50vw;
  }
}
</style>
