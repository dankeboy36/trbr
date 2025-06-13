// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'

import { findToolPath } from '../tool.js'
import { addr2line, getRegsInfo } from './add2Line.js'
import { decodeCoredump } from './coredump.js'
import { decode, stringifyAddr } from './decode.js'

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const coredumpsPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.tests',
  'coredumps',
  'esp32da' // TODO: remove
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
        fqbn: new FQBN('esp32:esp32:esp32da'),
        arduinoCliConfig: testEnv.toolsEnvs['cli'].cliConfigPath,
      })

      const panicInfos = await decodeCoredump(
        { targetArch: 'xtensa', toolPath, elfPath },
        coredumpPath,
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

      const lines = []
      for (const panicInfo of panicInfos) {
        const result = await decode(
          {
            elfPath,
            toolPath,
            targetArch: 'xtensa',
          },
          panicInfo
        )

        const { faultInfo, stacktraceLines = [] } = result

        // Resolve numeric values from AddrLine
        const pcLine = faultInfo.programCounter
        const pcValue = typeof pcLine === 'number' ? pcLine : pcLine.addr ?? 0
        const faLine = faultInfo.faultAddr
        const faValue = typeof faLine === 'number' ? faLine : faLine.addr ?? 0
        console.log(
          `\n========== DECODED COREDUMP (Core ${panicInfo.coreId}) ==========`
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

    it('https://github.com/dankeboy36/esp-exception-decoder/issues/42', async () => {
      if ('hack'.length) {
        return
      }

      const toolPath = await findToolPath({
        arduinoCliPath: testEnv.cliContext.cliPath,
        fqbn: new FQBN('esp32:esp32:esp32c3'),
        arduinoCliConfig: testEnv.toolsEnvs['cli'].cliConfigPath,
      })
      const elfPath =
        '/Users/kittaakos/Downloads/stack_elf/crash_PPM_to_ESP_NOW_ESP32C3_a.ino.elf'

      const input = await fs.readFile(
        '/Users/kittaakos/Downloads/stack_elf/registers_stack.txt',
        'utf8'
      )

      const result = await decode(
        {
          elfPath,
          toolPath,
          targetArch: 'esp32c3',
        },
        input
      )

      // const addresses = [
      //   getAddr(result.faultInfo.programCounter),
      //   getAddr(result.faultInfo.faultAddr),
      //   ...Object.values(result.regs ?? {}),
      // ]

      // const panicText = await readFile(input, 'utf8')

      // Extract addresses that look like `0x403813ea` or `#1  0x403872b2`
      const addressPattern = /0x[0-9a-fA-F]+/g
      const addresses2 = [...new Set(input.match(addressPattern) || [])]

      const lines = await addr2line(
        { elfPath, toolPath },
        addresses2.map((addr) => parseInt(addr, 16))
      )

      // for (const line of lines) {
      //   if (typeof line.location === 'string') {
      //     console.log(`${toHexString(line.addr)} in ?? ()`)
      //   } else {
      //     const { regAddr, method, file, lineNumber, rangeText } = line.location
      //     if (method && file && lineNumber) {
      //       console.log(`#${i}  ${regAddr} in ${method} ${rangeText || ''} at ${file}:${lineNumber}`)
      //     } else {
      //       console.log(`${toHexString(line.addr)} in ?? ()`)
      //     }
      //   }
      // }
      console.log('done')
      console.log('----------------------')
      const padding = String(lines.length - 1).length
      console.log(
        lines
          .map((line) => line.location)
          .map(stringifyAddr)
          .map(
            (line, index) =>
              `#${index.toString().padStart(padding, ' ')} ${line}`
          )
          .join('\n')
      )
      console.log('----------------------')
    })
  })

  function setPlatform(platform) {
    Object.defineProperty(process, 'platform', { value: platform })
  }
})
