// @ts-check

import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, describe, expect, inject, it } from 'vitest'

import { appendDotExeOnWindows } from '../os.js'
import { findToolPath } from '../tool.js'
import { addr2line } from './addr2Line.js'

/** @typedef {import('./decode.slow-test.js').TestEnv} TestEnv */

// @ts-ignore
const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testsPath = path.join(__dirname, '..', '..', '..', '.tests')
const coredumpsPath = path.join(testsPath, 'coredumps')
const fqbn = new FQBN('esp32:esp32:esp32da')
const elfPath = path.join(coredumpsPath, 'Dumper', fqbn.boardId, 'firmware.elf')

describe('addr2line (slow)', () => {
  /** @type {TestEnv} */
  let testEnv
  let toolPath

  beforeAll(async () => {
    // @ts-ignore
    testEnv = inject('testEnv')
    expect(testEnv).toBeDefined()

    toolPath = await findToolPath({
      fqbn,
      arduinoCliPath: testEnv.cliContext.cliPath,
    })
  })

  it('should error when the tool is not found', async () => {
    const missingToolPath = path.join(
      __dirname,
      appendDotExeOnWindows('missing-tool')
    )
    await expect(
      addr2line({ elfPath, toolPath: missingToolPath }, [0])
    ).rejects.toThrow(`GDB tool not found at ${missingToolPath}`)
  })

  it('should error when the elf is not found', async () => {
    const missingElfPath = path.join(__dirname, 'missing-elf.elf')
    await expect(
      addr2line({ elfPath: missingElfPath, toolPath }, [0])
    ).rejects.toThrow(
      `The ELF file does not exist or is not readable: ${missingElfPath}`
    )
  })

  it('should error when the elf is not valid format', async () => {
    const notAnElfPath = __filename
    await expect(
      addr2line({ elfPath: notAnElfPath, toolPath }, [0])
    ).rejects.toThrow(
      `The ELF file is not in executable format: ${notAnElfPath}`
    )
  })

  it('should error when no addresses to decode', async () => {
    await expect(addr2line({ elfPath, toolPath }, [])).rejects.toThrow(
      'No register addresses found to decode'
    )
  })
})
