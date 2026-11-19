<script setup lang="ts">
import { useIncomeStore } from '@/stores/income'
const store = useIncomeStore()
</script>

<template>
  <div class="sync-status" aria-live="polite">
    <p v-if="store.loading" role="status">Carregando sua declaração de 2026…</p>
    <div v-if="store.loadError" role="alert">
      <p>{{ store.loadError }}</p>
      <button class="button" :disabled="store.loading" @click="store.retryLoad">
        Tentar novamente
      </button>
    </div>
    <p v-if="store.saveError" role="alert">{{ store.saveError }}</p>
    <p v-if="store.saving" role="status">Salvando alterações…</p>
  </div>
</template>

<style scoped>
.sync-status {
  width: 100%;
}
.sync-status:has(p) {
  padding: 1rem;
}
[role='alert'] {
  color: var(--color-danger);
}
</style>
