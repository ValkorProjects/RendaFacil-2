<script setup lang="ts">
export type IconName =
  | 'home'
  | 'income'
  | 'deductions'
  | 'menu'
  | 'user'
  | 'privacy'
  | 'settings'
  | 'info'
  | 'logout'
  | 'trash'

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
    <template v-else-if="name === 'deductions'">
      <!-- A receipt: the expenses that may reduce the tax. -->
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </template>
    <template v-else-if="name === 'menu'">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </template>
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </template>
    <template v-else-if="name === 'privacy'">
      <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
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
    <template v-else-if="name === 'logout'">
      <!-- A door with an arrow leaving it. -->
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 7V4h6v3" />
      <path d="m6 7 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </template>
  </svg>
</template>
