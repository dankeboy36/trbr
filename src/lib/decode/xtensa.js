// @ts-check

import { decode } from 'punycode'
import { exec } from '../exec.js'
import { isGDBLine } from '../location.js'
import { toHexString } from './regs.js'

/** @typedef {import('./decode.js').DecodeParams} DecodeParams */
/** @typedef {import('./decode.js').DecodeResult} DecodeResult */
/** @typedef {import('./decode.js').DecodeOptions} DecodeOptions */
/** @typedef {import('./decode.js').GDBLine} GDBLine */
/** @typedef {import('./decode.js').ParsedGDBLine} ParsedGDBLine */
/** @typedef {import('./decode.js').Debug} Debug */

/** @type {import('./decode.js').DecodeFunction} */
export async function decodeXtensa(params, input, options) {
  /** @type {Exclude<typeof input, string>} */
  let panicInfo
  if (typeof input === 'string') {
    panicInfo = parseXtensaPanicOutput(input)
  } else {
    panicInfo = input
  }

  if ('stackBaseAddr' in panicInfo) {
    throw new Error(
      'Unexpectedly received a panic info with stack data for Xtensa'
    )
  }

  const gdbLines = await decodeAddress(
    params,
    panicInfo.backtraceAddrs,
    options
  )

  const [pc, faultAddr] = await decodeAddress(
    params,
    [panicInfo.regs.PC, panicInfo.regs.EXCVADDR],
    options
  )

  return {
    exception: undefined,
    registerLocations: {
      PC: pc,
      EXCVADDR: faultAddr,
    },
    stacktraceLines: gdbLines,
    allocLocation: undefined,
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
 * @returns {import('./decode.js').Exception|undefined}
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
      const lines = await decodeAddress(params, [address], options)
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
  const lines = await decodeAddress(params, [address], options)
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
  return decodeAddress(params, addresses, options)
}

/**
 * @param {DecodeParams} params
 * @param {number[]} addresses
 * @param {DecodeOptions} options
 */
async function decodeAddress(params, addresses, options) {
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

/**
 * @param {number[]} addresses
 * @param {string} elfPath
 */
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
      .map((addr) => ['-ex', `list *${toHexString(addr)}`]) // lists the source at address (https://sourceware.org/gdb/onlinedocs/gdb/Address-Locations.html#Address-Locations)
      .reduce((acc, curr) => acc.concat(curr)),
    '-ex',
    'q', // quit
  ]
}

/**
 * @param {string} stdout
 * @param {Debug} debug
 * @returns {GDBLine[]}
 */
function parseGDBOutput(stdout, debug = () => {}) {
  const lines = stdout.split(/\r?\n/).map((line) => parseGDBLine(line, debug))
  return lines.filter(isGDBLine)
}

/**
 * @param {string} raw
 * @param {Debug} debug
 */
function parseGDBLine(raw, debug = () => {}) {
  const matches = raw.matchAll(
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
  decodeFunctionAtAddress: decodeAddress,
  decodeRegisters,
  parseGDBOutput,
  parseInstructionAddresses,
  parseAlloc,
  parseException,
  parseRegisters,
  parseStacktrace,
  parseGDBLine,
  parseXtensaPanicOutput,
})

/**
 * @param {string} input
 * @returns {import('./decode.js').PanicInfoWithBacktrace}
 */
function parseXtensaPanicOutput(input) {
  const lines = input.split(/\r?\n|\r/)
  /** @type {Record<string, number>} */
  const regs = {}
  let coreId = 0
  let stackData = Buffer.alloc(0)
  let stackBaseAddr = 0
  /** @type {number[]} */
  const backtraceAddrs = []
  const coreIdMatch = input.match(/Guru Meditation Error: Core\s+(\d+)/)
  if (coreIdMatch) {
    coreId = parseInt(coreIdMatch[1], 10)
  }

  const regRegex = /([A-Z]+[0-9]*)\s*:\s*(0x[0-9a-fA-F]+)/g
  const stackLineRegex = /^([0-9a-fA-F]{8}):((?:\s+0x[0-9a-fA-F]{8})+)/

  for (const line of lines) {
    for (const match of line.matchAll(regRegex)) {
      const [, regName, hexValue] = match
      const value = parseInt(hexValue, 16)
      if (!Number.isNaN(value)) {
        regs[regName] = value
      }
    }

    const stackMatch = stackLineRegex.exec(line)
    if (stackMatch) {
      const base = parseInt(stackMatch[1], 16)
      if (!stackBaseAddr) {
        stackBaseAddr = base
      }
      const words = stackMatch[2]
        .trim()
        .split(/\s+/)
        .map((hex) => parseInt(hex, 16))
        .flatMap((word) =>
          Array.from(Buffer.from(word.toString(16).padStart(8, '0'), 'hex'))
        )
      stackData = Buffer.concat([stackData, Buffer.from(words)])
    }

    if (line.startsWith('Backtrace:')) {
      const matches = Array.from(line.matchAll(/0x[0-9a-fA-F]{8}/g))
      for (const match of matches) {
        const addr = parseInt(match[0], 16)
        if (!Number.isNaN(addr)) {
          backtraceAddrs.push(addr)
        }
      }
    }
  }

  return {
    coreId,
    regs,
    backtraceAddrs,
    exceptionCause: regs.EXCCAUSE ?? 0,
    faultAddr: regs.EXCVADDR ?? 0,
  }
}
