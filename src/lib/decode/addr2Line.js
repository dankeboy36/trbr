// @ts-check

import { spawn } from 'node:child_process'

import { isParsedGDBLine } from './decode.js'
import { parseLines } from './regAddr.js'
import { toHexString } from './regs.js'

/**
 * @typedef {Object} CommandQueueItem
 * @property {string} cmd
 * @property {(result:string)=>void} resolve
 * @property {(reason:unknown)=>void} reject
 */

const prompt = '(gdb)'
class GDBSession {
  /**
   * @param {Pick<DecodeParams, 'elfPath'|'toolPath'>} params
   */
  constructor({ toolPath, elfPath }) {
    this.gdb = spawn(toolPath, [elfPath], { stdio: 'pipe' })
    this.buffer = ''
    /** @type {CommandQueueItem[]} */
    this.queue = []
    this.current = null
    this.gdb.stdout.on('data', (chunk) => this._onData(chunk))
    this.gdb.stderr.on('data', (chunk) => this._onData(chunk))
    this.gdb.on('error', (err) => {
      if (this.current) {
        this.current.reject(err)
      }
    })
  }

  /**
   * @param {Buffer} chunk
   */
  _onData(chunk) {
    this.buffer += chunk.toString()
    if (!this.current) {
      return
    }
    const idx = this.buffer.indexOf(prompt)
    if (idx === -1) {
      return
    }
    const output = this.buffer.slice(0, idx)
    this.buffer = this.buffer.slice(idx + prompt.length)
    const { resolve } = this.current
    this.current = null
    resolve(output)
    this._processQueue()
  }

  _processQueue() {
    const item = this.queue.shift()
    if (this.current || !item) {
      return
    }
    const { cmd, resolve, reject } = item
    this.current = { resolve, reject }
    this.gdb.stdin.write(cmd + '\n')
  }

  start() {
    return new Promise((resolve) => {
      const prompt = '(gdb)'
      const onData = (/** @type {Buffer} */ chunk) => {
        this.buffer += chunk.toString()
        const idx = this.buffer.indexOf(prompt)
        if (idx !== -1) {
          this.buffer = this.buffer.slice(idx + prompt.length)
          this.gdb.stdout.off('data', onData)
          this.gdb.stderr.off('data', onData)
          resolve('')
        }
      }
      // attach exactly one listener per stream
      this.gdb.stdout.on('data', onData)
      this.gdb.stderr.on('data', onData)
    })
  }

  /**
   * @param {string} cmd
   */
  exec(cmd) {
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject })
      this._processQueue()
    })
  }

  close() {
    this.gdb.emit('exit', 0)
  }
}

/** @typedef {import('./decode.js').DecodeParams} DecodeParams */
/** @typedef {import('./decode.js').DecodeOptions} DecodeOptions */
/** @typedef {import('./decode.js').GDBLine} GDBLine */
/** @typedef {import('./decode.js').ParsedGDBLine} ParsedGDBLine */
/** @typedef {import('./decode.js').AddrLine} AddrLine */

/**
 * Prepare a minimal list of addresses for addr2line usage.
 * @param {(number|AddrLine|undefined)[]} addrs
 * @returns {number[]}
 */
function buildAddr2LineAddrs(addrs) {
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
  return Array.from(dedupedAddrs.values())
}

/**
 * @typedef {Object} RegsInfo
 * @property {Record<number, Record<string, number>>} threadRegs
 * @property {number} [currentThreadAddr]
 */

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  decodeAddrs: addr2line,
})

/**
 * Replicates the logic from addr2Line.cjs for GDB-based address-to-line translation.
 * @param {Pick<DecodeParams, 'elfPath'|'toolPath'>} params - Path to the GDB binary.
 * @param {(number|AddrLine|undefined)[]} addrs - Array of addresses.
 * @returns {Promise<AddrLine[]>}
 */
export async function addr2line({ elfPath, toolPath }, addrs) {
  const addresses = buildAddr2LineAddrs(addrs)
  const session = new GDBSession({ elfPath, toolPath })
  await session.start()
  await session.exec('set pagination off')
  await session.exec('set listsize 1')

  const results = new Map()
  for (const addr of addresses) {
    const hex = toHexString(addr)
    const listOutput = await session.exec(`list *${hex}`)
    let parsedLines = parseLines(listOutput)
    let location = parsedLines.find(isParsedGDBLine)
    if (!location) {
      const lineOutput = await session.exec(`info line *${hex}`)
      parsedLines = parseLines(lineOutput)
      location = parsedLines.find(isParsedGDBLine)
    }
    results.set(addr, {
      addr,
      location: location ?? { regAddr: hex, lineNumber: '??' },
    })
  }

  session.close()

  return addrs.map((addrOrLine) => {
    const addr = typeof addrOrLine === 'object' ? addrOrLine.addr : addrOrLine
    return results.get(addr) || { location: '??' }
  })
}
