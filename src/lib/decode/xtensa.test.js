// @ts-check

import temp from 'temp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { __tests, decodeXtensa } from './xtensa.js'

const { parseESP32PanicOutput, parseESP8266PanicOutput } = __tests

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
