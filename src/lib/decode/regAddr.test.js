// @ts-check

import { describe, expect, it } from 'vitest'

import { parseLines } from './regAddr'

/**
 * @typedef {Object} TestCase
 * @property {string} input
 * @property {(import('./regAddr').GDBLine|import('./regAddr').ParsedGDBLine)[]} expected
 */

const testCases = /** @type {TestCase[]} */ ([
  {
    input: '#0  0x420000a2 in setup () at /path/to/file.cpp:20',
    expected: [
      {
        regAddr: '0x420000a2',
        method: 'setup',
        file: '/path/to/file.cpp',
        lineNumber: '20',
      },
    ],
  },
  {
    input: '0x420000a2 in setup () at /path/to/file.cpp:20',
    expected: [
      {
        regAddr: '0x420000a2',
        method: 'setup',
        file: '/path/to/file.cpp',
        lineNumber: '20',
      },
    ],
  },
  {
    input: '0x4020195c is in user_init() (/path/to/file.cpp:676)',
    expected: [
      {
        regAddr: '0x4020195c',
        method: 'user_init',
        file: '/path/to/file.cpp',
        lineNumber: '676',
      },
    ],
  },
  {
    input:
      '#1  0x4008bb9e in vPortClearInterruptMaskFromISR (prev_level=<optimized out>) at /some/file.h:560',
    expected: [
      {
        regAddr: '0x4008bb9e',
        method: 'vPortClearInterruptMaskFromISR',
        args: [{ name: 'prev_level', value: '<optimized out>' }],
        file: '/some/file.h',
        lineNumber: '560',
      },
    ],
  },
  {
    input: '#2  0x4c1c0042 in ?? ()',
    expected: [{ regAddr: '0x4c1c0042', lineNumber: '??' }],
  },
  {
    input: 'Backtrace stopped: frame did not save the PC',
    expected: [],
  },
  {
    input:
      '#0  0x400844f5 in panic_abort (details=0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && \\"block already marked as free\\")") at /home/zekageri/.platformio/packages/framework-espidf/components/esp_system/panic.c:463',
    expected: [
      {
        regAddr: '0x400844f5',
        method: 'panic_abort',
        args: [
          {
            name: 'details',
            value:
              '0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && \\"block already marked as free\\")"',
          },
        ],
        file: '/home/zekageri/.platformio/packages/framework-espidf/components/esp_system/panic.c',
        lineNumber: '463',
      },
    ],
  },
  {
    input:
      '#1  0x4008b5f4 in esp_system_abort (details=0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && \\"block already marked as free\\")") at /home/zekageri/.platformio/packages/framework-espidf/components/esp_system/port/esp_system_chip.c:92',
    expected: [
      {
        regAddr: '0x4008b5f4',
        method: 'esp_system_abort',
        args: [
          {
            name: 'details',
            value:
              '0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && \\"block already marked as free\\")"',
          },
        ],
        file: '/home/zekageri/.platformio/packages/framework-espidf/components/esp_system/port/esp_system_chip.c',
        lineNumber: '92',
      },
    ],
  },
  {
    input:
      '#2  0x4008f33c in __assert_func (file=<optimized out>, line=<optimized out>, func=<optimized out>, expr=<optimized out>) at /home/zekageri/.platformio/packages/framework-espidf/components/newlib/assert.c:80',
    expected: [
      {
        regAddr: '0x4008f33c',
        method: '__assert_func',
        args: [
          { name: 'file', value: '<optimized out>' },
          { name: 'line', value: '<optimized out>' },
          { name: 'func', value: '<optimized out>' },
          { name: 'expr', value: '<optimized out>' },
        ],
        file: '/home/zekageri/.platformio/packages/framework-espidf/components/newlib/assert.c',
        lineNumber: '80',
      },
    ],
  },
  {
    input: `#0  0x400844f5 in panic_abort (details=0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && "block already marked as free")") at /home/zekageri/.platformio/packages/framework-espidf/components/esp_system/panic.c:463
#1  0x4008b5f4 in esp_system_abort (details=0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && "block already marked as free")") at /home/zekageri/.platformio/packages/framework-espidf/components/esp_system/port/esp_system_chip.c:92
#2  0x4008f33c in __assert_func (file=<optimized out>, line=<optimized out>, func=<optimized out>, expr=<optimized out>) at /home/zekageri/.platformio/packages/framework-espidf/components/newlib/assert.c:80`,
    expected: [
      {
        regAddr: '0x400844f5',
        method: 'panic_abort',
        args: [
          {
            name: 'details',
            value:
              '0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && "block already marked as free")"',
          },
        ],
        file: '/home/zekageri/.platformio/packages/framework-espidf/components/esp_system/panic.c',
        lineNumber: '463',
      },
      {
        regAddr: '0x4008b5f4',
        method: 'esp_system_abort',
        args: [
          {
            name: 'details',
            value:
              '0x3f896790 "assert failed: tlsf_free tlsf.c:1201 (!block_is_free(block) && "block already marked as free")"',
          },
        ],
        file: '/home/zekageri/.platformio/packages/framework-espidf/components/esp_system/port/esp_system_chip.c',
        lineNumber: '92',
      },
      {
        regAddr: '0x4008f33c',
        method: '__assert_func',
        args: [
          { name: 'file', value: '<optimized out>' },
          { name: 'line', value: '<optimized out>' },
          { name: 'func', value: '<optimized out>' },
          { name: 'expr', value: '<optimized out>' },
        ],
        file: '/home/zekageri/.platformio/packages/framework-espidf/components/newlib/assert.c',
        lineNumber: '80',
      },
    ],
  },
  {
    input: `a::geta (this=0x0) at /Users/kittaakos/Documents/Arduino/riscv_1/riscv_1.ino:11
#0  a::geta (this=0x0) at /Users/kittaakos/Documents/Arduino/riscv_1/riscv_1.ino:11
#1  loop () at /Users/kittaakos/Documents/Arduino/riscv_1/riscv_1.ino:21
#2  0x4c1c0042 in ?? ()
Backtrace stopped: frame did not save the PC`,
    expected: [
      {
        regAddr: '??',
        method: 'a::geta',
        args: [{ name: 'this', value: '0x0' }],
        file: '/Users/kittaakos/Documents/Arduino/riscv_1/riscv_1.ino',
        lineNumber: '11',
      },
      {
        regAddr: '??',
        method: 'a::geta',
        args: [{ name: 'this', value: '0x0' }],
        file: '/Users/kittaakos/Documents/Arduino/riscv_1/riscv_1.ino',
        lineNumber: '11',
      },
      {
        regAddr: '??',
        method: 'loop',
        file: '/Users/kittaakos/Documents/Arduino/riscv_1/riscv_1.ino',
        lineNumber: '21',
      },
      { regAddr: '0x4c1c0042', lineNumber: '??' },
    ],
  },
  {
    input: `0x420000a2 in setup () at /Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino:20
#0  0x420000a2 in setup () at /Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino:20
#1  0x42002024 in loopTask (pvParameters=<optimized out>) at /Users/kittaakos/Library/Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/main.cpp:59
#2  0x526c8040 in ?? ()
Backtrace stopped: previous frame inner to this frame (corrupt stack?)`,
    expected: [
      {
        regAddr: '0x420000a2',
        method: 'setup',
        file: '/Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino',
        lineNumber: '20',
      },
      {
        regAddr: '0x420000a2',
        method: 'setup',
        file: '/Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino',
        lineNumber: '20',
      },
      {
        regAddr: '0x42002024',
        method: 'loopTask',
        args: [{ name: 'pvParameters', value: '<optimized out>' }],
        file: '/Users/kittaakos/Library/Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/main.cpp',
        lineNumber: '59',
      },
      { regAddr: '0x526c8040', lineNumber: '??' },
    ],
  },
  {
    input: `0x4020195c is in user_init() (/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp:676)
0x40100d19 is at /Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S:81`,
    expected: [
      {
        regAddr: '0x4020195c',
        method: 'user_init',
        file: '/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp',
        lineNumber: '676',
      },
      {
        regAddr: '0x40100d19',
        method: '??',
        file: '/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S',
        lineNumber: '81',
      },
    ],
  },
  {
    input: '0x40058012 is in __libc_start_main (/usr/lib/libc.so.6)',
    expected: [
      {
        regAddr: '0x40058012',
        method: '__libc_start_main',
        file: '/usr/lib/libc.so.6',
        lineNumber: '??',
      },
    ],
  },
  {
    input: 'random text without trace info',
    expected: [],
  },
  {
    input: '#3  0x1234abcd in someFunction at ???:??',
    expected: [
      {
        regAddr: '0x1234abcd',
        method: 'someFunction',
        file: '???',
        lineNumber: '??',
      },
    ],
  },
  {
    input: '#4  0xabcdef12 in funcWithoutAt ()',
    expected: [
      {
        regAddr: '0xabcdef12',
        lineNumber: 'funcWithoutAt',
      },
    ],
  },
  {
    input: '0x40058012 is in __libc_start_main (/usr/lib/libc.so.6)',
    expected: [
      {
        regAddr: '0x40058012',
        lineNumber: '??',
        method: '__libc_start_main',
        file: '/usr/lib/libc.so.6',
      },
    ],
  },
  {
    input: `0x4020195c is in user_init() (/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp:676).
676	    system_init_done_cb(&init_done);
0x40100d19 is at /Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S:81.
81	    movi    a2, cont_norm
`,
    expected: [
      {
        regAddr: '0x4020195c',
        method: 'user_init',
        file: '/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp',
        lineNumber: '676',
      },
      {
        regAddr: '0x40100d19',
        file: '/Users/kittaakos/dev/sandbox/trbr/.test-resources/envs/cli/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S',
        lineNumber: '81',
        method: '??',
      },
    ],
  },
  {
    input: `0x420000a2 in setup () at /Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino:20
20	  *p3 = 10;                      // Cause exception here
#0  0x420000a2 in setup () at /Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino:20
#1  0x42002024 in loopTask (pvParameters=<optimized out>) at /Users/kittaakos/Library/Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/main.cpp:59
#2  0x526c8040 in ?? ()
Backtrace stopped: previous frame inner to this frame (corrupt stack?)`,
    expected: [
      {
        method: 'setup',
        regAddr: '0x420000a2',
        file: '/Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino',
        lineNumber: '20',
      },
      {
        method: 'setup',
        regAddr: '0x420000a2',
        file: '/Users/kittaakos/dev/sandbox/trbr/.tests/sketches/eed_issue43/eed_issue43.ino',
        lineNumber: '20',
      },
      {
        method: 'loopTask',
        args: [{ name: 'pvParameters', value: '<optimized out>' }],
        regAddr: '0x42002024',
        file: '/Users/kittaakos/Library/Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/main.cpp',
        lineNumber: '59',
      },
      {
        lineNumber: '??',
        regAddr: '0x526c8040',
      },
    ],
  },
])

describe('regAddr', () => {
  for (const { input, expected } of testCases) {
    it(`parses input:\n${input}`, () => {
      const results = parseLines(input)
      expect(results).toEqual(expected)
    })
  }
})
