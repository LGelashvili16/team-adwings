import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    {
      name: 'pwa-register-test-module',
      resolveId(id) {
        // The production plugin generates this module; hook tests provide its implementation with vi.mock.
        if (id === 'virtual:pwa-register') return id
      },
    },
  ],
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
