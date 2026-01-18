// @ts-check

import { addr2line } from './addr2Line.js'
import { isGDBLine } from './decode.js'
import { resolveGlobalSymbols } from './globals.js'

const xtensaLogPrefix = '[trbr][xtensa]'

/**
 * @param {import('./decode.js').Debug | undefined} debug
 * @returns {import('./decode.js').Debug}
 */
function createXtensaLogger(debug) {
  const writer =
    debug ?? (process.env.TRBR_DEBUG === 'true' ? console.log : undefined)
  return writer ? (...args) => writer(xtensaLogPrefix, ...args) : () => {}
}

/** @typedef {import('./decode.js').DecodeParams} DecodeParams */
/** @typedef {import('./decode.js').DecodeResult} DecodeResult */
/** @typedef {import('./decode.js').DecodeOptions} DecodeOptions */
/** @typedef {import('./decode.js').GDBLine} GDBLine */
/** @typedef {import('./decode.js').ParsedGDBLine} ParsedGDBLine */
/** @typedef {import('./decode.js').Debug} Debug */

/** @type {import('./decode.js').DecodeFunction} */
export async function decodeXtensa(params, input, options) {
  const logXtensa = createXtensaLogger(options?.debug)
  logXtensa('decode start', {
    targetArch: params.targetArch,
    inputType: typeof input,
  })
  /** @type {Exclude<typeof input, string>} */
  let panicInfo
  if (typeof input === 'string') {
    panicInfo = parseESP32PanicOutput(input)
    if (
      !Object.keys(panicInfo.regs).length &&
      !panicInfo.backtraceAddrs.length
    ) {
      panicInfo = parseESP8266PanicOutput(input)
    }
  } else {
    panicInfo = input
  }

  if ('stackBaseAddr' in panicInfo) {
    console.error('input contains stackBaseAddr', JSON.stringify(panicInfo))
    throw new Error('panicInfo must not contain stackBaseAddr')
  }

  const [globals, decodedAddrs] = await Promise.all([
    resolveGlobalSymbols(params, options),
    addr2line(
      params,
      [
        panicInfo.programCounter,
        panicInfo.faultAddr,
        ...(panicInfo.backtraceAddrs ?? []),
      ],
      options
    ),
  ])
  logXtensa('globals count', globals.length)
  const [programCounter, faultAddr, ...addrLines] = decodedAddrs
  logXtensa('addr2line done', {
    programCounter,
    faultAddr,
    frames: addrLines.length,
  })
  let faultMessage
  if (panicInfo.faultCode) {
    faultMessage = exceptions[panicInfo.faultCode]
  }

  /** @type {import('./decode.js').FaultInfo} */
  const faultInfo = {
    coreId: panicInfo.coreId,
    programCounter,
    faultAddr,
    faultCode: panicInfo.faultCode,
    faultMessage,
  }

  return {
    faultInfo,
    regs: panicInfo.regs,
    stacktraceLines: addrLines
      .map(({ location }) => location)
      .filter(isGDBLine),
    allocInfo: undefined,
    globals,
  }
}

/**
 * @param {string} input
 * @returns {import('./decode.js').PanicInfoWithBacktrace}
 */
function parseESP8266PanicOutput(input) {
  const lines = input.split(/\r?\n|\r/)
  /** @type {Record<string, number>} */
  const regs = {}
  const coreId = 0
  /** @type {number[]} */
  const backtraceAddrs = []
  /** @type {number | undefined} */
  let faultCode
  /** @type {number | undefined} */
  let faultAddr

  const regLine = input.match(/Exception\s+\((\d+)\)/)
  if (regLine) {
    faultCode = parseInt(regLine[1], 10)
  }

  for (const line of lines) {
    const epcMatches = line.matchAll(
      /(epc\d+|excvaddr|depc)=(0x[0-9a-fA-F]{8})/g
    )
    for (const match of epcMatches) {
      const [, reg, hex] = match
      regs[reg.toUpperCase()] = parseInt(hex, 16)
      if (reg.toLowerCase() === 'excvaddr') {
        faultAddr = parseInt(hex, 16)
      }
    }

    // Example line: 3fff10b0:  4021a5d4 00000033 3fff20dc 40201ed3
    const stackMatch = line.match(/^\s*[0-9a-f]{8}:\s+((?:[0-9a-f]{8}\s*)+)/i)
    if (stackMatch) {
      const words = stackMatch[1].trim().split(/\s+/)
      for (const word of words) {
        const addr = parseInt(word, 16)
        if (!Number.isNaN(addr) && addr & 0x40000000) {
          backtraceAddrs.push(addr)
        }
      }
    }
  }

  return {
    coreId,
    regs,
    backtraceAddrs,
    faultCode,
    faultAddr,
    programCounter: regs.EPC1,
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
 * @param {string} input
 * @returns {import('./decode.js').PanicInfoWithBacktrace}
 */
function parseESP32PanicOutput(input) {
  const lines = input.split(/\r?\n|\r/)
  /** @type {Record<string, number>} */
  const regs = {}
  let coreId = 0
  /** @type {number[]} */
  const backtraceAddrs = []
  const coreIdMatch = input.match(/Guru Meditation Error: Core\s+(\d+)/)
  if (coreIdMatch) {
    coreId = parseInt(coreIdMatch[1], 10)
  }

  const regRegex = /([A-Z]+[0-9]*)\s*:\s*(0x[0-9a-fA-F]+)/g
  for (const line of lines) {
    for (const match of line.matchAll(regRegex)) {
      const [, regName, hexValue] = match
      const value = parseInt(hexValue, 16)
      if (!Number.isNaN(value)) {
        regs[regName] = value
      }
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
    faultCode: regs.EXCCAUSE,
    faultAddr: regs.EXCVADDR,
    programCounter: regs.PC,
  }
}

/** (non-API) */
export const __tests = /** @type {const} */ ({
  exceptions,
  decodeAddrs: addr2line,
  parseESP32PanicOutput,
  parseESP8266PanicOutput,
})
