// @ts-check

import { defineConfig } from 'vitest/config'

import baseConfig from './vite.config.js'

const copy = JSON.parse(JSON.stringify(baseConfig))
copy.test = {
  ...copy.test,
  include: ['src/**/*.slow-test.js'],
  testTimeout: 600_000, // TODO
  hookTimeout: 600_000, // TODO
  globalSetup: ['./vitest.setup-slow.js'],
}

export default defineConfig(copy)
