<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
}>()
</script>

<template>
  <section class="page-card glass">
    <p class="eyebrow">{{ eyebrow }}</p>
    <h1 class="title">{{ title }}</h1>
    <div class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.page-card {
  width: 100%;
  /* The internal screens set --page-card-max to fill their column (App.vue). */
  max-width: var(--page-card-max, 40rem);
  padding: 2rem 1.5rem;
  border-radius: 1.75rem;
  text-align: center;
}

.eyebrow {
  color: var(--color-accent);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.title {
  font-size: clamp(2rem, 1.4rem + 3vw, 3.25rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.body {
  display: grid;
  justify-items: center;
  gap: 1.25rem;
  margin-top: 1rem;
  color: var(--color-text-muted);
  font-size: 1.0625rem;
}

@media (min-width: 48rem) {
  .page-card {
    padding: 3rem;
  }
}
</style>
