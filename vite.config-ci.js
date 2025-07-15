// @ts-check

import { defineConfig } from 'vitest/config'

import slowConfig from './vite.config-slow.js'

const copy = JSON.parse(JSON.stringify(slowConfig))
copy.test = {
  ...copy.test,
  include: ['src/**/*test.js', '!src/**/*.smoke-test.js'],
}

export default defineConfig(copy)
