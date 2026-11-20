import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so the unit tests don't load the Vue and PWA plugins.
// https://vitest.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // The engine suite lives in `__tests__/*.spec.ts`; `*.test.ts` files sit next to the code.
    include: ['src/**/__tests__/*.spec.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
})
