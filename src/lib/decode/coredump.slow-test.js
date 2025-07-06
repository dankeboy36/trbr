// @ts-check

import { readdirSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'

import { findToolPath } from '../tool.js'
import { decodeCoredump } from './coredump.js'
import { isRiscvFQBN } from './riscv.js'
import { stringifyDecodeResult } from './stringify.js'

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const testsPath = path.join(__dirname, '..', '..', '..', '.tests')
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

describe('coredump (slow)', () => {
  /** @type {import('./decode.slow-test.js').TestEnv} */
  let testEnv

  beforeAll(() => {
    // @ts-ignore
    testEnv = inject('testEnv')
    expect(testEnv).toBeDefined()
  })

  describe('decodeCoredump', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    coredumpTestParams.map(({ name, fqbn, parentPath, dumpType }) =>
      it(`should decode ${dumpType} coredump from ${name} for ${fqbn}`, async () => {
        const currentPath = path.join(parentPath, name)
        const elfPath = path.join(currentPath, 'firmware.elf')
        const coredumpPath = path.join(parentPath, name, `${dumpType}-dump.raw`)

        const toolPath = await findToolPath({
          arduinoCliPath: testEnv.cliContext.cliPath,
          fqbn,
          arduinoCliConfig: testEnv.toolsEnvs['cli'].cliConfigPath,
        })

        const decodeResult = await decodeCoredump({
          targetArch: isRiscvFQBN(fqbn) ? fqbn.boardId : 'xtensa',
          coredumpPath,
          elfPath,
          toolPath,
        })

        const actual = stringifyDecodeResult(decodeResult, {
          color: 'disable',
          lineSeparator: '\n',
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
        expect(normalize(actual)).toEqual(normalize(expected))
      })
    )

    it('should support cancellation', async () => {
      const { name, fqbn, parentPath, dumpType } = coredumpTestParams[0]

      const currentPath = path.join(parentPath, name)
      const elfPath = path.join(currentPath, 'firmware.elf')
      const coredumpPath = path.join(parentPath, name, `${dumpType}-dump.raw`)

      const toolPath = await findToolPath({
        arduinoCliPath: testEnv.cliContext.cliPath,
        fqbn,
        arduinoCliConfig: testEnv.toolsEnvs['cli'].cliConfigPath,
      })

      const controller = new AbortController()
      const { signal } = controller
      setTimeout(() => controller.abort(), 10)

      await expect(
        decodeCoredump(
          {
            targetArch: isRiscvFQBN(fqbn) ? fqbn.boardId : 'xtensa',
            coredumpPath,
            elfPath,
            toolPath,
          },
          { signal },
          true
        )
      ).rejects.toThrow(/user abort/gi)
    })
  })
})
