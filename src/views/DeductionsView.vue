<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import PageCard from '@/components/PageCard.vue'
</script>

<!-- Placeholder for the Dedutíveis tab: the expenses screen itself is RF-13 (#14). -->
<template>
  <PageCard class="deductions-page" eyebrow="Declaração anual" title="Dedutíveis">
    <EmptyState
      icon="deductions"
      title="Nenhuma despesa lançada"
      text="Em breve você poderá lançar aqui despesas de saúde, educação e pensão alimentícia, e ver quanto cada uma reduz o seu imposto."
    />
  </PageCard>
</template>

<style scoped>
.deductions-page :deep(.body) {
  justify-items: stretch;
}
</style>
