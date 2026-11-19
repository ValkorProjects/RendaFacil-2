<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'
import LoadingState from '@/components/LoadingState.vue'
import { useIncomeStore } from '@/stores/income'

const UserView = defineAsyncComponent(() => import('@/views/UserView.vue'))
const AppHeader = defineAsyncComponent(() => import('@/components/AppHeader.vue'))
const ready = ref(false)
const isGuest = ref(true)
const accountDataReady = ref(true)
const accountDataLoading = ref(false)
const accountDataError = ref('')
const retryAccountData = ref<() => Promise<void>>(async () => {})
const route = useRoute()
// The header and the bottom bar frame the internal screens (RF-09), so only a signed-in user sees them.
const signedIn = computed(() => ready.value && !isGuest.value)

onMounted(() => {
  const init = () => {
    void import('@/stores/auth').then(({ useAuthStore }) => {
      const auth = useAuthStore()
      const income = useIncomeStore()
      watch(
        [
          () => auth.ready,
          () => auth.isGuest,
          () => auth.accountDataReady,
          () => income.accountDataLoading,
          () => income.accountDataError,
        ],
        ([authReady, guest, dataReady, dataLoading, dataError]) => {
          ready.value = authReady
          isGuest.value = guest
          accountDataReady.value = dataReady
          accountDataLoading.value = dataLoading
          accountDataError.value = dataError
          retryAccountData.value = auth.retryAccountData
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
    <LoadingState
      v-else-if="signedIn && (!accountDataReady || accountDataLoading)"
      message="Carregando sua declaração…"
    />
    <section v-else-if="signedIn && accountDataError" class="data-load-error" role="alert">
      <p>Não foi possível carregar sua declaração. Seus dados não foram substituídos.</p>
      <p>{{ accountDataError }}</p>
      <button type="button" @click="retryAccountData">Tentar novamente</button>
    </section>
    <UserView v-else-if="isGuest && !route.meta.public" />
    <RouterView v-else v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
  <BottomNav v-if="signedIn" />
</template>

<style scoped>
.data-load-error {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  max-width: 34rem;
  padding: 1.25rem;
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  background: var(--glass-bg-raised);
  color: var(--color-text);
  text-align: center;
}

.data-load-error p {
  margin: 0;
}

.data-load-error button {
  min-height: 2.75rem;
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
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
