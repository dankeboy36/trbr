// @ts-check

import { setupTestEnv } from './scripts/env/env.js'

/**
 * @param {import('vitest/node').TestProject} project
 */
export async function setup(project) {
  const testEnv = await setupTestEnv()
  // @ts-ignore
  project.provide('testEnv', testEnv)
}
