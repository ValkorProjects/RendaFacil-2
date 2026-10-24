<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'

// `name` is the route name from src/router/index.ts.
const items: { name: string; label: string; icon: IconName }[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'income', label: '+Renda', icon: 'income' },
  { name: 'user', label: 'User', icon: 'user' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
  { name: 'info', label: 'Info', icon: 'info' },
]

const route = useRoute()
const activeIndex = computed(() => items.findIndex((item) => item.name === route.name))
</script>

<template>
  <nav
    class="nav-island glass"
    aria-label="Main"
    :style="{ '--count': items.length, '--index': activeIndex }"
  >
    <span v-if="activeIndex >= 0" class="nav-indicator" aria-hidden="true" />
    <RouterLink v-for="item in items" :key="item.name" :to="{ name: item.name }" class="nav-item">
      <AppIcon class="nav-icon" :name="item.icon" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav-island {
  --pad: 0.375rem;

  position: fixed;
  z-index: 10;
  inset-inline: 0;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: repeat(var(--count), 1fr);
  width: min(calc(100% - 2rem), 24rem);
  margin-inline: auto;
  padding: var(--pad);
  border-radius: 999px;
}

/* The glass capsule that slides under the active item. */
.nav-indicator {
  position: absolute;
  inset-block: var(--pad);
  left: var(--pad);
  width: calc((100% - 2 * var(--pad)) / var(--count));
  border-radius: 999px;
  background: var(--glass-bg-raised);
  box-shadow:
    0 2px 10px rgb(0 0 0 / 0.08),
    inset 0 1px 0 var(--glass-highlight);
  transform: translateX(calc(var(--index) * 100%));
  /* Slight overshoot, for a springy feel. */
  transition: transform 450ms cubic-bezier(0.3, 1.4, 0.5, 1);
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  min-height: 3.25rem;
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-decoration: none;
  transition:
    color 200ms ease,
    transform 200ms ease;
}

.nav-item:active {
  transform: scale(0.92);
}

.nav-item.router-link-active {
  color: var(--color-accent);
}

.nav-item:focus-visible {
  outline-offset: -2px;
}

.nav-icon {
  width: 1.5rem;
  height: 1.5rem;
}

/* Desktop: wider island, icon and label side by side. */
@media (min-width: 48rem) {
  .nav-island {
    bottom: 1.5rem;
    width: min(calc(100% - 2rem), 34rem);
  }

  .nav-item {
    flex-direction: row;
    gap: 0.5rem;
    min-height: 3rem;
    font-size: 0.9375rem;
  }

  .nav-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
}
</style>
