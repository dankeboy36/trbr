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
    env: { FORCE_COLOR: '1' }, // https://github.com/vitest-dev/vitest/discussions/3351
  },
})
