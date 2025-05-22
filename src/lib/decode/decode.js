// @ts-check

import { addr2line } from './add2Line.js'
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
 * @typedef {Object} AddrLine
 * @property {number} [addr]
 * @property {AddrLocation} location
 */

/**
 *
 * @param {unknown} arg
 * @returns {arg is AddrLine}
 */
export function isAddrLine(arg) {
  return (
    arg !== null &&
    typeof arg === 'object' &&
    'addr' in arg &&
    (typeof arg.addr === 'number' || arg.addr === undefined) &&
    'location' in arg &&
    (typeof arg.location === 'string' ||
      isGDBLine(arg.location) ||
      isParsedGDBLine(arg.location))
  )
}

/** @param {AddrLocation} [addrLocation]  */
// TODO: is it needed?
export function getAddr(addrLocation) {
  if (!addrLocation) {
    return undefined
  }
  const parsedAddr = parseInt(
    isGDBLine(addrLocation) ? addrLocation.regAddr : addrLocation ?? '0',
    16
  )
  return isNaN(parsedAddr) ? undefined : parsedAddr
}

/** @param {AddrLocation} addrLocation */
export function stringifyAddr(addrLocation) {
  if (isParsedGDBLine(addrLocation)) {
    return `${addrLocation.regAddr} in ${addrLocation.method} at ${addrLocation.file}:${addrLocation.lineNumber}`
  }
  if (isGDBLine(addrLocation)) {
    return `${addrLocation.regAddr} in ${addrLocation.lineNumber}`
  }
  return `${addrLocation} in ?? ()`
}

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
 * @property {AddrLine} programCounter PC at fault (PC for ESP32, MEPC for RISC-V, EPC1 for ESP8266)
 * @property {AddrLine} faultAddr EXCVADDR for ESP32, EXCVADDR for RISC-V and ESP8266
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
 * @property {number} [programCounter]
 * @property {number} [faultAddr]
 * @property {number} [faultCode]
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
 *   backtraceAddrs: (AddrLine|number)[]
 * }} PanicInfoWithBacktrace
 */

/**
 * @callback DecodeCoredumpFunction
 * @param {DecodeParams} params
 * @param {string} coredumpPath
 * @param {DecodeOptions} options
 * @returns {Promise<(PanicInfoWithBacktrace|PanicInfoWithStackData)[]>}
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

  const fixedPathsResult = fixWindowsPaths(result)
  let filteredResult = filterFreeRTOSStackLines(fixedPathsResult)
  filteredResult = filterStackPointerLines(filteredResult) // let users decide if they want to filter stack pointer lines
  const dedupedResult = dedupeGDBLines(filteredResult)

  return dedupedResult
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
 * @template {AddrLine|AddrLocation|undefined} T
 * @param {T} locationAware
 * @returns {T}
 */
function fixWindowsPathInLocation(locationAware) {
  if (!locationAware) {
    return locationAware
  }

  if (isAddrLine(locationAware)) {
    const location = locationAware.location
    if (isParsedGDBLine(location)) {
      const copy = JSON.parse(JSON.stringify(locationAware))
      copy.location.file = fixWindowsPath(location.file)
      return copy
    }
  }

  if (isParsedGDBLine(locationAware)) {
    const copy = JSON.parse(JSON.stringify(locationAware))
    copy.file = fixWindowsPath(locationAware.file)
    return copy
  }

  return locationAware
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

/**
 * Debug utility to log all decoded address info using addr2line.
 * @param {string} toolPath
 * @param {string} elfPath
 * @param {number[]} rawAddresses
 */
export async function debugAllAddrs(toolPath, elfPath, rawAddresses) {
  const lines = await addr2line({ toolPath, elfPath }, rawAddresses)
  console.log('Decoded Addresses:')
  console.log('done')
  console.log('----------------------')
  const padding = String(lines.length - 1).length
  console.log(
    lines
      .map((line) => line.location)
      .map(stringifyAddr)
      .map(
        (line, index) => `#${index.toString().padStart(padding, ' ')} ${line}`
      )
      .join('\n')
  )
  console.log('----------------------')
}

/**
 * @param {GDBLine|ParsedGDBLine} left
 * @param {GDBLine|ParsedGDBLine} right
 */
function equalsGDBLine(left, right) {
  if (isParsedGDBLine(left) && !isParsedGDBLine(right)) {
    return false
  }
  if (!isParsedGDBLine(left) && isParsedGDBLine(right)) {
    return false
  }

  if (isParsedGDBLine(left) && isParsedGDBLine(right)) {
    return (
      left.regAddr === right.regAddr &&
      left.lineNumber === right.lineNumber &&
      left.file === right.file &&
      left.method === right.method
    )
  }

  return left.regAddr === right.regAddr && left.lineNumber === right.lineNumber
}

/**
 * @param {DecodeResult} result
 * @returns
 */
function filterFreeRTOSStackLines(result) {
  return {
    ...result,
    stacktraceLines: result.stacktraceLines.filter((line) => {
      if (
        isGDBLine(line) &&
        line.lineNumber === '??' &&
        line.regAddr.toLowerCase() === '0xfeefeffe'
      ) {
        return false
      }
      return true
    }),
  }
}

/**
 * @param {DecodeResult} result
 * @returns {DecodeResult}
 */
function filterStackPointerLines(result) {
  return {
    ...result,
    stacktraceLines: result.stacktraceLines.reduce(
      (acc, currentLine, index, thisArray) => {
        const prevLine = thisArray[index - 1]
        if (prevLine && isStackPointerLine(currentLine, prevLine)) {
          return acc
        }
        return [...acc, currentLine]
      },
      /** @type {(GDBLine|ParsedGDBLine)[]} */ ([])
    ),
  }
}

/**
 * @param {GDBLine|ParsedGDBLine} line
 * @param {GDBLine|ParsedGDBLine} prevLine
 * @returns
 */
function isStackPointerLine(line, prevLine) {
  if (!isParsedGDBLine(prevLine)) {
    return false
  }

  const prevAddr = getAddr(prevLine.regAddr)
  const addr = getAddr(line.regAddr)
  if (addr === undefined || prevAddr === undefined) {
    return false
  }

  const isAddr3x = addr >>> 28 === 0x3
  const isPrevAddr4x = prevAddr >>> 28 === 0x4

  return line.lineNumber === '??' && isAddr3x && isPrevAddr4x
}

/**
 *
 * @param {DecodeResult} result
 * @returns {DecodeResult}
 */
function dedupeGDBLines(result) {
  return {
    ...result,
    stacktraceLines: result.stacktraceLines.reduce(
      (acc, currentLine, index) => {
        const previousLine = acc[index - 1]
        if (previousLine && equalsGDBLine(previousLine, currentLine)) {
          return acc
        }
        return [...acc, currentLine]
      },
      /** @type {(GDBLine|ParsedGDBLine)[]} */ ([])
    ),
  }
}
