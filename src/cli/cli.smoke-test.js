// @ts-check

import { readdirSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, describe, expect, inject, it } from 'vitest'

import { exec } from '../lib/exec.js'

/** @typedef {import('../lib/decode/decode.slow-test.js').TestEnv} TestEnv */

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const testsPath = path.join(__dirname, '..', '..', '.tests')
const coredumpsPath = path.join(testsPath, 'coredumps')
const dumpTypes = /** @type {const} */ ([
  'esp-coredump',
  'read_flash',
  'esp_partition_read',
])

const coredumpTestParams = readdirSync(coredumpsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((dirent) =>
    readdirSync(path.join(coredumpsPath, dirent.name), {
      withFileTypes: true,
    })
  )
  .flatMap((dirent) =>
    dumpTypes.map((dumpType) => ({
      fqbn: new FQBN(`esp32:esp32:${dirent.name}`),
      ...dirent,
      dumpType,
    }))
  )

describe('cli (smoke)', () => {
  /** @type {string} */
  let arduinoCliConfigPath
  /** @type {string} */
  let trbrCliPath

  beforeAll(() => {
    /** @type {TestEnv} */
    // @ts-ignore
    const testEnv = inject('testEnv')
    expect(testEnv).toBeDefined()
    arduinoCliConfigPath = testEnv.toolsEnvs['cli'].cliConfigPath
    expect(arduinoCliConfigPath).toBeDefined()
    // @ts-ignore
    trbrCliPath = inject('trbrCliPath')
    expect(trbrCliPath).toBeDefined()
  })

  describe('coredump', () => {
    coredumpTestParams.map(({ dumpType, name, parentPath, fqbn }) =>
      it(`should decode ${dumpType} coredump from ${name} for ${fqbn}`, async () => {
        const currentPath = path.join(parentPath, name)
        const elfPath = path.join(currentPath, 'firmware.elf')
        const coredumpPath = path.join(currentPath, `${dumpType}-dump.raw`)
        const args = [
          'decode',
          '--elf-path',
          elfPath,
          '--fqbn',
          fqbn.toString(),
          '--arduino-cli-config',
          arduinoCliConfigPath,
          '--input',
          coredumpPath,
          '--coredump-mode',
          '--no-color',
        ]

        const envCopy = JSON.parse(JSON.stringify(process.env))
        if (envCopy.NODE_OPTIONS?.includes('--inspect-publish-uid=http')) {
          // Let the smoke tests run from VS Code JS Debug console.
          // Otherwise, it's an '--inspect-publish-uid= is not allowed in NODE_OPTIONS' error.
          delete envCopy.NODE_OPTIONS
        }
        const { stdout: actual } = await exec(trbrCliPath, args, {
          env: envCopy,
        })

        const expectedPath = path.join(
          currentPath,
          dumpType !== 'esp_partition_read'
            ? 'expected.txt'
            : 'esp_partition_read-expected.txt' // TODO: why is it different for Wroom?
        )

        let expected
        try {
          expected = await fs.readFile(expectedPath, 'utf8')
        } catch (err) {
          if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            path.join(currentPath, 'expected.txt')
            await fs.writeFile(expectedPath, actual)
            expected = actual
          }
        }

        const normalize = (text) => text.replace(/\r\n/g, '\n').trim()
        const normalizedActual = normalize(actual)
        const normalizedExpected = normalize(expected)
        expect(normalizedActual).toEqual(normalizedExpected)
      })
    )
  })
})
