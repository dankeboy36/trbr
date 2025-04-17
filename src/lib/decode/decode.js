// @ts-check

import { isParsedGDBLine } from '../location.js'
import { texts } from './decode.text.js'
import { riscvDecoders } from './riscv.js'
import { decodeXtensa } from './xtensa.js'

/**
 * @typedef {string} Address `0x12345678` or `this::loop`
 */

/**
 * @typedef {Object} GDBLine
 * @property {Address} address
 * @property {string} lineNumber `36` or `??`
 */

/**
 * @typedef {Object} ParsedGDBLine
 * @property {Address} address
 * @property {string} lineNumber `36` or `??`
 * @property {string} file
 * @property {string} method `loop()` or `??`
 */

/**
 * @typedef {Address|GDBLine|ParsedGDBLine} Location
 */

/**
 * @callback DecodeFunction
 * @param {DecodeParams} params
 * @param {string} input
 * @param {DecodeOptions} options
 * @returns {Promise<DecodeResult>}
 */

/**
 * @typedef {[location:Location, size:number]} AllocLocation
 */

/**
 * @typedef {[message:string, code:number]} Exception
 */

/**
 * @typedef {Object} DecodeParams
 * @property {string} toolPath
 * @property {string} elfPath
 * @property {DecodeTarget} [targetArch]
 */

/**
 * @typedef {Object} DecodeResult
 * @property {Exception} [exception]
 * @property {Record<string,Location>} registerLocations
 * @property {(GDBLine|ParsedGDBLine)[]} stacktraceLines
 * @property {AllocLocation} [allocLocation]
 */

/**
 * @typedef {Object} DecodeOptions
 * @property {AbortSignal} [signal]
 * @property {Debug} [debug]
 */

/**
 * @callback Debug
 * @param {any} formatter
 * @param {...any} args
 * @returns {void}
 */

/**
 * @typedef {Object} PanicInfo
 * @property {number} coreId
 * @property {number} faultAddr
 * @property {number} exceptionCause
 * @property {Record<string, number>} regs
 */

/**
 * @typedef {PanicInfo & {
 *   stackBaseAddr: number,
 *   stackData: Buffer,
 *   target: keyof typeof riscvDecoders
 * }} PanicInfoWithStackData
 */

/**
 * @typedef {PanicInfo & {
 *   backtraceAddrs: number[]
 * }} PanicInfoWithBacktrace
 */

/**
 * @typedef {Object} DecodeCoredumpParams
 * @property {DecodeTarget} targetArch
 */

/**
 * @callback DecodeCoredumpFunction
 * @param {DecodeCoredumpParams} params
 * @param {Buffer<ArrayBufferLike>} input
 * @param {DecodeOptions} options
 * @returns {Promise<PanicInfo>}
 */

export const defaultTargetArch = /** @type {const} */ ('xtensa')

/** @typedef {keyof typeof decoders} DecodeTarget */

const decoders = /** @type {const}*/ ({
  [defaultTargetArch]: decodeXtensa,
  ...riscvDecoders,
})

export const arches = /** @type {Array<DecodeTarget>} */ (Object.keys(decoders))

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
export async function decode(
  params,
  input,
  options = { debug: () => {}, signal: new AbortController().signal }
) {
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
