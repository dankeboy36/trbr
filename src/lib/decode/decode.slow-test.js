// @ts-check

import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, describe, expect, inject, it } from 'vitest'

import { exec } from '../exec.js'
import { decode, isParsedGDBLine } from './decode.js'
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
/**
 * @typedef {Object} CompileOptions
 * @property {string[]} [buildProperties] - Extra `--build-property` entries.
 */

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
// ESP8266 decode setup compiles under Rosetta on Apple silicon and can exceed default hook timeouts.
const slowHookTimeout = 180_000
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
    expectVars,
    compileOptions,
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
        sketchPath,
        compileOptions
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
    }, slowHookTimeout)

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

      if (expectVars) {
        await expectVars(decodedResult)
      }
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

const esp32c3VarsDemoInput = `Guru Meditation Error: Core  0 panic'ed (Store access fault). Exception was unhandled.

Core  0 register dump:
MEPC    : 0x4200012e  RA      : 0x42000100  SP      : 0x3fc96ba0  GP      : 0x3fc8cc00  
TP      : 0x3fc96ca0  T0      : 0x7f7f7fff  T1      : 0x7f7f7f7f  T2      : 0xffffffff  
S0/FP   : 0x3fc96bf0  S1      : 0x000000fb  A0      : 0x0000000f  A1      : 0x3fc96bc4  
A2      : 0x00000003  A3      : 0x00000065  A4      : 0x00000074  A5      : 0x000000fb  
A6      : 0x02000800  A7      : 0x00000000  S2      : 0x00000095  S3      : 0x3fc96c0c  
S4      : 0x3c030120  S5      : 0x00000000  S6      : 0x00000000  S7      : 0x00000000  
S8      : 0x00000000  S9      : 0x00000000  S10     : 0x00000000  S11     : 0x00000000  
T3      : 0x40200000  T4      : 0x00000000  T5      : 0x00000000  T6      : 0x00000000  
MSTATUS : 0x00001881  MTVEC   : 0x40380001  MCAUSE  : 0x00000007  MTVAL   : 0x00000000  
MHARTID : 0x00000000  

Stack memory:
3fc96ba0: 0x00000000 0x00000000 0x3fc9701c 0x00000003 0x00000004 0x00000003 0x00000074 0x00000008
3fc96bc0: 0x0000000d 0x00000001 0x00000005 0x00000009 0x3c030294 0x00000000 0x00000000 0x00000000
3fc96be0: 0x00000000 0x00000000 0x3fc96c40 0x4200021e 0x3fc8da0c 0x00000002 0x3fc96c10 0x00000001
3fc96c00: 0x00000005 0x00000009 0x00000002 0x00000059 0x40300000 0x73726176 0x6d65645f 0x0000006f
3fc96c20: 0x00000000 0x00000007 0x0000000b 0xf817761f 0x00000000 0x00000000 0x3fc96c50 0x4200024c
3fc96c40: 0x00000000 0x3fc8e000 0x3fc96c60 0x420002dc 0x00000000 0x00000000 0x3fc96c70 0x42003592
3fc96c60: 0x00000000 0x00000000 0x00000000 0x40385e4c 0x00000000 0x00000000 0x00000000 0x00000000
3fc96c80: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0xa5a5a5a5 0xa5a5a5a5 0xa5a5a5a5
3fc96ca0: 0xa5a5a5a5 0xbaad5678 0x0ff17868 0x132f5aff 0xba733994 0xd6e58156 0xd35fa755 0x0c15352a
3fc96cc0: 0xb8f75073 0x82c94a8f 0x2c9ed38c 0x6c75c474 0x60d35c30 0xfe391493 0xfafc3369 0x602229a7
3fc96ce0: 0xa2b84f1b 0x5397d33d 0x8725fbc7 0xd4b2f6a7 0xcabdc829 0xeb7d68b6 0x112fbcb2 0xf192cbb6
3fc96d00: 0xbff57eaa 0xa93f25cb 0x60ee9fd0 0xf0f9c983 0x220421ec 0xc1d4af7b 0xb99a61b0 0x32d03e4d
3fc96d20: 0x9fcc44fe 0x0fcc456f 0x1cdaaf89 0x57411ad3 0x8102e18e 0x961c851c 0xb5434f43 0x405b0d10
3fc96d40: 0x2f3e553d 0x6ec7dfff 0x5e6f5d73 0x78ba97af 0x43868699 0x19942eec 0x7576a4e5 0x8a353810
3fc96d60: 0x56bd8583 0x0b3daaa9 0xebc60e37 0xd65d40b8 0x1b22a9b8 0x5b178378 0x7dc8d355 0xb329ae87
3fc96d80: 0xded6ea1f 0xd99c6a83 0xcf17fce9 0xfbd7b3e3 0x81d66a9a 0x281b9f40 0x9c75008b 0x2a8b9c0e
3fc96da0: 0x427c88d8 0xe4cb7d78 0xf3f773cc 0xafff693a 0x627619fd 0x99710549 0xab10279a 0xce477946
3fc96dc0: 0x1d66ffbb 0x3500cd0f 0xcef858ff 0x63fb350b 0x8e73645c 0x1f7696da 0x92f6822c 0xdba21ccd
3fc96de0: 0xa4d715be 0x5deef28a 0x5a518f76 0x9cf7c1ff 0x56296c00 0x9b9b0ebf 0xea1334d8 0xa82d8b21
3fc96e00: 0x3d4e77c2 0x4e6346c8 0x9b4fd4de 0xf3b4f7fb 0xa2484cbb 0xcde66ea6 0x5111da0e 0x6268db35
3fc96e20: 0x3144ef07 0xcf715e2a 0xb7b374b3 0xccc9d1db 0x70701147 0x4bdcdcaa 0x3dd4eb66 0xd060f0f0
3fc96e40: 0x7f5fea7b 0xb2da91c3 0x3bac8dc9 0x6b5ba975 0x1a329c04 0x2dba1640 0xecd4de29 0x819a84c4
3fc96e60: 0xf3922795 0xcef374a3 0x78ee53a7 0x20fbbb13 0x6238aa46 0x092e2ad5 0xd15c0d0b 0x081db826
3fc96e80: 0x4ddef79f 0xc14f3469 0x5886703f 0xd6b28fda 0x27e62aea 0x428d16f5 0x3fc94c94 0x00000170
3fc96ea0: 0xabba1234 0x0000015c 0x3fc96c00 0x00000000 0x3fc93c10 0x3fc8dee8 0x3fc96ea8 0x3fc8dee0
3fc96ec0: 0x00000018 0x00000000 0x00000000 0x3fc96ea8 0x00000000 0x00000001 0x3fc94ca4 0x706f6f6c
3fc96ee0: 0x6b736154 0x00000000 0x00000000 0x3fc96ca0 0x00000004 0x00000000 0x00000001 0x00000000
3fc96f00: 0x00000000 0x00000000 0x00000000 0x00000000 0x3fc8f888 0x3fc8f8f0 0x3fc8f958 0x00000000
3fc96f20: 0x00000000 0x00000001 0x00000000 0x00000000 0x00000000 0x4200b8ae 0x00000000 0x00000000
3fc96f40: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc96f60: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
3fc96f80: 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000
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
 * @property {CompileOptions} [compileOptions]
 * @property {(
 *   decodeResult:
 *     | import('./decode.js').DecodeResult
 *     | import('./coredump.js').CoredumpDecodeResult
 * ) => void | Promise<void>} [expectVars]
 */

/**
 * @param {import('./decode.js').DecodeResult} result
 * @param {string} method
 * @returns {import('./decode.js').ParsedGDBLine | undefined}
 */
function findFrame(result, method) {
  const found = result.stacktraceLines.find(
    (line) => isParsedGDBLine(line) && line.method === method
  )
  return found && isParsedGDBLine(found) ? found : undefined
}

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

0x4200007e: a::geta () at ${path.join(sketchesPath, 'riscv_1/riscv_1.ino')}:10
0x4200007e: loop () at ${path.join(sketchesPath, 'riscv_1/riscv_1.ino')}:19
0x42001c4c: uartSetRxTimeout (uart=0x420001ea <serialEventRun()+10>, numSymbTimeout=<optimized out>) at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/esp32-hal-uart.c' // TODO: ESP32 version must be derived from test env
    )}:766
0x40385d20: xQueueTakeMutexRecursive (xMutex=0x0, xTicksToWait=0) at /home/runner/work/esp32-arduino-lib-builder/esp32-arduino-lib-builder/esp-idf/components/freertos/FreeRTOS-Kernel/queue.c:851`,
  },
  {
    skip,
    input: esp32h2Input,
    fqbn: 'esp32:esp32:esp32h2',
    sketchPath: path.join(sketchesPath, 'AE'),
    expected: `0 | Breakpoint | 3

PC -> 0x42000054: loop () at ${path.join(sketchesPath, 'AE/AE.ino')}:5
Fault -> 0x00009002: ??

0x42000054: loop () at ${path.join(sketchesPath, 'AE/AE.ino')}:5
0x42001b6c: uart_ll_is_tx_idle (hw=0x600c5090) at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/tools/esp32-arduino-libs/idf-release_v5.4-2f7dcd86-v1/esp32h2/include/hal/esp32h2/include/hal/uart_ll.h' // TODO: ESP32 version must be derived from test env
    )}:913
0x42001b6c: log_printfv (format=<optimized out>, arg=<optimized out>) at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/esp32-hal-uart.c' // TODO: ESP32 version must be derived from test env
    )}:1146
0x00000000: ??`,
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
  {
    skip,
    input: esp32c3VarsDemoInput,
    fqbn: 'esp32:esp32:esp32c3',
    sketchPath: path.join(sketchesPath, 'vars_demo'),
    compileOptions: {
      buildProperties: [
        'compiler.c.extra_flags=-Og -g3 -fno-omit-frame-pointer -fno-optimize-sibling-calls',
        'compiler.cpp.extra_flags=-Og -g3 -fno-omit-frame-pointer -fno-optimize-sibling-calls',
        'compiler.optimization_flags=-Og -g3',
        'build.code_debug=1',
      ],
    },
    expected: `0 | Store/AMO access fault | 7

PC -> 0x4200012e: level3 (SimpleMap const&, Config const&, int const*, int) at ${path.join(
      sketchesPath,
      'vars_demo/vars_demo.ino'
    )}:67

0x4200012e: level3 (map, cfg, data=0x3fc96bfc, len=4) at ${path.join(
      sketchesPath,
      'vars_demo/vars_demo.ino'
    )}:67
0x4200021e: level2 (seed=3) at ${path.join(
      sketchesPath,
      'vars_demo/vars_demo.ino'
    )}:81
0x4200024c: level1 () at ${path.join(
      sketchesPath,
      'vars_demo/vars_demo.ino'
    )}:86
0x420002dc: loop () at ${path.join(sketchesPath, 'vars_demo/vars_demo.ino')}:99
0x42003592: loopTask (pvParameters=<error reading variable: value has been optimized out>) at ${path.join(
      arduinoCliDataDir,
      'Arduino15/packages/esp32/hardware/esp32/3.2.0/cores/esp32/main.cpp'
    )}:74
0x40385e4c: vPortTaskWrapper (pxCode=<optimized out>, pvParameters=<optimized out>) at /home/runner/work/esp32-arduino-lib-builder/esp32-arduino-lib-builder/esp-idf/components/freertos/FreeRTOS-Kernel/portable/riscv/port.c:255`,
    expectVars: (decodeResult) => {
      if (!('stacktraceLines' in decodeResult)) {
        throw new Error('Expected stacktrace lines for vars_demo')
      }
      const level3 = findFrame(decodeResult, 'level3')
      expect(level3).toBeDefined()
      expect(level3?.args).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'map', type: 'const SimpleMap &' }),
          expect.objectContaining({ name: 'cfg', type: 'const Config &' }),
          expect.objectContaining({ name: 'data', type: 'const int *' }),
          expect.objectContaining({ name: 'len', type: 'int' }),
        ])
      )
      const level3Len = level3?.args?.find((arg) => arg.name === 'len')
      expect(Number(level3Len?.value)).toBe(4)
      const level3Locals = level3?.locals ?? []
      const level3LocalNames = level3Locals.map((local) => local.name)
      for (const argName of ['map', 'cfg', 'data', 'len']) {
        expect(level3LocalNames).not.toContain(argName)
      }
      const localBuf = level3Locals.find((local) => local.name === 'localBuf')
      expect(localBuf?.scope).toBe('local')
      const localBufChildren = localBuf?.children ?? []
      expect(localBufChildren.length).toBeGreaterThan(0)
      expect(localBufChildren.map((child) => child.name)).toEqual(
        expect.arrayContaining(['0', '1', '2'])
      )
      const localPoint = level3Locals.find(
        (local) => local.name === 'localPoint'
      )
      expect(localPoint?.scope).toBe('local')
      const localPointChildren = localPoint?.children ?? []
      expect(localPointChildren.map((child) => child.name)).toEqual(
        expect.arrayContaining(['x', 'y'])
      )

      const level2 = findFrame(decodeResult, 'level2')
      expect(level2).toBeDefined()
      expect(level2?.args).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'seed', type: 'int', value: '3' }),
        ])
      )
      const level2Locals = level2?.locals ?? []
      const localArr = level2Locals.find((local) => local.name === 'localArr')
      expect(localArr?.children?.length ?? 0).toBeGreaterThan(0)
      const cfg = level2Locals.find((local) => local.name === 'cfg')
      const cfgChildren = cfg?.children ?? []
      expect(cfgChildren.map((child) => child.name)).toEqual(
        expect.arrayContaining(['id', 'scale', 'label', 'origin'])
      )
      const cfgId = cfgChildren.find((child) => child.name === 'id')
      expect(Number(cfgId?.value)).toBe(89)
      const cfgScale = cfgChildren.find((child) => child.name === 'scale')
      expect(Number(cfgScale?.value)).toBeCloseTo(2.75, 2)
    },
  },
]

/**
 * @param {TestEnv['cliContext']} cliContext
 * @param {string} cliConfigPath
 * @param {string} fqbn
 * @param {string} sketchPath
 * @param {CompileOptions} [compileOptions]
 * @returns {Promise<string>}
 */
async function compileSketch(
  cliContext,
  cliConfigPath,
  fqbn,
  sketchPath,
  compileOptions = {}
) {
  const { cliPath } = cliContext
  const { buildProperties = [] } = compileOptions
  const args = [
    'compile',
    sketchPath,
    '-b',
    fqbn,
    '--config-file',
    cliConfigPath,
    '--format',
    'json',
  ]
  for (const buildProperty of buildProperties) {
    args.push('--build-property', buildProperty)
  }
  const { stdout } = await exec(cliPath, args)

  const cliCompileSummary = JSON.parse(stdout)
  return cliCompileSummary.builder_result.build_path
}

describe('decode (slow)', () => {
  decodeTestParams.map(describeDecodeSuite)
})
