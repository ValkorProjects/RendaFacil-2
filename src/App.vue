<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { RouterView } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'
import UserView from '@/views/UserView.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { ready, isGuest } = storeToRefs(auth)
</script>

<template>
  <main class="app-main">
    <p v-if="!ready" class="auth-loading" role="status">Verificando sua sessão…</p>
    <UserView v-else-if="isGuest" />
    <RouterView v-else v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
  <BottomNav v-if="ready && !isGuest" />
</template>

<style scoped>
.app-main {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: calc(1.5rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    var(--nav-clearance) max(1rem, env(safe-area-inset-left));
}

.auth-loading {
  color: var(--color-text-muted);
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
