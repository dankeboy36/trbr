// @ts-check

import assert from 'node:assert/strict'
import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { x as run } from 'tinyexec'
import { beforeAll, describe, expect, inject, it } from 'vitest'

import { decode } from './decode/decode.js'
import { isRiscvFQBN } from './decode/riscv.js'
import { __tests, findToolPath } from './tool.js'

/** @typedef {import('../../scripts/env/env.js').TestEnv} TestEnv */

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const sketchesPath = path.join(__dirname, '..', '..', 'sketches')

const esp32Boards = ['esp32', 'esp32s2', 'esp32s3', 'esp32c3']
const esp8266Boards = ['generic']

const expectedToolFilenames = {
  esp32: 'xtensa-esp32-elf-gdb',
  esp32s2: 'xtensa-esp32s2-elf-gdb',
  esp32s3: 'xtensa-esp32s3-elf-gdb',
  esp32c3: 'riscv32-esp-elf-gdb',
  generic: 'xtensa-lx106-elf-gdb',
}

const findToolTestParams = [
  {
    id: ['esp32', 'esp32'],
    toolsInstallType: 'cli',
    boards: [...esp32Boards],
  },
  {
    id: ['espressif', 'esp32'],
    toolsInstallType: 'git',
    boards: [...esp32Boards],
  },
  {
    id: ['esp8266', 'esp8266'],
    toolsInstallType: 'cli',
    boards: [...esp8266Boards],
  },
]

function describeFindToolSuite(params) {
  const [vendor, arch] = params.id
  const platformId = `${vendor}:${arch}`
  return describe(`findToolPath for '${platformId}' platform installed via '${params.toolsInstallType}'`, () => {
    /** @type {TestEnv} */
    let testEnv

    beforeAll(() => {
      // @ts-ignore
      testEnv = inject('testEnv')
      expect(testEnv).toBeDefined()
    })

    params.boards
      .map((boardId) => ({ fqbn: `${platformId}:${boardId}`, boardId }))
      .map(({ fqbn, boardId }) =>
        it(`should find the tool path for '${fqbn}'`, async () => {
          const arduinoCliConfig =
            testEnv.toolsEnvs[params.toolsInstallType].cliConfigPath
          const actual = await findToolPath({
            toolPathOrFqbn: fqbn,
            arduinoCliConfig,
          })
          assert.notEqual(
            actual,
            undefined,
            `could not find tool path for '${fqbn}'`
          )
          const actualFilename = path.basename(actual, path.extname(actual))
          assert.strictEqual(actualFilename, expectedToolFilenames[boardId])
          const { stdout } = await run(actual, ['--version'])
          assert.strictEqual(
            stdout.includes('GNU gdb'),
            true,
            `output does not contain 'GNU gdb': ${stdout}`
          )
        })
      )
  })
}

function describeDecodeSuite(params) {
  const { input, fqbn, sketchPath, expected } = params
  /** @type {TestEnv} */
  let testEnv
  /** @type {import('../index.js').DecodeParams} */
  let decodeParams

  return describe(`decode '${path.basename(
    sketchPath
  )}' sketch on '${fqbn}'`, () => {
    beforeAll(async () => {
      // @ts-ignore
      testEnv = inject('testEnv')
      expect(testEnv).toBeDefined()

      const arduinoCliConfig = testEnv.toolsEnvs['cli'].cliConfigPath

      const buildPath = await compileSketch(
        testEnv.cliContext,
        arduinoCliConfig,
        fqbn,
        sketchPath
      )
      const elfPath = path.join(
        buildPath,
        `${path.basename(sketchPath)}.ino.elf`
      )
      const toolPath = await findToolPath({
        toolPathOrFqbn: fqbn,
        arduinoCliConfig,
      })

      const _fqbn = new FQBN(fqbn)
      decodeParams = {
        elfPath,
        toolPath,
        targetArch: isRiscvFQBN(_fqbn) ? _fqbn.boardId : 'xtensa',
      }
    })

    it('should decode', async () => {
      const actual = await decode(decodeParams, input)

      assertDecodeResultEquals(actual, expected)
    })
  })
}

function driveLetterToLowerCaseIfWin32(str) {
  if (process.platform === 'win32' && /^[a-zA-Z]:\\/.test(str)) {
    return str.charAt(0).toLowerCase() + str.slice(1)
  }
  return str
}

function assertObjectContains(actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.deepStrictEqual(
      actual[key],
      expected[key],
      `Mismatch on key: ${key}, expected: ${expected[key]}, actual: ${actual[key]}`
    )
  }
}

function assertLocationEquals(actual, expected) {
  if (typeof expected === 'string' || !('file' in expected)) {
    assert.deepStrictEqual(actual, expected)
    return
  }

  assertObjectContains(actual, {
    method: expected.method,
    address: expected.address,
    lineNumber: expected.lineNumber,
  })

  if (typeof expected.file === 'function') {
    const assertFile = expected.file
    const actualFile = actual.file
    assert.ok(
      assertFile(actualFile),
      `${actualFile} did not pass the assertion`
    )
  } else {
    assert.strictEqual(
      driveLetterToLowerCaseIfWin32(actual.file),
      driveLetterToLowerCaseIfWin32(expected.file)
    )
  }
}

function assertDecodeResultEquals(actual, expected) {
  assert.deepStrictEqual(actual.exception, expected.exception)

  assert.strictEqual(
    Object.keys(actual.registerLocations).length,
    Object.keys(expected.registerLocations).length
  )
  for (const [key, actualValue] of Object.entries(actual.registerLocations)) {
    const expectedValue = expected.registerLocations[key]
    assertLocationEquals(actualValue, expectedValue)
  }

  assert.strictEqual(
    actual.stacktraceLines.length,
    expected.stacktraceLines.length
  )
  for (let i = 0; i < actual.stacktraceLines.length; i++) {
    const actualLine = actual.stacktraceLines[i]
    const expectedLine = expected.stacktraceLines[i]
    assertLocationEquals(actualLine, expectedLine)
  }
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

const skip =
  process.platform === 'win32'
    ? "'fatal error: bits/c++config.h: No such file or directory' due to too long path on Windows (https://github.com/espressif/arduino-esp32/issues/9654 + https://github.com/arendst/Tasmota/issues/1217#issuecomment-358056267)"
    : false

const decodeTestParams = [
  {
    skip,
    input: esp32c3Input,
    fqbn: 'esp32:esp32:esp32c3',
    sketchPath: path.join(sketchesPath, 'riscv_1'),
    expected: {
      exception: ['Load access fault', 5],
      registerLocations: {
        MEPC: '0x4200007e',
        MTVAL: '0x00000000',
      },
      stacktraceLines: [
        {
          method: 'a::geta',
          address: 'this=0x0',
          lineNumber: '11',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(
              path.join(sketchesPath, 'riscv_1/riscv_1.ino')
            ),
        },
        {
          method: 'loop',
          address: '??',
          lineNumber: '21',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(
              path.join(sketchesPath, 'riscv_1/riscv_1.ino')
            ),
        },
        {
          address: '0x4c1c0042',
          lineNumber: '??',
        },
      ],
      allocLocation: undefined,
    },
  },
  {
    skip,
    input: esp32h2Input,
    fqbn: 'esp32:esp32:esp32h2',
    sketchPath: path.join(sketchesPath, 'AE'),
    expected: {
      exception: ['Breakpoint', 3],
      registerLocations: {
        MEPC: '0x42000054',
        MTVAL: '0x00009002',
      },
      stacktraceLines: [
        {
          method: 'loop',
          address: '??',
          lineNumber: '7',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(path.join(sketchesPath, 'AE/AE.ino')),
        },
        {
          address: '0x6c1b0042',
          lineNumber: '??',
        },
      ],
      allocLocation: undefined,
    },
  },
  {
    input: esp32WroomDaInput,
    fqbn: 'esp32:esp32:esp32da',
    expected: {
      exception: undefined,
      registerLocations: {
        PC: {
          address: '0x400d15f1',
          method: 'functionC(int)',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(
              path.join(sketchesPath, 'esp32backtracetest/module2.cpp')
            ),
          lineNumber: '9',
        },
        EXCVADDR: '0x00000000',
      },
      stacktraceLines: [
        {
          address: '0x400d15ee',
          method: 'functionC(int)',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(
              path.join(sketchesPath, 'esp32backtracetest/module2.cpp')
            ),
          lineNumber: '9',
        },
        {
          address: '0x400d1606',
          method: 'functionB(int*)',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(
              path.join(sketchesPath, 'esp32backtracetest/module2.cpp')
            ),
          lineNumber: '14',
        },
        {
          address: '0x400d15da',
          method: 'functionA(int)',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(
              path.join(sketchesPath, 'esp32backtracetest/module1.cpp')
            ),
          lineNumber: '7',
        },
        {
          address: '0x400d15c1',
          method: 'setup()',
          file: (actualFile) =>
            driveLetterToLowerCaseIfWin32(actualFile) ===
            driveLetterToLowerCaseIfWin32(
              path.join(
                sketchesPath,
                'esp32backtracetest/esp32backtracetest.ino'
              )
            ),
          lineNumber: '8',
        },
        {
          address: '0x400d302a',
          method: 'loopTask(void*)',
          file: (actualFile) => actualFile.endsWith('main.cpp'),
          lineNumber: '59',
        },
        {
          address: '0x40088be9',
          method: 'vPortTaskWrapper',
          file: (actualFile) => actualFile.endsWith('port.c'),
          lineNumber: '139',
        },
      ],
      allocLocation: undefined,
    },
    sketchPath: path.join(sketchesPath, 'esp32backtracetest'),
  },
  {
    skip,
    fqbn: 'esp8266:esp8266:generic',
    input: esp8266Input,
    sketchPath: path.join(sketchesPath, 'AE'),
    expected: {
      exception: [
        'LoadProhibited: A load referenced a page mapped with an attribute that does not permit loads',
        28,
      ],
      registerLocations: {
        PC: '0x4020107b',
        EXCVADDR: '0x00000000',
      },
      stacktraceLines: [
        {
          address: '0x4020195c',
          method: 'user_init()',
          file: (actualFile) => actualFile.endsWith('core_esp8266_main.cpp'),
          lineNumber: '676',
        },
      ],
      allocLocation: undefined,
    },
  },
]

/**
 * @param {TestEnv['cliContext']} cliContext
 * @param {TestEnv['toolsEnvs']} toolsEnv
 * @param {string} fqbn
 */
async function getBuildProperties(cliContext, toolsEnv, fqbn) {
  const { cliPath } = cliContext
  const { cli } = toolsEnv
  const { stdout } = await run(cliPath, [
    'board',
    'details',
    '-b',
    fqbn,
    '--config-file',
    cli.cliConfigPath,
    '--format',
    'json',
  ])
  const buildProperties = JSON.parse(stdout).build_properties
  return parseBuildProperties(buildProperties)
}

/**
 * @param {string[]} properties
 * @returns {Record<string,string>}
 */
function parseBuildProperties(properties) {
  return properties.reduce((acc, curr) => {
    const entry = __tests.parseProperty(curr)
    if (entry) {
      const [key, value] = entry
      acc[key] = value
    }
    return acc
  }, {})
}

/**
 * @param {TestEnv['cliContext']} cliContext
 * @param {string} cliConfigPath
 * @param {string} fqbn
 * @param {string} sketchPath
 * @returns {Promise<string>}
 */
async function compileSketch(cliContext, cliConfigPath, fqbn, sketchPath) {
  const { cliPath } = cliContext
  const { stdout } = await run(cliPath, [
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
  findToolTestParams.map(describeFindToolSuite)
  decodeTestParams.map(describeDecodeSuite)
})
