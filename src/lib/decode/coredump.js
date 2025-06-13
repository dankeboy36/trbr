// @ts-check

import { spawn } from 'node:child_process'

import { toHexString } from './regs.js'

/** @typedef {import('./decode.js').DecodeResult} DecodeResult */

/**
 * @typedef {Object} ThreadDecodeResult
 * @property {string} threadId
 * @property {string} [threadName]
 * @property {DecodeResult} result
 */

/**
 * @typedef {ThreadDecodeResult[]} CoredumpDecodeResult
 */

export class GdbMiClient {
  /**
   * @param {string} gdbPath
   * @param {string[]} args
   */
  constructor(gdbPath, args) {
    this.cp = spawn(gdbPath, args, { stdio: 'pipe' })
    this.stdoutBuffer = ''
    this.readyPrompt = /\(gdb\)\s*$/m
    this.commandQueue = /** @type {((result:string)=>void)[]} */ ([])
    this.cp.stdout.on('data', (chunk) => this._onData(chunk))
  }

  /**
   * @param {string} command
   * @returns {Promise<string>}
   */
  sendCommand(command) {
    return new Promise((resolve) => {
      this.commandQueue.push(resolve)
      this.cp.stdin.write(`${command}\n`)
    })
  }

  /**
   * @param {Buffer} chunk
   */
  _onData(chunk) {
    this.stdoutBuffer += chunk.toString()
    if (this.readyPrompt.test(this.stdoutBuffer)) {
      const output = this.stdoutBuffer
      this.stdoutBuffer = ''
      const resolve = this.commandQueue.shift()
      if (resolve) {
        resolve(output)
      }
    }
  }

  close() {
    this.cp.stdin.end()
    this.cp.kill()
  }
}

/**
 * Parses register values from MI output or "info registers" raw output.
 * @param {string} regsRaw
 * @returns {Record<string, string>}
 */
function parseRegisters(regsRaw) {
  /** @type {Record<string, string>} */
  const result = {}

  // Try MI-style first
  const miMatch = regsRaw.match(/register-values=\[(.*?)\]/)
  if (miMatch) {
    const inner = miMatch[1]
    const regex = /\{number="(\d+)",value="(0x[a-fA-F0-9]+)"\}/g
    for (const m of inner.matchAll(regex)) {
      result[m[1]] = m[2]
    }
    return result
  }

  // Try "info registers" style as fallback
  const lines = regsRaw.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^~?"?(\w+)\s+(0x[a-fA-F0-9]+)\b/)
    if (match) {
      const [, name, value] = match
      result[name] = value
    }
  }

  return result
}

/**
 * Parses the MI2 backtrace output string using string replacement and JSON parsing.
 * @param {string} raw
 * @returns {Array<Record<string, string>>}
 */
function parseBacktrace(raw) {
  const entries = [...raw.matchAll(/frame=\{([^}]+)\}/g)].map((match) => {
    /** @type {Record<string, string>} */
    const obj = {}
    for (const pair of match[1].split(',')) {
      const [key, val] = pair.split('=')
      obj[key] = val?.startsWith('"') ? val.slice(1, -1) : val
    }
    return obj
  })
  return entries
}

/**
 * @param {import('./decode.js').DecodeParams & {coredumpPath:string}} params
 * @returns {Promise<CoredumpDecodeResult>}
 */
export async function decodeCoredump({ toolPath, elfPath, coredumpPath }) {
  const client = new GdbMiClient(toolPath, [
    '--interpreter=mi2',
    '-c',
    coredumpPath,
    elfPath,
  ])
  /** @type {ThreadDecodeResult[]} */
  const results = []

  try {
    const threadsRaw = await client.sendCommand('-thread-list-ids')
    const threadMatch = threadsRaw.match(/thread-ids=\{(.*?)\}/)
    const threadIds = threadMatch
      ? [...threadMatch[1].matchAll(/thread-id="(\d+)"/g)].map((m) => m[1])
      : []

    for (const tid of threadIds) {
      await client.sendCommand(`-thread-select ${tid}`)

      const regNamesRaw = await client.sendCommand('-data-list-register-names')
      const regNameMatch = regNamesRaw.match(/register-names=\[(.*?)\]/)
      const regNames = regNameMatch
        ? regNameMatch[1]
            .split(',')
            .map((s) => s.trim().replace(/^"|"$/g, ''))
            .map((name, i) => [i.toString(), name])
            .filter(([, name]) => !!name)
        : []
      const regNameMap = Object.fromEntries(regNames)

      const regsOut = await client.sendCommand('-data-list-register-values x')
      const parsedRegs = parseRegisters(regsOut)

      const regsAsNamed = Object.fromEntries(
        Object.entries(parsedRegs)
          .map(([num, val]) => [regNameMap[num], Number(val)])
          .filter(([name]) => !!name)
      )

      const programCounter = regsAsNamed['pc']
      const faultAddr = regsAsNamed['sp']

      const btOut = await client.sendCommand('-stack-list-frames')
      const stacktraceLines = parseBacktrace(btOut).map((frame) => ({
        regAddr: frame.addr,
        lineNumber: frame.line ?? '??',
        ...(frame.func && frame.file
          ? { method: frame.func, file: frame.file }
          : {}),
      }))

      results.push({
        threadId: tid,
        result: {
          faultInfo: {
            coreId: parseInt(tid),
            programCounter: {
              addr: programCounter,
              location: stacktraceLines[0] ?? {
                regAddr: toHexString(programCounter),
                lineNumber: '??',
              },
            },
            faultAddr: {
              addr: faultAddr,
              location: { regAddr: toHexString(faultAddr), lineNumber: '??' },
            },
            faultCode: undefined, // Xtensa includes exccause, but the RISC-V variant does not include mcause, mtval, etc.
          },
          regs: regsAsNamed,
          stacktraceLines,
        },
      })
    }
  } catch (error) {
    console.error('Error during GDB MI interaction:', error)
    throw error
  } finally {
    client.close()
  }

  return results
}
