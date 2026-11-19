<script setup lang="ts">
// Something failed to load or save (RF-09). With `retryLabel`, shows a button that emits `retry`.
withDefaults(
  defineProps<{
    title?: string
    message?: string
    retryLabel?: string
  }>(),
  { title: 'Algo deu errado', message: '', retryLabel: '' },
)

defineEmits<{ retry: [] }>()
</script>

<template>
  <section class="state error-state" role="alert">
    <h2 class="state-title">{{ title }}</h2>
    <p v-if="message" class="state-text">{{ message }}</p>
    <button v-if="retryLabel" class="button" type="button" @click="$emit('retry')">
      {{ retryLabel }}
    </button>
  </section>
</template>

<style scoped>
.error-state {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 1.25rem 1rem;
  border: 1px solid color-mix(in srgb, var(--color-danger), transparent 55%);
  border-radius: 1.25rem;
  background: color-mix(in srgb, var(--color-danger), transparent 90%);
  text-align: center;
}

.state-title {
  color: var(--color-danger);
  font-size: 1.0625rem;
}

.state-text {
  max-width: 28rem;
  color: var(--color-text);
  font-size: 0.9375rem;
}

.button {
  margin-top: 0.5rem;
}
</style>
