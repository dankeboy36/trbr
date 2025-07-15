// @ts-check

import { setupTestEnv } from './scripts/env/env.js'
import { setupTrbrCli } from './scripts/smoke/smoke.js'

/** @param {import('vitest/node').TestProject} project */
export async function setup(project) {
  const testEnv = await setupTestEnv()
  // @ts-ignore
  project.provide('testEnv', testEnv)

  const trbrCliPath = await setupTrbrCli()
  // @ts-ignore
  project.provide('trbrCliPath', trbrCliPath)
}
