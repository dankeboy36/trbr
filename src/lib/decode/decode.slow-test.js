// @ts-check

import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, describe, expect, inject, it } from 'vitest'

import { exec } from '../exec.js'
import { decode } from './decode.js'
import { createDecodeParams } from './decodeParams.js'
import { stringifyDecodeResult } from './stringify.js'

/** @typedef {import('./decode.js').PanicInfoWithBacktrace} PanicInfoWithBacktrace */
/** @typedef {import('./decode.js').PanicInfoWithStackData} PanicInfoWithStackData */

/**
 * @typedef {Object} CliContext
 * @property {string} cliPath - Path to the Arduino CLI executable
 * @property {string} cliVersion - Version of the Arduino CLI
 *
 * @typedef {Object} ToolEnv
 * @property {string} cliConfigPath - Path to the Arduino CLI configuration file
 * @property {string} dataDirPath - Path to the `data.directory` for the tool
 * @property {string} userDirPath - Path to the `user.directory` for the tool
 *
 * @typedef {Object} TestEnv
 * @property {CliContext} cliContext - Context for the Arduino CLI
 * @property {Object<string, ToolEnv>} toolsEnvs - Mapping of tool names to
 *   their environments
 */

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const sketchesPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.tests',
  'sketches'
)
const arduinoCliDataDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.test-resources',
  'envs',
  'cli'
)

/** @param {(typeof decodeTestParams)[number]} params */
function describeDecodeSuite(params) {
  const {
    input,
    panicInfoInput,
    fqbn: rawFQBN,
    sketchPath,
    expected,
    skip,
  } = params
  /** @type {TestEnv} */
  let testEnv
  /** @type {import('../../lib/decode/decode.js').DecodeParams} */
  let decodeParams

  return describe(`decode '${path.basename(
    sketchPath
  )}' sketch on '${rawFQBN}'`, () => {
    beforeAll(async () => {
      // @ts-ignore
      testEnv = inject('testEnv')
      expect(testEnv).toBeDefined()

      if (skip) {
        return
      }

      const arduinoCliPath = testEnv.cliContext.cliPath
      const arduinoCliConfigPath = testEnv.toolsEnvs['cli'].cliConfigPath

      const buildPath = await compileSketch(
        testEnv.cliContext,
        arduinoCliConfigPath,
        rawFQBN,
        sketchPath
      )
      const elfPath = path.join(
        buildPath,
        `${path.basename(sketchPath)}.ino.elf`
      )
      const fqbn = new FQBN(rawFQBN)
      decodeParams = await createDecodeParams({
        elfPath,
        fqbn,
        arduinoCliPath,
        arduinoCliConfigPath: testEnv.toolsEnvs['cli'].cliConfigPath,
      })
    })

    it('should decode text input', async () => {
      if (skip) {
        return
      }
      const decodedResult = await decode(decodeParams, input)
      const actual = stringifyDecodeResult(decodedResult, {
        color: 'disable',
        lineSeparator: '\n',
      })
      expect(actual).toEqual(expected)
    })

    it('should decode panic info input', async () => {
      if (skip || !panicInfoInput) {
        return
      }
      const decodedResult = await decode(decodeParams, panicInfoInput)
      const actual = stringifyDecodeResult(decodedResult, {
        color: 'disable',
        lineSeparator: '\n',
      })
      expect(actual).toEqual(expected)
    })

    it('should support cancellation for text input', async () => {
      if (skip) {
        return
      }
      const controller = new AbortController()
      const { signal } = controller
      setTimeout(() => controller.abort(), 10)

      await expect(decode(decodeParams, input, { signal })).rejects.toThrow(
        /user abort/gi
      )
    })

    it('should support cancellation for panic info input', async () => {
      if (skip || !panicInfoInput) {
        return
      }
      const controller = new AbortController()
      const { signal } = controller
      setTimeout(() => controller.abort(), 10)

      await expect(
        decode(decodeParams, panicInfoInput, { signal })
      ).rejects.toThrow(/user abort/gi)
    })
  })
}

const esp32h2Input = `Guru Meditation Error: Core  0 panic'ed (Breakpoint). Exception was unhandled.

Core  0 register dump:
MEPC    : 0x42000054  RA      : 0x42000054  SP      : 0x40816af0  GP      : 0x4080bcc4  
TP      : 0x40816b40  T0      : 0x400184be  T1      : 0x4080e000  T2      : 0x00000000  
S0/FP   : 0x420001bc  S1      : 0x4080e000  A0      : 0x00000001  A1      : 0x00000001  
A2      : 0x4080e000  A3      : 0x4080e000  A4      : 0x00000000  A5      : 0x600c5090  
A6      : 0xfa000000  A7      : 0x00000014  S2      : 0x00000000  S3      : 0x00000000  
S4      : 0x00000000  S5      : 0x00000000  S6      : 0x00000000  S7      : 0x00000000  
S8      : 0x00000000  S9      : 0x00000000  S10     : 0x00000000  S11     : 0x00000000  
T3      : 0x4080e000  T4      : 0x00000001  T5      : 0x4080e000  T6      : 0x00000001  
MSTATUS : 0x00001881  MTVEC   : 0x40800001  MCAUSE  : 0x00000003  MTVAL   : 0x00009002  
MHARTID : 0x00000000  

Stack memory:
40816af0: 0x00000000 0x00000000 0x00000000 0x42001b6c 0x00000000 0x00000000 0x00000000 0x4080670a
40816b10: 0x00000000 0x00000000 0ESP-ROM:esp32h2-20221101
Build:Nov  1 2022
`

const esp32WroomDaInput = `Guru Meditation Error: Core  1 panic'ed (StoreProhibited). Exception was unhandled.

Core  1 register dump:
PC      : 0x400d15f1  PS      : 0x00060b30  A0      : 0x800d1609  A1      : 0x3ffb21d0  
A2      : 0x0000002a  A3      : 0x3f40018f  A4      : 0x00000020  A5      : 0x0000ff00  
A6      : 0x00ff0000  A7      : 0x00000022  A8      : 0x00000000  A9      : 0x3ffb21b0  
A10     : 0x0000002c  A11     : 0x3f400164  A12     : 0x00000022  A13     : 0x0000ff00  
A14     : 0x00ff0000  A15     : 0x0000002a  SAR     : 0x0000000c  EXCCAUSE: 0x0000001d  
EXCVADDR: 0x00000000  LBEG    : 0x40086161  LEND    : 0x40086171  LCOUNT  : 0xfffffff5  


Backtrace: 0x400d15ee:0x3ffb21d0 0x400d1606:0x3ffb21f0 0x400d15da:0x3ffb2210 0x400d15c1:0x3ffb2240 0x400d302a:0x3ffb2270 0x40088be9:0x3ffb2290`

const esp8266Input = `Exception (28):
epc1=0x4020107b epc2=0x00000000 epc3=0x00000000 excvaddr=0x00000000 depc=0x00000000

>>>stack>>>

ctx: cont
sp: 3ffffe60 end: 3fffffd0 offset: 0150
3fffffb0:  feefeffe 00000000 3ffee55c 4020195c  
3fffffc0:  feefeffe feefeffe 3fffdab0 40100d19  
<<<stack<<<`

/** @type {PanicInfoWithBacktrace} */
const esp8266PanicInfo = {
  coreId: 0,
  regs: {
    EPC1: 1075843195,
    EPC2: 0,
    EPC3: 0,
    EXCVADDR: 0,
    DEPC: 0,
  },
  backtraceAddrs: [4277137406, 1075845468, 4277137406, 4277137406, 1074793753],
  faultCode: 28,
  faultAddr: 0,
  programCounter: 1075843195,
}

const esp32c3Input = `Core  0 panic'ed (Load access fault). Exception was unhandled.

Core  0 register dump:
MEPC    : 0x4200007e  RA      : 0x4200007e  SP      : 0x3fc98300  GP      : 0x3fc8d000  
TP      : 0x3fc98350  T0      : 0x4005890e  T1      : 0x3fc8f000  T2      : 0x00000000  
S0/FP   : 0x420001ea  S1      : 0x3fc8f000  A0      : 0x00000001  A1      : 0x00000001  
A2      : 0x3fc8f000  A3      : 0x3fc8f000  A4      : 0x00000000  A5      : 0x600c0028  
A6      : 0xfa000000  A7      : 0x00000014  S2      : 0x00000000  S3      : 0x00000000  
S4      : 0x00000000  S5      : 0x00000000  S6      : 0x00000000  S7      : 0x00000000  
S8      : 0x00000000  S9      : 0x00000000  S10     : 0x00000000  S11     : 0x00000000  
T3      : 0x3fc8f000  T4      : 0x00000001  T5      : 0x3fc8f000  T6      : 0x00000001  
MSTATUS : 0x00001801  MTVEC   : 0x40380001  MCAUSE  : 0x00000005  MTVAL   : 0x00000000  
MHARTID : 0x00000000  

Stack memory:
3fc98300: 0x00000000 0x00000000 0x00000000 0x42001c4c 0x00000000 0x00000000 0x00000000 0x40385d20
3fc98320: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98340: 0x00000000 0xa5a5a5a5 0xa5a5a5a5 0xa5a5a5a5 0xa5a5a5a5 0xbaad5678 0x00000168 0xabba1234
3fc98360: 0x0000015c 0x3fc98270 0x000007d7 0x3fc8e308 0x3fc8e308 0x3fc98364 0x3fc8e300 0x00000018
3fc98380: 0x00000000 0x00000000 0x3fc98364 0x00000000 0x00000001 0x3fc96354 0x706f6f6c 0x6b736154
3fc983a0: 0x00000000 0x00000000 0x3fc98350 0x00000005 0x00000000 0x00000001 0x00000000 0x00000000
3fc983c0: 0x00000000 0x00000262 0x00000000 0x3fc8fe64 0x3fc8fecc 0x3fc8ff34 0x00000000 0x00000000
3fc983e0: 0x00000001 0x00000000 0x00000000 0x00000000 0x4200917a 0x00000000 0x00000000 0x00000000
3fc98400: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98420: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98440: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98460: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98480: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc984a0: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc984c0: 0xbaad5678 0x00000068 0xabba1234 0x0000005c 0x00000000 0x3fc984d0 0x00000000 0x00000000
3fc984e0: 0x00000000 0x3fc984e8 0xffffffff 0x3fc984e8 0x3fc984e8 0x00000000 0x3fc984fc 0xffffffff
3fc98500: 0x3fc984fc 0x3fc984fc 0x00000001 0x00000001 0x00000000 0x7700ffff 0x00000000 0x036f2206
3fc98520: 0x51c34501 0x8957fe96 0xdc2f3bf2 0xbaad5678 0x00000088 0xabba1234 0x0000007c 0x00000000
3fc98540: 0x00000014 0x3fc98d94 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x3fc985c8
3fc98560: 0x00000000 0x00000101 0x00000000 0x00000000 0x0000000a 0x3fc98cf0 0x00000000 0x00000000
3fc98580: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x3fc987d8 0x3fc98944
3fc985a0: 0x00000000 0x3fc98b40 0x3fc98ad4 0x3fc98c84 0x3fc98c18 0x3fc98bac 0xbaad5678 0x0000020c
3fc985c0: 0xabba1234 0x00000200 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc985e0: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98600: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98620: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98640: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98660: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc98680: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc986a0: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc986c0: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc986e0: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
`

/** @type {PanicInfoWithBacktrace} */
const esp32WroomDaPanicInfo = {
  coreId: 1,
  regs: {
    PC: 0x400d15f1,
    PS: 0x00060b30,
    A0: 0x800d1609,
    A1: 0x3ffb21d0,
    A2: 0x0000002a,
    A3: 0x3f40018f,
    A4: 0x00000020,
    A5: 0x0000ff00,
    A6: 0x00ff0000,
    A7: 0x00000022,
    A8: 0x00000000,
    A9: 0x3ffb21b0,
    A10: 0x0000002c,
    A11: 0x3f400164,
    A12: 0x00000022,
    A13: 0x0000ff00,
    A14: 0x00ff0000,
    A15: 0x0000002a,
    SAR: 0x0000000c,
    EXCCAUSE: 0x0000001d,
    EXCVADDR: 0x00000000,
    LBEG: 0x40086161,
    LEND: 0x40086171,
    LCOUNT: 0xfffffff5,
  },
  backtraceAddrs: [
    1074599406, 1073422800, 1074599430, 1073422832, 1074599386, 1073422864,
    1074599361, 1073422912, 1074606122, 1073422960, 1074301929, 1073422992,
  ],
  faultCode: 29,
  faultAddr: 0,
  programCounter: 1074599409,
}

const skip =
  process.platform === 'win32'
    ? "'fatal error: bits/c++config.h: No such file or directory' due to too long path on Windows (https://github.com/espressif/arduino-esp32/issues/9654 + https://github.com/arendst/Tasmota/issues/1217#issuecomment-358056267)"
    : false

/**
 * @typedef {Object} DecodeTestParams
 * @property {string} input
 * @property {PanicInfoWithBacktrace | PanicInfoWithStackData} [panicInfoInput]
 * @property {string} fqbn
 * @property {string} sketchPath
 * @property {string} expected
 * @property {string | false} [skip]
 */

/** @type {DecodeTestParams[]} */
const decodeTestParams = [
  {
    skip,
    input: esp32c3Input,
    fqbn: 'esp32:esp32:esp32c3',
    sketchPath: path.join(sketchesPath, 'riscv_1'),
    expected: `0 | Load access fault | 5

PC -> 0x4200007e: loop () at ${path.join(
      sketchesPath,
      'riscv_1/riscv_1.ino'
    )}:10

??: a::geta (this=0x0) at ${path.join(sketchesPath, 'riscv_1/riscv_1.ino')}:10
??: loop () at ${path.join(sketchesPath, 'riscv_1/riscv_1.ino')}:19
0x4c1c0042: ??`,
  },
  {
    skip,
    input: esp32h2Input,
    fqbn: 'esp32:esp32:esp32h2',
    sketchPath: path.join(sketchesPath, 'AE'),
    expected: `0 | Breakpoint | 3

PC -> 0x42000054: loop () at ${path.join(sketchesPath, 'AE/AE.ino')}:5
Fault -> 0x00009002: ??

??: loop () at ${path.join(sketchesPath, 'AE/AE.ino')}:5
0x6c1b0042: ??`,
  },
  {
    input: esp32WroomDaInput,
    panicInfoInput: esp32WroomDaPanicInfo,
    fqbn: 'esp32:esp32:esp32da',
    sketchPath: path.join(sketchesPath, 'esp32backtracetest'),
    expected: `1 | StoreProhibited: A store referenced a page mapped with an attribute that does not permit stores | 29

PC -> 0x400d15f1: HardwareSerial::_uartEventTask (void*) at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/HardwareSerial.cpp' // TODO: ESP32 version must be derived from test env
    )}:263

0x400d15ee: HardwareSerial::_uartEventTask (void*) at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/HardwareSerial.cpp' // TODO: ESP32 version must be derived from test env
    )}:262
0x400d1606: HardwareSerial::_uartEventTask (void*) at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/HardwareSerial.cpp' // TODO: ESP32 version must be derived from test env
    )}:266
0x400d15da: functionB (int*) at ${path.join(
      sketchesPath,
      'esp32backtracetest/module2.cpp'
    )}:14
0x400d15c1: functionC (int) at ${path.join(
      sketchesPath,
      'esp32backtracetest/module2.cpp'
    )}:9
0x400d302a: uart_get_max_rx_timeout () at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/tools/esp32-arduino-libs/idf-release_v5.4-2f7dcd86-v1/esp32/include/hal/esp32/include/hal/uart_ll.h' // TODO: ESP32 version must be derived from test env
    )}:496
0x40088be9: xQueueReceiveFromISR () at /home/runner/work/esp32-arduino-lib-builder/esp32-arduino-lib-builder/esp-idf/components/freertos/FreeRTOS-Kernel/queue.c:2192`,
  },
  {
    skip,
    fqbn: 'esp8266:esp8266:generic',
    input: esp8266Input,
    panicInfoInput: esp8266PanicInfo,
    sketchPath: path.join(sketchesPath, 'AE'),
    expected: `0 | LoadProhibited: A load referenced a page mapped with an attribute that does not permit loads | 28

PC -> 0x4020107b: ??

0x4020195c: user_init () at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/core_esp8266_main.cpp' // TODO: ESP8266 version must be derived from test env
    )}:676
0x40100d19: ?? () at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp8266/hardware/esp8266/3.1.2/cores/esp8266/cont.S' // TODO: ESP8266 version must be derived from test env
    )}:81`,
  },
]

/**
 * @param {TestEnv['cliContext']} cliContext
 * @param {string} cliConfigPath
 * @param {string} fqbn
 * @param {string} sketchPath
 * @returns {Promise<string>}
 */
async function compileSketch(cliContext, cliConfigPath, fqbn, sketchPath) {
  const { cliPath } = cliContext
  const { stdout } = await exec(cliPath, [
    'compile',
    sketchPath,
    '-b',
    fqbn,
    '--config-file',
    cliConfigPath,
    '--format',
    'json',
  ])

  const cliCompileSummary = JSON.parse(stdout)
  return cliCompileSummary.builder_result.build_path
}

describe('decode (slow)', () => {
  decodeTestParams.map(describeDecodeSuite)
})
