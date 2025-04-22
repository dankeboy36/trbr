// @ts-check

import { texts } from './decode.text.js'
import { riscvDecoders } from './riscv.js'
import { decodeXtensa } from './xtensa.js'

/**
 * @typedef {string} RegAddr `'0x12345678'` or `'this::loop'`
 */

/**
 * @typedef {Object} GDBLine
 * @property {RegAddr} regAddr
 * @property {string} lineNumber `'36'` or `'??'`
 */

/**
 * @typedef {GDBLine & {
 *   file: string,
 *   method: string,
 * }} ParsedGDBLine
 */

/**
 * @typedef {RegAddr|GDBLine|ParsedGDBLine} AddrLocation
 */

/**
 * @callback DecodeFunction
 * @param {DecodeParams} params
 * @param {string|Awaited<ReturnType<DecodeCoredumpFunction>>[number]} input
 * @param {DecodeOptions} [options]
 * @returns {Promise<DecodeResult>}
 */

/**
 * @typedef {Object} AllocInfo
 * @property {AddrLocation} allocAddr
 * @property {number} allocSize
 */

/**
 * @typedef {Object} DecodeParams
 * @property {string} toolPath
 * @property {string} elfPath
 * @property {DecodeTarget} [targetArch]
 */

/**
 * @typedef {Object} FaultInfo
 * @property {number} coreId
 * @property {AddrLocation} programCounter PC at fault (PC for ESP32, MEPC for RISC-V, EPC1 for ESP8266)
 * @property {AddrLocation} faultAddr EXCVADDR for ESP32, EXCVADDR for RISC-V and ESP8266
 * @property {number} [faultCode] EXCCAUSE for ESP32, EXCCODE for RISC-V
 * @property {string} [faultMessage]
 */

/**
 * @typedef {Object} DecodeResult
 * @property {FaultInfo} faultInfo
 * @property {Record<string,number>} [regs]
 * @property {(GDBLine|ParsedGDBLine)[]} stacktraceLines
 * @property {AllocInfo} [allocInfo]
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
 * @property {number} programCounter
 * @property {number} faultAddr
 * @property {number} faultCode
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
 * @returns {Promise<Array<PanicInfoWithBacktrace|PanicInfoWithStackData>>}
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

/** @type {DecodeFunction} */
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

export function stringifyAddrLocation(location) {
  if (isParsedGDBLine(location)) {
    return `${location.regAddr} in ${location.method} at ${location.file}:${location.lineNumber}`
  }
  if (isGDBLine(location)) {
    return `${location.regAddr} in ${location.lineNumber}`
  }
  return `${location} in ?? ()`
}

/**
 * @param {unknown} arg
 * @returns {arg is GDBLine}
 */
export function isGDBLine(arg) {
  return (
    arg !== null &&
    typeof arg === 'object' &&
    'regAddr' in arg &&
    typeof arg.regAddr === 'string' &&
    'lineNumber' in arg &&
    typeof arg.lineNumber === 'string'
  )
}

/**
 * @param {unknown} arg
 * @returns {arg is ParsedGDBLine}
 */
export function isParsedGDBLine(arg) {
  return (
    isGDBLine(arg) &&
    'file' in arg &&
    typeof arg.file === 'string' &&
    'method' in arg &&
    typeof arg.method === 'string'
  )
}

/**
 * @param {DecodeResult} result
 * @returns {DecodeResult}
 */
function fixWindowsPaths(result) {
  return {
    ...result,
    faultInfo: {
      ...result.faultInfo,
      programCounter: fixWindowsPathInLocation(result.faultInfo.programCounter),
      faultAddr: fixWindowsPathInLocation(result.faultInfo.faultAddr),
    },
    stacktraceLines: result.stacktraceLines.map(fixWindowsPathInLocation),
    allocInfo: result.allocInfo
      ? {
          ...result.allocInfo,
          allocAddr: fixWindowsPathInLocation(result.allocInfo.allocAddr),
        }
      : undefined,
  }
}

/**
 * @template {AddrLocation} T
 * @param {T} location
 * @returns {T}
 */
function fixWindowsPathInLocation(location) {
  if (isParsedGDBLine(location)) {
    const copy = JSON.parse(JSON.stringify(location))
    return { ...copy, file: fixWindowsPath(location.file) }
  }
  return location
}

// To fix the path separator issue on Windows:
//      -      "file": "D:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1/riscv_1.ino"
//      +      "file": "d:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1\\riscv_1.ino"
/** @param {string} path */
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
