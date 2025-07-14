// @ts-check

import path from 'node:path'

import { FQBN } from 'fqbn'
import { beforeAll, describe, expect, inject, it } from 'vitest'

import { exec } from './exec.js'
import { findToolPath } from './tool.js'

/** @typedef {import('./decode/decode.slow-test.js').TestEnv} TestEnv */

const esp32Boards = ['esp32', 'esp32s2', 'esp32s3', 'esp32c3']
const esp8266Boards = ['generic']

const expectedToolFilenames = {
  esp32: 'xtensa-esp32-elf-gdb',
  esp32s2: 'xtensa-esp32s2-elf-gdb',
  esp32s3: 'xtensa-esp32s3-elf-gdb',
  esp32c3: 'riscv32-esp-elf-gdb',
  generic: 'xtensa-lx106-elf-gdb',
}

const findToolTestParams = /** @type {const} */ ([
  {
    id: ['esp32', 'esp32'],
    toolsInstallType: 'cli',
    boards: [...esp32Boards],
  },
  {
    id: ['espressif', 'esp32'],
    toolsInstallType: 'git',
    boards: [...esp32Boards],
  },
  {
    id: ['esp8266', 'esp8266'],
    toolsInstallType: 'cli',
    boards: [...esp8266Boards],
  },
])

/** @param {(typeof findToolTestParams)[number]} params */
function describeFindToolPathSuite(params) {
  const [vendor, arch] = params.id
  const platformId = `${vendor}:${arch}`
  return describe(`findToolPath for '${platformId}' platform installed via '${params.toolsInstallType}'`, () => {
    /** @type {TestEnv} */
    let testEnv

    beforeAll(() => {
      // @ts-ignore
      testEnv = inject('testEnv')
      expect(testEnv).toBeDefined()
    })

    params.boards
      .map((boardId) => ({ fqbn: `${platformId}:${boardId}`, boardId }))
      .map(({ fqbn, boardId }) =>
        it(`should find the tool path for '${fqbn}'`, async () => {
          const arduinoCliPath = testEnv.cliContext.cliPath
          const arduinoCliConfigPath =
            testEnv.toolsEnvs[params.toolsInstallType].cliConfigPath
          const actual = await findToolPath({
            arduinoCliPath,
            fqbn: new FQBN(fqbn),
            arduinoCliConfigPath,
          })
          expect(actual).toBeDefined()
          const actualFilename = path.basename(actual, path.extname(actual))
          expect(actualFilename).toEqual(expectedToolFilenames[boardId])
          const { stdout } = await exec(actual, ['--version'])
          expect(stdout).toContain('GNU gdb')
        })
      )
  })
}

describe('tool (slow)', () => {
  findToolTestParams.map(describeFindToolPathSuite)
})
