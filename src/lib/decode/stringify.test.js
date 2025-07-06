// @ts-check

import { fork } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'

import colors from 'tinyrainbow'
import { beforeEach, describe, expect, it } from 'vitest'

import { stringifyDecodeResult } from './stringify.js'

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const testsPath = path.join(__dirname, '..', '..', '..', '.tests')
const verifyColorsPath = path.join(testsPath, 'verify-colors.js')

const { red, green, blue } = colors

describe('stringify', () => {
  it('should not use nested red escape sequences', () => {
    const actual = stringifyDecodeResult({
      faultInfo: {
        faultMessage: 'error message',
        coreId: 0,
        faultCode: 1,
        programCounter: {
          location: {
            regAddr: '0x400d100d',
            lineNumber: '17',
            file: 'src/main.cpp',
            method: 'mainMethod',
            args: [
              { name: 'arg1', value: 'value1' },
              { name: 'arg2', value: 'value2' },
            ],
          },
          addr: 0x400d100d,
        },
        faultAddr: {
          location: {
            regAddr: '0x400d300d',
            lineNumber: '123',
            file: 'libPath/otherLibFile.cpp',
            method: 'otherMethod',
          },
          addr: 0x400d300d,
        },
      },
      allocInfo: {
        allocAddr: {
          regAddr: '0x400d200d',
          lineNumber: '12',
          file: 'libPath/libFile.cpp',
          method: 'myMethod',
        },
        allocSize: 100,
      },
      stacktraceLines: [
        {
          regAddr: '0x400d100d',
          lineNumber: 'stacktrace line',
        },
        {
          regAddr: '0x400d400d',
          lineNumber: '123',
          file: 'mainSketchFilePath/mainSketchFile.cpp',
          method: 'otherMethod',
        },
      ],
    })

    const expected = [
      red('0 | error message | 1'),
      '',
      red('PC -> ') +
        green('0x400d100d') +
        ': ' +
        blue('mainMethod (arg1=value1, arg2=value2)') +
        ' at src/main.cpp:17',
      red('Fault -> ') +
        green('0x400d300d') +
        ': ' +
        blue('otherMethod ()') +
        ' at libPath/otherLibFile.cpp:123',
      '',
      green('0x400d100d') + ': stacktrace line',
      green('0x400d400d') +
        ': ' +
        blue('otherMethod ()') +
        ' at mainSketchFilePath/mainSketchFile.cpp:123',
      '',
      red('Memory allocation of 100 bytes failed') +
        ' at ' +
        green('0x400d200d') +
        ': ' +
        blue('myMethod ()') +
        ' at libPath/libFile.cpp:12',
    ].join('\r\n')

    expect(actual).toBe(expected)
  })
})

describe('not-TTY', () => {
  beforeEach(() => {
    delete process.env.FORCE_COLOR
    delete process.env.FORCE_TTY
  })

  it('without forceColor option, produces plain text (no ANSI codes)', async () => {
    const cp = fork(verifyColorsPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    let actual = ''
    cp.stdout?.on('data', (chunk) => {
      actual += chunk.toString()
    })
    await new Promise((resolve) => cp.on('exit', resolve))

    const expected = [
      '0 | test error | 2',
      '',
      'PC -> 0x400d100d: mainMethod (arg1=value1, arg2=value2) at src/main.cpp:17',
    ]
    expect(actual.trimEnd()).toBe(expected.join('\r\n'))
  })

  it('with forceColor option, produces ANSI-colored output', async () => {
    const cp = fork(verifyColorsPath, ['--test-force-color'], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    let actual = ''
    cp.stdout?.on('data', (chunk) => {
      actual += chunk.toString()
    })
    await new Promise((resolve) => cp.on('exit', resolve))

    const expected = [
      red('0 | test error | 2'),
      '',
      red('PC -> ') +
        green('0x400d100d') +
        ': ' +
        blue('mainMethod (arg1=value1, arg2=value2)') +
        ' at src/main.cpp:17',
    ]
    expect(actual.trimEnd()).toBe(expected.join('\r\n'))
  })
})
