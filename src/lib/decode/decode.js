// @ts-check

import { isParsedGDBLine } from '../location.js'
import { texts } from './decode.text.js'
import { decodeRiscv } from './riscv.js'
import { decodeXtensa } from './xtensa.js'

/** @typedef {import('../index').DecodeParams} DecodeParams */
/** @typedef {import('../index').DecodeResult} DecodeResult */
/** @typedef {import('../index').DecodeOptions} DecodeOptions */
/** @typedef {import('../index').DecodeTarget} DecodeTarget */

/**
 * @callback DecodeFunction
 * @param {DecodeParams} params
 * @param {string} input
 * @param {DecodeOptions} options
 * @returns {Promise<DecodeResult>}
 */

const never = new AbortController().signal

/** @type {DecodeOptions} */
const defaultDecodeOptions = {
  signal: never,
  debug: () => {},
}

const riscvDecoders = /** @type {const}*/ ({
  esp32c2: decodeRiscv,
  esp32c3: decodeRiscv,
  esp32c6: decodeRiscv,
  esp32h2: decodeRiscv,
  esp32h4: decodeRiscv,
})

export const defaultTargetArch = /** @type {const} */ ('xtensa')

const decoders = /** @type {const}*/ ({
  [defaultTargetArch]: decodeXtensa,
  ...riscvDecoders,
})

/** @type {Array<keyof typeof decoders>} */
// @ts-ignore
export const arches = Object.keys(decoders)

/**
 * @param {unknown} arg
 * @returns {arg is DecodeTarget}
 */
export function isDecodeTarget(arg) {
  return typeof arg === 'string' && arg in decoders
}

/**
 * @param {DecodeParams} params
 * @param {string} input
 * @param {DecodeOptions} [options]
 * @returns {Promise<DecodeResult>}
 */
export async function decode(params, input, options = defaultDecodeOptions) {
  const targetArch = params.targetArch ?? defaultTargetArch
  const decoder = decoders[targetArch]
  if (!decoder) {
    throw new Error(texts.unsupportedTargetArch(targetArch))
  }
  const result = await decoder(params, input, options)
  return fixWindowsPaths(result)
}

/**
 * @param {DecodeResult} result
 * @returns {DecodeResult}
 */
function fixWindowsPaths(result) {
  const [location] = result.allocLocation ?? []
  if (location && isParsedGDBLine(location)) {
    location.file = fixWindowsPath(location.file)
  }
  return {
    ...result,
    stacktraceLines: result.stacktraceLines.map((gdbLine) =>
      isParsedGDBLine(gdbLine)
        ? { ...gdbLine, file: fixWindowsPath(gdbLine.file) }
        : gdbLine
    ),
    registerLocations: Object.fromEntries(
      Object.entries(result.registerLocations).map(([key, value]) => [
        key,
        isParsedGDBLine(value)
          ? { ...value, file: fixWindowsPath(value.file) }
          : value,
      ])
    ),
  }
}

// To fix the path separator issue on Windows:
//      -      "file": "D:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1/riscv_1.ino"
//      +      "file": "d:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1\\riscv_1.ino"
function fixWindowsPath(path) {
  return process.platform === 'win32' && /^[a-zA-Z]:\\/.test(path)
    ? path.replace(/\//g, '\\')
    : path
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  fixWindowsPath,
  fixWindowsPaths,
})
