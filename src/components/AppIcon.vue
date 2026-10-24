<script setup lang="ts">
export type IconName = 'home' | 'income' | 'user' | 'settings' | 'info'

defineProps<{
  name: IconName
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </template>
    <template v-else-if="name === 'income'">
      <path d="M4 19V5M4 19h16" />
      <path d="m7 15 3-3 2 2 5-6" />
      <path d="M14 8h3v3" />
    </template>
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h6M16 18h4" />
      <circle cx="15" cy="6" r="2.5" />
      <circle cx="9" cy="12" r="2.5" />
      <circle cx="13" cy="18" r="2.5" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </template>
  </svg>
</template>
