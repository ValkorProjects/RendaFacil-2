<script setup lang="ts">
import { RouterView } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'
import { useAuthStore } from '@/stores/auth'

useAuthStore()
</script>

<template>
  <main class="app-main">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
  <BottomNav />
</template>

<style scoped>
.app-main {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: calc(1.5rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    var(--nav-clearance) max(1rem, env(safe-area-inset-left));
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(0.5rem);
}

.page-leave-to {
  opacity: 0;
}
</style>
