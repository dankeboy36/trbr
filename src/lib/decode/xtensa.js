// @ts-check

import { exec } from '../exec.js'
import { isGDBLine } from '../location.js'

/** @typedef {import('../index').DecodeParams} DecodeParams */
/** @typedef {import('../index').DecodeResult} DecodeResult */
/** @typedef {import('../index').DecodeOptions} DecodeOptions */
/** @typedef {import('../index').GDBLine} GDBLine */
/** @typedef {import('../index').ParsedGDBLine} ParsedGDBLine */
/** @typedef {import('../index').Debug} Debug */

/** @type {import('./decode').DecodeFunction} */
export async function decodeXtensa(params, input, options) {
  const [exception, registerLocations, stacktraceLines, allocLocation] =
    await Promise.all([
      parseException(input),
      decodeRegisters(params, input, options),
      decodeStacktrace(params, input, options),
      decodeAlloc(params, input, options),
    ])

  return {
    exception,
    registerLocations,
    stacktraceLines,
    allocLocation,
  }
}

// Taken from https://github.com/me-no-dev/EspExceptionDecoder/blob/ff4fc36bdaf0bfd6e750086ac01554867ede76d3/src/EspExceptionDecoder.java#L59-L90
const reserved = 'reserved'
const exceptions = [
  'Illegal instruction',
  'SYSCALL instruction',
  'InstructionFetchError: Processor internal physical address or data error during instruction fetch',
  'LoadStoreError: Processor internal physical address or data error during load or store',
  'Level1Interrupt: Level-1 interrupt as indicated by set level-1 bits in the INTERRUPT register',
  "Alloca: MOVSP instruction, if caller's registers are not in the register file",
  'IntegerDivideByZero: QUOS, QUOU, REMS, or REMU divisor operand is zero',
  reserved,
  'Privileged: Attempt to execute a privileged operation when CRING ? 0',
  'LoadStoreAlignmentCause: Load or store to an unaligned address',
  reserved,
  reserved,
  'InstrPIFDataError: PIF data error during instruction fetch',
  'LoadStorePIFDataError: Synchronous PIF data error during LoadStore access',
  'InstrPIFAddrError: PIF address error during instruction fetch',
  'LoadStorePIFAddrError: Synchronous PIF address error during LoadStore access',
  'InstTLBMiss: Error during Instruction TLB refill',
  'InstTLBMultiHit: Multiple instruction TLB entries matched',
  'InstFetchPrivilege: An instruction fetch referenced a virtual address at a ring level less than CRING',
  reserved,
  'InstFetchProhibited: An instruction fetch referenced a page mapped with an attribute that does not permit instruction fetch',
  reserved,
  reserved,
  reserved,
  'LoadStoreTLBMiss: Error during TLB refill for a load or store',
  'LoadStoreTLBMultiHit: Multiple TLB entries matched for a load or store',
  'LoadStorePrivilege: A load or store referenced a virtual address at a ring level less than CRING',
  reserved,
  'LoadProhibited: A load referenced a page mapped with an attribute that does not permit loads',
  'StoreProhibited: A store referenced a page mapped with an attribute that does not permit stores',
]

/**
 *
 * @param {string} input
 * @returns {import('../index').Exception|undefined}
 */
function parseException(input) {
  const matches = input.matchAll(/Exception \(([0-9]*)\)/g)
  for (const match of matches) {
    const value = match[1]
    if (value) {
      const code = Number.parseInt(value.trim(), 10)
      const exception = exceptions[code]
      if (exception) {
        return [exception, code]
      }
    }
  }
  return undefined
}

/**
 *
 * @param {DecodeParams} params
 * @param {string} input
 * @param {DecodeOptions} options
 * @returns
 */
async function decodeRegisters(params, input, options) {
  const [pc, excvaddr] = parseRegisters(input)
  const decode = async (address) => {
    if (address) {
      const lines = await decodeFunctionAtAddress(params, [address], options)
      const line = lines.shift()
      return line ?? `0x${address}`
    }
    return undefined
  }
  const [pcLine, excvaddrLine] = await Promise.all([
    decode(pc),
    decode(excvaddr),
  ])
  /** @type {Record<string,string>} */
  const lines = {}
  if (pcLine) {
    lines['PC'] = pcLine
  }
  if (excvaddrLine) {
    lines['EXCVADDR'] = excvaddrLine
  }
  return lines
}

function parseRegisters(input) {
  // ESP32 register format first, then the ESP8266 one
  const pc =
    parseRegister('PC\\s*:\\s*(0x)?', input) ?? parseRegister('epc1=0x', input)
  const excvaddr =
    parseRegister('EXCVADDR\\s*:\\s*(0x)?', input) ??
    parseRegister('excvaddr=0x', input)
  return [pc, excvaddr]
}

function parseRegister(regexPrefix, input) {
  const matches = input.matchAll(
    new RegExp(`${regexPrefix}([0-9a-f]{8})`, 'gmi')
  )
  for (const match of matches) {
    const value = match.find((m) => m.length === 8) // find the register address
    if (value) {
      return value
    }
  }
  return undefined
}

/**
 *
 * @param {DecodeParams} params
 * @param {string} input
 * @param {DecodeOptions} options
 * @returns {Promise<[GDBLine, number]|[string, number]|undefined>}
 */
async function decodeAlloc(params, input, options) {
  const result = parseAlloc(input)
  if (!result) {
    return undefined
  }
  const [address, size] = result
  const lines = await decodeFunctionAtAddress(params, [address], options)
  const line = lines.shift()
  return line ? [line, size] : [`0x${address}`, size]
}

function parseAlloc(input) {
  const matches = input.matchAll(
    /last failed alloc call: (4[0-3][0-9a-f]{6})\((\d+)\)/gim
  )
  for (const match of matches) {
    const [, address, rawSize] = match
    const size = Number.parseInt(rawSize, 10)
    if (!Number.isNaN(size) && address) {
      return [address, size]
    }
  }
  return undefined
}

async function decodeStacktrace(params, input, options) {
  const content = parseStacktrace(input)
  if (!content) {
    throw new Error('Could not recognize stack trace/backtrace')
  }
  const addresses = parseInstructionAddresses(content)
  if (!addresses.length) {
    throw new Error(
      'Could not detect any instruction addresses in the stack trace/backtrace'
    )
  }
  return decodeFunctionAtAddress(params, addresses, options)
}

async function decodeFunctionAtAddress(params, addresses, options) {
  const { toolPath, elfPath } = params
  const flags = buildCommandFlags(addresses, elfPath)
  const { stdout } = await exec(toolPath, flags, options)
  return parseGDBOutput(stdout, options.debug)
}

function parseStacktrace(input) {
  return stripESP32Content(input) ?? stripESP8266Content(input)
}

function stripESP8266Content(input) {
  const startDelimiter = '>>>stack>>>'
  const startIndex = input.indexOf(startDelimiter)
  if (startIndex < 0) {
    return undefined
  }
  const endDelimiter = '<<<stack<<<'
  const endIndex = input.indexOf(endDelimiter)
  if (endIndex < 0) {
    return undefined
  }
  return input.substring(startIndex + startDelimiter.length, endIndex)
}

function stripESP32Content(input) {
  const matches = input.matchAll(/Backtrace:(.*)/g)
  for (const match of matches) {
    const content = match[1]
    if (content) {
      return content
    }
  }
  return undefined
}

/** @returns {string[]} */
function parseInstructionAddresses(content) {
  return Array.from(content.matchAll(/4[0-3][0-9a-f]{6}\b/gim))
    .map((match) => match[0])
    .filter(Boolean)
}

function buildCommandFlags(addresses, elfPath) {
  if (!addresses.length) {
    throw new Error('Invalid argument: addresses.length <= 0')
  }
  return [
    '--batch', // executes in batch mode (https://sourceware.org/gdb/onlinedocs/gdb/Mode-Options.html)
    elfPath,
    '-ex', // executes a command
    'set listsize 1', // set the default printed source lines to one (https://sourceware.org/gdb/onlinedocs/gdb/List.html)
    ...addresses
      .map((address) => ['-ex', `list *0x${address}`]) // lists the source at address (https://sourceware.org/gdb/onlinedocs/gdb/Address-Locations.html#Address-Locations)
      .reduce((acc, curr) => acc.concat(curr)),
    '-ex',
    'q', // quit
  ]
}

function parseGDBOutput(stdout, debug = (arg) => {}) {
  const lines = stdout.split(/\r?\n/).map((line) => parseGDBLine(line, debug))
  return lines.filter(isGDBLine)
}

function parseGDBLine(raw, debug = (arg) => {}) {
  const matches = raw.matchAll(
    // TODO: restrict to instruction addresses? `4[0-3][0-9a-f]{6}`
    /^(0x[0-9a-f]{8})\s+is in\s+(\S+)\s+\((.*):(\d+)\)\.$/gi
  )
  for (const match of matches) {
    const [, address, method, file, lineNumber] = match
    if (address && method && file && lineNumber) {
      const gdbLine = {
        address,
        method,
        file,
        lineNumber,
      }
      debug(`parseGDBLine, OK: ${JSON.stringify(gdbLine)}`)
      return gdbLine
    }
  }
  const fallbackMatches = raw.matchAll(/(0x[0-9a-f]{8})(\s+is in\s+.*)/gi)
  for (const match of fallbackMatches) {
    const [, address, lineNumber] = match
    if (address && lineNumber) {
      const gdbLine = {
        address,
        lineNumber: lineNumber.trim(),
      }
      debug(`parseGDBLine, fallback: ${JSON.stringify(gdbLine)}`)
      return gdbLine
    }
  }
  debug(`parseGDBLine, failed: ${raw}`)
  return undefined
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  exceptions,
  buildCommandFlags,
  decodeAlloc,
  decodeFunctionAtAddress,
  decodeRegisters,
  parseGDBOutput,
  parseInstructionAddresses,
  parseAlloc,
  parseException,
  parseRegisters,
  parseStacktrace,
  parseGDBLine,
})
