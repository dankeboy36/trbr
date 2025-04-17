// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'

import { decodeCoredump } from './coredump.js'

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

describe('coredump', () => {
  /** @type {NodeJS.Platform}  */
  let originalPlatform

  beforeAll(() => {
    originalPlatform = process.platform
  })

  afterAll(() => {
    setPlatform(originalPlatform)
  })

  describe('decodeCoredump', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should decode the coredump', async () => {
      const input = await fs.readFile(
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          '.tests',
          'coredumps',
          'crash_test',
          'coredump.elf'
        )
      )
      const panicInfo = await decodeCoredump(
        { targetArch: 'xtensa' },
        input,
        {}
      )
      // const formattedPanicInfo = {
      //   ...panicInfo,
      //   reg: Object.entries(panicInfo.regs).reduce((acc, value) => {
      //     const [key, val] = value
      //     acc[key] = `0x${val.toString(16).padStart(8, '0')}`
      //     return acc
      //   }, {}),
      // }
      console.log(JSON.stringify(panicInfo, null, 2))
    })
  })

  function setPlatform(platform) {
    Object.defineProperty(process, 'platform', { value: platform })
  }
})
