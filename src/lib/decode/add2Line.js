// @ts-check

import { exec } from '../exec.js'
import { isParsedGDBLine } from './decode.js'
import { parseLines } from './regAddr.js'
import { toHexString } from './regs.js'

/** @typedef {import('./decode.js').DecodeParams} DecodeParams */
/** @typedef {import('./decode.js').DecodeOptions} DecodeOptions */
/** @typedef {import('./decode.js').GDBLine} GDBLine */
/** @typedef {import('./decode.js').ParsedGDBLine} ParsedGDBLine */
/** @typedef {import('./decode.js').AddrLine} AddrLine */

/**
 * @param {number[]} addrs - Array of addresses.
 * @param {string} elfPath
 */
function buildAddr2LineFlags(addrs, elfPath) {
  return [
    '--batch',
    elfPath,
    '-ex',
    'set listsize 1',
    '-ex',
    'set pagination off',
    '-ex',
    'set confirm off',
    '-ex',
    'set verbose off',
    ...addrs.map(toHexString).flatMap((addr) => [
      '-ex',
      // separate each line with a marker to avoid GDB output optimization
      `printf ">>> ADDR: ${addr}\\n"`,
      // Randomly freezes GDB for esp8266 making impossible to kill the xtensa-lx106-elf-gdb process
      // '-ex',
      // `info address *${addr}`,
      '-ex',
      `info line *${addr}`,
      '-ex',
      `info symbol ${addr}`,
      '-ex',
      `info functions ${addr}`,
      '-ex',
      `info variables ${addr}`,
      '-ex',
      `list *${addr}`,
    ]),
    '-ex',
    'quit',
  ]
}

/**
 * @typedef {Object} RegsInfo
 * @property {Record<number, Record<string, number>>} threadRegs
 * @property {number} [currentThreadAddr]
 */

/**
 *
 * @param {Pick<DecodeParams,'elfPath'|'toolPath'>} params
 * @param {string} coredumpPath
 * @param {DecodeOptions} options
 */
export async function getRegsInfo(params, coredumpPath, options) {
  const { elfPath, toolPath } = params
  const flags = [
    elfPath,
    coredumpPath,
    '--batch',
    '-ex',
    'info threads',
    '-ex',
    'thread apply all info registers',
    // '-ex',
    // 'thread apply all info frame',
    // '-ex',
    // 'thread apply all info args',
    // '-ex',
    // 'thread apply all info locals',
    // '-ex',
    // 'thread apply all disassemble /r $pc,+32',
    '-ex',
    'q',
  ]
  const { stdout } = await exec(toolPath, flags, options)
  const lines = stdout.split(/\r?\n/)
  /** @type {RegsInfo} */
  const regsInfo = { threadRegs: {} }
  let currentThreadAddr

  for (const line of lines) {
    let match =
      line.match(/^\[Current thread is \d+ \(process (\d+)\)\]/) ||
      line.match(/^Thread \d+ \(process (\d+)\)/)
    if (match) {
      currentThreadAddr = +match[1]
      regsInfo.currentThreadAddr = currentThreadAddr
      regsInfo.threadRegs[currentThreadAddr] = {}
      continue
    }

    match = line.match(/^(\w+)\s+(0x[0-9a-fA-F]+)\s+(-?\d+)/)
    if (match && currentThreadAddr) {
      const [, name, hex] = match
      regsInfo.threadRegs[currentThreadAddr][name] = parseInt(hex, 16)
    }
  }

  return regsInfo
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  buildCommandFlags: buildAddr2LineFlags,
  decodeAddrs: addr2line,
})

/**
 * Replicates the logic from addr2Line.cjs for GDB-based address-to-line translation.
 * @param {Pick<DecodeParams, 'elfPath'|'toolPath'>} params - Path to the GDB binary.
 * @param {(number|AddrLine|undefined)[]} addrs - Array of addresses.
 * @returns {Promise<AddrLine[]>}
 */
export async function addr2line({ elfPath, toolPath }, addrs) {
  // Filter and deduplicate with order preserved
  /** @type {Set<number>} */
  const dedupedAddrs = new Set()
  for (const addr of addrs) {
    let addrNumber
    if (typeof addr === 'object') {
      addrNumber = addr.addr
    } else if (typeof addr === 'number') {
      addrNumber = addr
    }
    if (addrNumber !== undefined && !dedupedAddrs.has(addrNumber)) {
      dedupedAddrs.add(addrNumber)
    }
  }

  const args = buildAddr2LineFlags(Array.from(dedupedAddrs.values()), elfPath)
  const { stdout } = await exec(toolPath, args)
  // Parse output: split by >>> ADDR: (0x...)
  // this regex:
  //   >>> ADDR:\s*(0x[0-9a-fA-F]+)\r?\n   — match the marker + capture the hex addr
  //   ([\s\S]*?)                          — lazily capture everything (including newlines)
  //   (?=>>> ADDR:|$)                     — up to next marker or end of string
  const re = />>> ADDR:\s*(0x[0-9a-fA-F]+)\r?\n([\s\S]*?)(?=>>> ADDR:|$)/g

  /** @type {Map<number, AddrLine>} */
  const addrMap = new Map()
  for (const [, addrHex, block] of stdout.matchAll(re)) {
    // can be a multiline output
    const parsedLines = parseLines(block)
    const location = parsedLines.find(isParsedGDBLine)
    const addr = Number.parseInt(addrHex)
    addrMap.set(addr, {
      addr,
      location: location ?? { regAddr: addrHex, lineNumber: '??' },
    })
  }

  // TODO: support ESP32-specific ROM functions

  /** @type {AddrLine[]} */
  const result = []
  for (const addr of addrs) {
    let addrNumber
    if (typeof addr === 'object') {
      addrNumber = addr.addr
    } else if (typeof addr === 'number') {
      addrNumber = addr
    }

    /** @type {AddrLine} */
    let add2Line = { location: '??' }
    if (addrNumber !== undefined) {
      add2Line = addrMap.get(addrNumber) ?? { location: '??' }
    } else {
      // console.warn(
      //   'addr2line: address is not a number or AddrLine object, skipping',
      //   addr
      // )
    }
    result.push(add2Line)
  }

  return result
}
