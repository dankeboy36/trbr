// @ts-check

import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    include: ['src/**/*.js'],
    exclude: [],
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
    },
    globals: true,
  },
})
