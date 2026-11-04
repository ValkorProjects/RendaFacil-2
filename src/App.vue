<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { defineAsyncComponent } from 'vue'
import { RouterView } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'

const UserView = defineAsyncComponent(() => import('@/views/UserView.vue'))
const ready = ref(false)
const isGuest = ref(true)

onMounted(async () => {
  const { useAuthStore } = await import('@/stores/auth')
  const auth = useAuthStore()
  watch(
    [() => auth.ready, () => auth.isGuest],
    ([authReady, guest]) => {
      ready.value = authReady
      isGuest.value = guest
    },
    { immediate: true },
  )
})
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
