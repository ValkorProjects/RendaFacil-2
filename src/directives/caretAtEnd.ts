import type { Directive } from 'vue'

// The money mask fills the value from the right, like a calculator display: typing 6, 5, 0, 0, 0, 0
// gives R$ 0,06 … R$ 6.500,00. That only works with the caret at the end. A click, a tap, Home or
// the arrow keys used to put it in the middle, and the next digits went in there
// (R$ 5.000.060,00 instead of R$ 6.500,00). So the caret is kept at the end. Selecting the whole
// value is still allowed, so it can be replaced by typing.

const NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

// The whole number is selected (Ctrl+A, double click…), with or without the "R$ " before it.
export function wholeValueSelected(value: string, start: number, end: number): boolean {
  const firstDigit = value.search(/\d/)
  return start !== end && end === value.length && start <= Math.max(firstDigit, 0)
}

export function keepCaretAtEnd(input: HTMLInputElement) {
  if (input.ownerDocument.activeElement !== input) return
  const end = input.value.length
  const start = input.selectionStart ?? end
  const selectionEnd = input.selectionEnd ?? end
  if (start === end && selectionEnd === end) return
  if (wholeValueSelected(input.value, start, selectionEnd)) return
  input.setSelectionRange(end, end)
}

interface Pinned {
  input: HTMLInputElement
  listeners: [string, EventListener][]
}

const pinned = new WeakMap<HTMLElement, Pinned>()

// On an <input>, or on a component whose root is one (like v-money3's Money3Component).
export const vCaretAtEnd: Directive<HTMLElement> = {
  mounted(el) {
    const input = el instanceof HTMLInputElement ? el : el.querySelector('input')
    if (!input) return

    const pin = () => keepCaretAtEnd(input)
    const listeners: [string, EventListener][] = [
      [
        'keydown',
        (event) => {
          if (NAVIGATION_KEYS.has((event as KeyboardEvent).key)) {
            event.preventDefault()
            pin()
          }
        },
      ],
      // The browser places the caret after focus and on mouse/touch release, so check after those.
      ['focus', () => setTimeout(pin, 0)],
      ['mouseup', pin],
      ['click', pin],
      ['select', pin],
      // Long press and drag handles on phones, where the browser fires it on the input.
      ['selectionchange', pin],
    ]
    for (const [type, listener] of listeners) input.addEventListener(type, listener)
    pinned.set(el, { input, listeners })
  },
  unmounted(el) {
    const entry = pinned.get(el)
    if (!entry) return
    for (const [type, listener] of entry.listeners) entry.input.removeEventListener(type, listener)
    pinned.delete(el)
  },
}
