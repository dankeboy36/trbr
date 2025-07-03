// @ts-check

import temp from 'temp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { __tests, decodeXtensa } from './xtensa.js'

const { parseESP32PanicOutput } = __tests

const esp32PanicInput = `
�Guru Meditation Error: Core  1 panic'ed (Unhandled debug exception). 
Debug exception reason: BREAK instr 
Core  1 register dump:
PC      : 0x400d129d  PS      : 0x00060836  A0      : 0x800d2308  A1      : 0x3ffb2270  
A2      : 0x00000000  A3      : 0x00000000  A4      : 0x00000014  A5      : 0x00000004  
A6      : 0x3ffb8188  A7      : 0x80000001  A8      : 0x800d129d  A9      : 0x3ffb2250  
A10     : 0x00002710  A11     : 0x00000000  A12     : 0x00000001  A13     : 0x00000003  
A14     : 0x00000001  A15     : 0x0000e100  SAR     : 0x00000003  EXCCAUSE: 0x00000001  
EXCVADDR: 0x00000000  LBEG    : 0x40085e50  LEND    : 0x40085e5b  LCOUNT  : 0xffffffff  


Backtrace: 0x400d129a:0x3ffb2270 0x400d2305:0x3ffb2290
`

describe('xtensa', () => {
  let tracked
  beforeAll(() => (tracked = temp.track()))
  afterAll(() => tracked.cleanupSync())

  describe('decodeXtensa', () => {
    it('should error when panic info with stack data', async () => {
      const invalid =
        /** @type {import('./decode.js').PanicInfoWithStackData} */ ({
          stackBaseAddr: 0x3ffb21b0,
        })
      await expect(
        decodeXtensa(
          {
            elfPath: '/path/to/elf',
            toolPath: '/path/to/tool',
          },
          invalid,
          {}
        )
      ).rejects.toThrow(/panicInfo must not contain stackBaseAddr/)
    })
  })

  describe('parseESP32PanicOutput', () => {
    it('should parse ESP32 panic output', () => {
      const actual = parseESP32PanicOutput(esp32PanicInput)
      expect(actual).toStrictEqual({
        backtraceAddrs: [0x400d129a, 0x3ffb2270, 0x400d2305, 0x3ffb2290],
        programCounter: 0x400d129d,
        coreId: 1,
        faultAddr: 0,
        faultCode: 1,
        regs: {
          PC: 0x400d129d,
          PS: 0x00060836,
          A0: 0x800d2308,
          A1: 0x3ffb2270,
          A2: 0x00000000,
          A3: 0x00000000,
          A4: 0x00000014,
          A5: 0x00000004,
          A6: 0x3ffb8188,
          A7: 0x80000001,
          A8: 0x800d129d,
          A9: 0x3ffb2250,
          A10: 0x00002710,
          A11: 0x00000000,
          A12: 0x00000001,
          A13: 0x00000003,
          A14: 0x00000001,
          A15: 0x0000e100,
          SAR: 0x00000003,
          EXCCAUSE: 0x00000001,
          EXCVADDR: 0x00000000,
          LBEG: 0x40085e50,
          LEND: 0x40085e5b,
          LCOUNT: 0xffffffff,
        },
      })
    })
  })
})
