// @ts-check

import { exec } from '../exec.js'
import { toHexString } from './regs.js'

/** @typedef {import('./decode.js').DecodeParams} DecodeParams */
/** @typedef {import('./decode.js').DecodeOptions} DecodeOptions */
/** @typedef {import('./decode.js').GDBLine} GDBLine */
/** @typedef {import('./decode.js').ParsedGDBLine} ParsedGDBLine */

/**
 * @param {Pick<DecodeParams,'elfPath'|'toolPath'>} params
 * @param {number[]} addrs
 * @param {DecodeOptions} options
 * @returns {Promise<Array<GDBLine|ParsedGDBLine|undefined>>}
 */
export async function decodeAddrs(params, addrs, options) {
  const { toolPath, elfPath } = params
  const flags = buildCommandFlags(addrs, elfPath)
  const { stdout } = await exec(toolPath, flags, options)
  return parseGDBLines(stdout)
}

/**
 * @param {number[]} addresses
 * @param {string} elfPath
 */
function buildCommandFlags(addresses, elfPath) {
  return [
    '--batch', // executes in batch mode (https://sourceware.org/gdb/onlinedocs/gdb/Mode-Options.html)
    elfPath,
    '-ex', // executes a command
    'set listsize 1', // set the default printed source lines to one (https://sourceware.org/gdb/onlinedocs/gdb/List.html)
    ...addresses.flatMap((addr) => ['-ex', `list *${toHexString(addr)}`]), // lists the source at address (https://sourceware.org/gdb/onlinedocs/gdb/Address-Locations.html#Address-Locations)
    '-ex',
    'q', // quit
  ]
}

/** @param {string} stdout */
function parseGDBLines(stdout) {
  console.log('stdout', stdout)
  const lines = stdout.split(/\r?\n/)
  const gdbLines = lines.map(parseGDBLine)
  console.log('gdbLines', gdbLines)
  return gdbLines
}

/**
 * @param {string} line
 * @returns {ParsedGDBLine|GDBLine|undefined}
 */
function parseGDBLine(line) {
  const matches = line.matchAll(
    /^(0x[0-9a-f]{8})\s+is in\s+(\S+)\s+\((.*):(\d+)\)\.$/gi
  )
  for (const match of matches) {
    const [, regAddr, method, file, lineNumber] = match
    if (regAddr && method && file && lineNumber) {
      const gdbLine = {
        regAddr,
        method,
        file,
        lineNumber,
      }
      return gdbLine
    }
  }
  const fallbackMatches = line.matchAll(
    /^(0x[0-9a-f]{8}) is at (.+):(\d+)\.?$/gi
  )
  for (const match of fallbackMatches) {
    const [, regAddr, file, lineNumber] = match
    if (regAddr && file && lineNumber) {
      return { regAddr, file, lineNumber, method: '??' }
    }
  }

  // Add support for simpler "is in" fallback line
  const simpleMatch = line.match(/^(0x[0-9a-f]{8}) (is in .+)$/i)
  if (simpleMatch) {
    const [, regAddr, lineNumber] = simpleMatch
    if (regAddr && lineNumber) {
      return { regAddr, lineNumber }
    }
  }

  return undefined
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  buildCommandFlags,
  decodeAddrs,
  parseGDBLine,
  parseGDBLines,
})
