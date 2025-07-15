// @ts-check

import { defineConfig } from 'vitest/config'

import baseConfig from './vite.config.js'

const copy = JSON.parse(JSON.stringify(baseConfig))
copy.test = {
  ...copy.test,
  include: ['src/**/*.smoke-test.js'],
  testTimeout: 60_000,
  hookTimeout: 60_000,
  globalSetup: ['./vitest.setup-smoke.js'],
}

export default defineConfig(copy)
