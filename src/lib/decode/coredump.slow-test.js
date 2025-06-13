// @ts-check

import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'

import { findToolPath } from '../tool.js'
import { decodeCoredump } from './coredump.js'
import { stringifyAddr } from './decode.js'

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const coredumpsPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.tests',
  'coredumps',
  'esp32c3' // TODO: remove
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

    it('should decode the coredump', async () => {
      const coredumpPath = path.join(
        coredumpsPath,
        'crash_test',
        'coredump.elf'
      )
      const elfPath = path.join(coredumpsPath, 'crash_test', 'firmware.elf')
      const toolPath = await findToolPath({
        arduinoCliPath: testEnv.cliContext.cliPath,
        fqbn: new FQBN('esp32:esp32:esp32c3'),
        arduinoCliConfig: testEnv.toolsEnvs['cli'].cliConfigPath,
      })

      const panicInfos = await decodeCoredump({
        // targetArch: 'xtensa',
        toolPath,
        elfPath,
        coredumpPath,
      })
      // const formattedPanicInfo = {
      //   ...panicInfo,
      //   reg: Object.entries(panicInfo.regs).reduce((acc, value) => {
      //     const [key, val] = value
      //     acc[key] = `0x${val.toString(16).padStart(8, '0')}`
      //     return acc
      //   }, {}),
      // }

      const lines = []
      for (const { threadId, threadName, result } of panicInfos) {
        const { faultInfo, stacktraceLines = [] } = result

        // Resolve numeric values from AddrLine
        const pcLine = faultInfo?.programCounter
        const pcValue = typeof pcLine === 'number' ? pcLine : pcLine.addr ?? 0
        const faLine = faultInfo?.faultAddr
        const faValue = typeof faLine === 'number' ? faLine : faLine.addr ?? 0
        console.log(
          `\n========== DECODED COREDUMP (Core ${result.coreId}) ==========`
        )
        console.log(`Panic PC:    0x${pcValue.toString(16)}`)
        if (faultInfo.faultAddr !== undefined) {
          console.log(`Fault Addr:  0x${faValue.toString(16)}`)
        }
        if (faultInfo.faultCode !== undefined) {
          console.log(`Fault Code:  0x${faultInfo.faultCode.toString(16)}`)
        }

        console.log('\nBacktrace:')
        if (stacktraceLines.length === 0) {
          console.log('(no stack frames)')
        } else {
          const pad = String(stacktraceLines.length - 1).length
          for (let i = 0; i < stacktraceLines.length; i++) {
            const frame = stacktraceLines[i]
            const location = stringifyAddr(frame)
            console.log(
              `#${i.toString().padStart(pad)} ${frame.regAddr} in ${location}`
            )
          }
        }
        console.log('======================================\n')
      }
      console.log(lines.join('\n'))
      console.log('done')
    })
  })
})
