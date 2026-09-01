import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * Tests unitaires de la logique pure : sélecteurs, formats, prompts,
 * chiffrement. Les écrans sont couverts par le banc de rendu
 * (scripts/render-check.mts), la base par supabase/tests.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
