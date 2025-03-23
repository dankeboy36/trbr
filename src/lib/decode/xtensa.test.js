// @ts-check
import { promises as fs } from 'node:fs'
import path from 'node:path'

import temp from 'temp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { __tests, decodeXtensa } from './xtensa.js'

const {
  buildCommandFlags,
  parseAlloc,
  parseException,
  parseGDBOutput,
  parseInstructionAddresses,
  parseRegisters,
  parseStacktrace,
  exceptions,
} = __tests

const esp8266Input = `--------------- CUT HERE FOR EXCEPTION DECODER ---------------
$�K��5�z�͎����
User exception (panic/abort/assert)
--------------- CUT HERE FOR EXCEPTION DECODER ---------------

Abort called

>>>stack>>>

ctx: cont
sp: 3fffff90 end: 3fffffd0 offset: 0010
3fffffa0:  00002580 00000000 3ffee54c 4020104e  
3fffffb0:  3fffdad0 00000000 3ffee54c 402018ac  
3fffffc0:  feefeffe feefeffe 3fffdab0 40100d19  
<<<stack<<<

--------------- CUT HERE FOR EXCEPTION DECODER ---------------
$�K��5�z�͎����
User exception (panic/abort/assert)
--------------- CUT HERE FOR EXCEPTION DECODER ---------------

Abort called

>>>stack>>>

ctx: cont
sp: 3fffff90 end: 3fffffd0 offset: 0011
3fffffa0:  00002580 00000000 3ffee54c 4020104e  
3fffffb0:  3fffdad0 00000000 3ffee54c 402018ac  
3fffffc0:  feefeffe feefeffe 3fffdab0 40100d19  
<<<stack<<<

--------------- CUT HERE FOR EXCEPTION DECODER ---------------`

const esp8266Content = `

ctx: cont
sp: 3fffff90 end: 3fffffd0 offset: 0010
3fffffa0:  00002580 00000000 3ffee54c 4020104e  
3fffffb0:  3fffdad0 00000000 3ffee54c 402018ac  
3fffffc0:  feefeffe feefeffe 3fffdab0 40100d19  
`

const esp8266Stdout = `
0x402018ac is in loop_wrapper() (/Users/dankeboy36/Library/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp:258).
258	    loop_end();
0x40100d19 is at /Users/dankeboy36/Library/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S:81.
81	    movi    a2, cont_norm
`.trim()

const esp32AbortInput = `
Backtrace: 0x400833dd:0x3ffb21b0 0x40087f2d:0x3ffb21d0 0x4008d17d:0x3ffb21f0 0x400d129d:0x3ffb2270 0x400d2305:0x3ffb2290




ELF file SHA256: cc58cc88d58e4143

Rebooting...
`

const esp32AbortContent =
  ' 0x400833dd:0x3ffb21b0 0x40087f2d:0x3ffb21d0 0x4008d17d:0x3ffb21f0 0x400d129d:0x3ffb2270 0x400d2305:0x3ffb2290'

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

const esp32PanicContent = ' 0x400d129a:0x3ffb2270 0x400d2305:0x3ffb2290'

const esp8266exceptionInput = `
Fatal exception 29(StoreProhibitedCause):
epc1=0x4000dfd9, epc2=0x00000000, epc3=0x4000dfd9, excvaddr=0x00000000, depc=0x00000000

Exception (29):
epc1=0x4000dfd9 epc2=0x00000000 epc3=0x4000dfd9 excvaddr=0x00000000 depc=0x00000000
`

const esp32Stdout = `0x400833dd is in panic_abort (/Users/ficeto/Desktop/ESP32/ESP32S2/esp-idf-public/components/esp_system/panic.c:408).
0x40087f2d is in esp_system_abort (/Users/ficeto/Desktop/ESP32/ESP32S2/esp-idf-public/components/esp_system/esp_system.c:137).
0x4008d17d is in abort (/Users/ficeto/Desktop/ESP32/ESP32S2/esp-idf-public/components/newlib/abort.c:46).
0x400d129d is in loop() (/Users/dankeboy36/Documents/Arduino/folder with space/(here)/AE/AE.ino:8).
8	  abort();
0x400d2305 is in loopTask(void*) (/Users/dankeboy36/Library/Arduino15/packages/esp32/hardware/esp32/2.0.9/cores/esp32/main.cpp:50).
50	        loop();`

describe('xtensa', () => {
  let tracked
  beforeAll(() => (tracked = temp.track()))
  afterAll(() => tracked.cleanupSync())

  describe('parseStacktrace', () => {
    it('should parse multiline ESP8266 content', () => {
      const actual = parseStacktrace(esp8266Input)
      expect(actual).toBe(esp8266Content)
    })

    it('should parse single-line ESP32 content', () => {
      ;[
        [esp32AbortInput, esp32AbortContent],
        [esp32PanicInput, esp32PanicContent],
      ].forEach(([input, expected]) => {
        const actual = parseStacktrace(input)
        expect(actual).toBe(expected)
      })
    })
  })

  describe('parseInstructionAddresses', () => {
    it('should parse instruction addresses in stripped ESP8266 content', () => {
      const expected = ['4020104e', '402018ac', '40100d19']
      const actual = parseInstructionAddresses(esp8266Content)
      expect(actual).toEqual(expected)
    })

    it('should parse instruction addresses in stripped ESP32 content', () => {
      const expected = [
        '400833dd',
        '40087f2d',
        '4008d17d',
        '400d129d',
        '400d2305',
      ]
      const actual = parseInstructionAddresses(esp32AbortContent)
      expect(actual).toEqual(expected)
    })
  })

  describe('buildCommand', () => {
    it('should build command with flags from instruction addresses', () => {
      const elfPath = 'path/to/elf'
      const actualFlags = buildCommandFlags(
        ['4020104e', '402018ac', '40100d19'],
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

    it("should throw when 'addresses' is empty", () => {
      expect(() => buildCommandFlags([], 'never')).toThrow(
        /Invalid argument: addresses.length <= 0/
      )
    })
  })

  describe('parseException', () => {
    it('should parse the exception', () => {
      const expectedCode = 29
      const actual = parseException(esp8266exceptionInput)
      expect(actual).toEqual([exceptions[expectedCode], expectedCode])
    })
  })

  describe('parseRegister', () => {
    it('should not parse register address from invalid input', () => {
      const actual = parseRegisters('blabla')
      expect(actual).toEqual([undefined, undefined])
    })

    it("should parse ESP32 'PC' register address", () => {
      const actual = parseRegisters('PC      : 0x400d129d')
      expect(actual).toEqual(['400d129d', undefined])
    })

    it("should parse ESP32 'EXCVADDR' register address", () => {
      const actual = parseRegisters('EXCVADDR: 0x00000001')
      expect(actual).toEqual([undefined, '00000001'])
    })

    it("should parse ESP8266 'PC' register address", () => {
      const actual = parseRegisters('epc1=0x4000dfd9')
      expect(actual).toEqual(['4000dfd9', undefined])
    })

    it("should parse ESP8266 'EXCVADDR' register address", () => {
      const actual = parseRegisters('excvaddr=0x00000001')
      expect(actual).toEqual([undefined, '00000001'])
    })

    it('should parse ESP32 register addresses', () => {
      const actual = parseRegisters(esp32PanicInput)
      expect(actual).toEqual(['400d129d', '00000000'])
    })

    it('should parse ESP8266 register addresses', () => {
      const actual = parseRegisters(esp8266exceptionInput)
      expect(actual).toEqual(['4000dfd9', '00000000'])
    })
  })

  describe('parseAlloc', () => {
    it('should not parse alloc from invalid input', () => {
      expect(parseAlloc('invalid')).toBeUndefined()
    })

    it('should not parse alloc when address is not instruction address', () => {
      expect(
        parseAlloc('last failed alloc call: 3022D552(1480)')
      ).toBeUndefined()
    })

    it('should parse alloc', () => {
      expect(parseAlloc('last failed alloc call: 4022D552(1480)')).toEqual([
        '4022D552',
        1480,
      ])
    })
  })

  describe('filterLines', () => {
    it('should filter irrelevant lines from the stdout', () => {
      const actual = parseGDBOutput(esp8266Stdout)
      expect(actual.length).toBe(1)
      expect(actual[0]).toEqual({
        address: '0x402018ac',
        file: '/Users/dankeboy36/Library/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp',
        lineNumber: '258',
        method: 'loop_wrapper()',
      })
    })

    it('should handle () in the file path', () => {
      const actual = parseGDBOutput(esp32Stdout)
      expect(actual.length).toBe(5)
      expect(actual[3]).toEqual({
        address: '0x400d129d',
        file: '/Users/dankeboy36/Documents/Arduino/folder with space/(here)/AE/AE.ino',
        lineNumber: '8',
        method: 'loop()',
      })
    })
  })
})
