// @ts-check

import { stringifyDecodeResult } from '../src/lib/decode/stringify.js'

/** @type {import('../src/lib/decode/coredump.js').DecodeResult} */
const result = {
  faultInfo: {
    faultMessage: 'test error',
    coreId: 0,
    faultCode: 2,
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
  },
  stacktraceLines: [],
}

const color = process.argv.includes('--test-force-color') ? 'force' : undefined

console.log(stringifyDecodeResult(result, { color }))
