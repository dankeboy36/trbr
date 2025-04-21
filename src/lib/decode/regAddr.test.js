// @ts-check

import temp from 'temp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { __tests } from './regAddr.js'

const { buildCommandFlags, parseGDBLine, parseGDBLines } = __tests

describe('regAddr', () => {
  let tracked
  beforeAll(() => (tracked = temp.track()))
  afterAll(() => tracked.cleanupSync())

  describe('buildCommand', () => {
    it('should build command with flags from instruction addresses', () => {
      const elfPath = 'path/to/elf'
      const actualFlags = buildCommandFlags(
        [0x4020104e, 0x402018ac, 0x40100d19],
        elfPath
      )
      expect(actualFlags).toEqual([
        '--batch',
        elfPath,
        '-ex',
        'set listsize 1',
        '-ex',
        'list *0x4020104e',
        '-ex',
        'list *0x402018ac',
        '-ex',
        'list *0x40100d19',
        '-ex',
        'q',
      ])
    })
  })

  describe('parseGDBLines', () => {
    it('should parse ESP8266 output', () => {
      const actual =
        parseGDBLines(`0x4020195c is in user_init() (/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp:676).
676	    system_init_done_cb(&init_done);
0x40100d19 is at /Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S:81.
81	    movi    a2, cont_norm`)

      expect(actual).toEqual(
        expect.arrayContaining([
          {
            regAddr: '0x4020195c',
            method: 'user_init()',
            file: '/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp',
            lineNumber: '676',
          },
          undefined,
          {
            regAddr: '0x40100d19',
            file: '/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S',
            lineNumber: '81',
            method: '??',
          },
          undefined,
        ])
      )
    })
  })

  describe('parseGDBLine', () => {
    it("should parse 'in' fallback", () => {
      const actual = parseGDBLine(
        '0x40058012 is in __libc_start_main (/usr/lib/libc.so.6)'
      )
      expect(actual).toEqual({
        regAddr: '0x40058012',
        lineNumber: 'is in __libc_start_main (/usr/lib/libc.so.6)',
      })
    })
  })
})
