<script setup lang="ts">
import AppIcon, { type IconName } from '@/components/AppIcon.vue'

// A list with nothing in it yet (RF-09). The default slot takes the action, e.g. an "add" button.
defineProps<{
  title: string
  text?: string
  icon?: IconName
}>()
</script>

<template>
  <section class="state empty-state">
    <AppIcon v-if="icon" :name="icon" class="state-icon" />
    <h2 class="state-title">{{ title }}</h2>
    <p v-if="text" class="state-text">{{ text }}</p>
    <slot />
  </section>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 1.5rem 1rem;
  border: 1px dashed var(--glass-border);
  border-radius: 1.25rem;
  text-align: center;
}

.state-icon {
  width: 2rem;
  height: 2rem;
  color: var(--color-accent);
}

.state-title {
  color: var(--color-text);
  font-size: 1.0625rem;
}

.state-text {
  max-width: 28rem;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.empty-state :slotted(*:not(.state-text)) {
  margin-top: 0.5rem;
}
</style>
