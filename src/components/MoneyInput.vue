<script setup lang="ts">
import { Money3Component } from 'v-money3'
import { vCaretAtEnd } from '@/directives/caretAtEnd'
import { moneyConfig } from '@/utils/currency'

// Money field: the v-money3 mask ("R$ 6.500,00", cents typed from the right) with the caret kept at
// the end, so the digits always come out in the order they are typed. `class`, `id` and
// `aria-label` go to the <input>.
const model = defineModel<string>({ required: true })
</script>

<template>
  <Money3Component
    v-caret-at-end
    :model-value="model"
    v-bind="moneyConfig"
    inputmode="numeric"
    @update:model-value="model = String($event)"
  />
</template>
