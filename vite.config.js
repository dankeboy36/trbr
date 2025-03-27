// @ts-check

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  esbuild: {
    include: ['src/**/*.js'],
    exclude: [],
    loader: 'jsx',
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
    },
    globals: true,
    env: { FORCE_COLOR: '1' }, // https://github.com/vitest-dev/vitest/discussions/3351
  },
})
