<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useIncomeStore } from '@/stores/income'
import DataSyncStatus from '@/components/DataSyncStatus.vue'
import BottomNav from '@/components/BottomNav.vue'
import LoadingState from '@/components/LoadingState.vue'

const UserView = defineAsyncComponent(() => import('@/views/UserView.vue'))
const AppHeader = defineAsyncComponent(() => import('@/components/AppHeader.vue'))
const income = useIncomeStore()
const ready = ref(false)
const isGuest = ref(true)
const route = useRoute()
// The header and the bottom bar frame the internal screens (RF-09), so only a signed-in user sees them.
const signedIn = computed(() => ready.value && !isGuest.value)

onMounted(() => {
  const init = () => {
    void import('@/stores/auth').then(({ useAuthStore }) => {
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
  }

  requestAnimationFrame(() => window.setTimeout(init, 0))
})
</script>

<template>
  <AppHeader v-if="signedIn" />
  <main class="app-main" :class="signedIn ? 'app-main--shell' : 'app-main--centered'">
    <LoadingState v-if="!ready" message="Verificando sua sessão…" />
    <UserView v-else-if="isGuest && !route.meta.public" />
    <template v-else>
      <DataSyncStatus v-if="signedIn" />
      <fieldset class="data-content" :disabled="income.saving" :aria-busy="income.saving">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="income.accountId ?? 'guest'" />
          </Transition>
        </RouterView>
      </fieldset>
    </template>
  </main>
  <BottomNav v-if="signedIn" />
</template>

<style scoped>
.data-content {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  width: 100%;
}
.app-main {
  display: grid;
  justify-items: center;
  width: 100%;
  padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right));
}

/* Access form, session check and public pages for guests: one card in the middle of the screen. */
.app-main--centered {
  place-items: center;
  min-height: 100dvh;
  padding-block: calc(1.5rem + env(safe-area-inset-top)) calc(1.5rem + env(safe-area-inset-bottom));
}

/* Internal screens: a column under the greeting, centered on wide screens, clear of the bottom bar. */
.app-main--shell {
  align-content: start;
  max-width: var(--content-max);
  margin-inline: auto;
  padding-bottom: var(--nav-clearance);
  /* Cards fill the column, so they line up with the greeting. */
  --page-card-max: 100%;
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
