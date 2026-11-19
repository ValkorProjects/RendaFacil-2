<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'

// Delete with a confirmation inside the screen, not a dialog (RF-09): used by Rendas, Dedutíveis and
// Dependentes. The default slot explains what else goes away (e.g. the expenses of a dependent).
// `v-model:open` lets the screen know, e.g. to give the confirmation a full row.
const props = withDefaults(
  defineProps<{
    // What is being deleted, written to follow "Excluir": "o cadastro de rendimentos 2".
    itemLabel: string
    triggerText?: string
    confirmText?: string
  }>(),
  { triggerText: 'Excluir', confirmText: 'Excluir' },
)

const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })

const id = useId()
const trigger = ref<HTMLButtonElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)

// The focus follows the change: to "Cancelar" when the question opens, back to the trigger after.
watch(open, async (isOpen, wasOpen) => {
  await nextTick()
  if (isOpen) cancelButton.value?.focus()
  else if (wasOpen) trigger.value?.focus()
})

const cancel = () => {
  open.value = false
}

const confirm = () => {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <div class="confirm-delete" :class="{ open }">
    <button
      v-if="!open"
      ref="trigger"
      class="confirm-delete-trigger"
      type="button"
      :aria-label="`${props.triggerText} ${props.itemLabel}`"
      aria-expanded="false"
      @click="open = true"
    >
      {{ props.triggerText }}
    </button>
    <div
      v-else
      class="confirm-delete-panel"
      role="group"
      :aria-labelledby="`${id}-question`"
      @keydown.esc.stop="cancel"
    >
      <p :id="`${id}-question`" class="confirm-delete-question">
        {{ props.confirmText }} {{ props.itemLabel }}?
      </p>
      <slot />
      <p class="confirm-delete-note">Essa ação não pode ser desfeita.</p>
      <div class="confirm-delete-actions">
        <button ref="cancelButton" class="confirm-delete-cancel" type="button" @click="cancel">
          Cancelar
        </button>
        <button class="confirm-delete-confirm" type="button" @click="confirm">
          {{ props.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-delete.open {
  flex: 1 1 100%;
  width: 100%;
}

.confirm-delete-trigger {
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--color-danger);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.confirm-delete-panel {
  display: grid;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--color-danger), transparent 55%);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--color-danger), transparent 92%);
  color: var(--color-text);
  text-align: left;
}

.confirm-delete-question {
  font-weight: 700;
}

.confirm-delete-panel :slotted(*),
.confirm-delete-note {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.confirm-delete-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.confirm-delete-actions button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: 0 1.25rem;
  border-radius: 999px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.confirm-delete-cancel {
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-raised);
  color: var(--color-text);
}

.confirm-delete-confirm {
  border: 0;
  background: var(--color-danger);
  color: var(--color-on-danger);
}
</style>
