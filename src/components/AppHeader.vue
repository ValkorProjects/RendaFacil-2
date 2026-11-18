<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { greeting, readProfile } from '@/utils/profile'

const auth = useAuthStore()
const text = computed(() => greeting(readProfile(auth.user).name))
</script>

<template>
  <header class="app-header">
    <p class="greeting">{{ text }}</p>
  </header>
</template>

<style scoped>
.app-header {
  width: 100%;
  max-width: var(--content-max);
  margin-inline: auto;
  padding: calc(1rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 0.75rem
    max(1rem, env(safe-area-inset-left));
}

.greeting {
  overflow: hidden;
  font-size: 1.375rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
