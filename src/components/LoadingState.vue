<script setup lang="ts">
// Waiting for data (RF-09). The message is announced to screen readers.
withDefaults(defineProps<{ message?: string }>(), { message: 'Carregando…' })
</script>

<template>
  <div class="state loading-state" role="status">
    <span class="spinner" aria-hidden="true" />
    <p>{{ message }}</p>
  </div>
</template>

<style scoped>
.loading-state {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
  color: var(--color-text-muted);
  text-align: center;
}

.spinner {
  width: 1.75rem;
  height: 1.75rem;
  border: 3px solid var(--glass-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
