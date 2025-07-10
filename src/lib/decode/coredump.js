// @ts-check

import cp from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { AbortError } from '../abort.js'
import { toHexString } from './regs.js'

/** @typedef {import('./decode.js').DecodeResult} DecodeResult */
/** @typedef {import('./decode.js').DecodeInputFileSource} DecodeInputFileSource */
/** @typedef {import('./decode.js').FrameArg} FrameArg */
/** @typedef {import('./decodeParams.js').DecodeCoredumpParams} DecodeCoredumpParams */

/**
 * Attempt to extract an embedded ELF from a raw ESP32 flash dump.
 * @param {DecodeCoredumpParams} params
 * @param {Buffer} raw
 * @param {import('./decode.js').DecodeOptions} [options={}]
 * @returns {Promise<CoredumpDecodeResult|undefined>}
 */
async function tryRawElfFallback(params, raw, options) {
  const expectedMagic = Buffer.from([0x7f, 0x45, 0x4c, 0x46])
  const offset = raw.indexOf(expectedMagic)
  if (offset !== -1) {
    // Estimate the total ELF size using program headers
    const e_phoff = raw.readUInt32LE(offset + 28)
    const e_phentsize = raw.readUInt16LE(offset + 42)
    const e_phnum = raw.readUInt16LE(offset + 44)
    const maxEnd = (() => {
      let max = 0
      for (let i = 0; i < e_phnum; i++) {
        const entryOffset = offset + e_phoff + i * e_phentsize
        const p_offset = raw.readUInt32LE(entryOffset + 4)
        const p_filesz = raw.readUInt32LE(entryOffset + 16)
        const end = p_offset + p_filesz
        if (end > max) {
          max = end
        }
      }
      return max
    })()
    const elfTotalSize = maxEnd
    if (raw.length >= offset + elfTotalSize) {
      const elfBuffer = raw.subarray(offset, offset + elfTotalSize)
      const tmpDirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'trbr-'))
      const extractedElfPath = path.join(tmpDirPath, 'extracted.elf')
      await fs.writeFile(extractedElfPath, elfBuffer)
      try {
        const result = await decodeCoredump(
          {
            ...params,
          },
          { inputPath: extractedElfPath },
          options,
          false
        )
        return result
      } finally {
        await fs
          .rm(tmpDirPath, { recursive: true, force: true })
          .catch((err) => console.warn('Failed to clean up temp dir:', err))
      }
    }
  }
  return undefined
}

/**
 * @typedef {Object} ThreadDecodeResult
 * @property {string} threadId
 * @property {number} TCB
 * @property {string} [threadName]
 * @property {DecodeResult} result
 * @property {boolean} [current]
 */

/**
 * @typedef {ThreadDecodeResult[]} CoredumpDecodeResult
 */

/**
 * @template T
 * @typedef {Object} Executor
 * @property {Parameters<ConstructorParameters<typeof Promise<T>>[0]>[0]} resolve
 * @property {Parameters<ConstructorParameters<typeof Promise<T>>[0]>[1]} reject
 */

export class GdbMiClient {
  /**
   * @param {string} gdbPath
   * @param {string[]} args
   * @param {import('./decode.js').DecodeOptions} [options={}]
   */
  constructor(gdbPath, args, options = {}) {
    this.cp = cp.spawn(gdbPath, args, { stdio: 'pipe', signal: options.signal })
    /** @type {Error|undefined} */
    this.error = undefined
    /** @type {Array<Executor<string>>} */
    this.commandQueue = []

    this.signal = options.signal
    if (this.signal) {
      this.signal.addEventListener('abort', () => {
        const abortErr = new AbortError()
        this.error = abortErr
        this.commandQueue.forEach((executor) => executor.reject(abortErr))
        this.commandQueue = []
      })
    }

    this.stdoutBuffer = ''
    this.cp.stdout.on('data', (chunk) => this._onData(chunk))
    this.cp.stderr.on('data', (chunk) => this._onData(chunk))
    this.cp.on('error', (err) => {
      this.error = err
      this.commandQueue.forEach((executor) => executor.reject(err))
      this.commandQueue = []
    })
  }

  /**
   * @param {string} command
   * @returns {Promise<string>}
   */
  sendCommand(command) {
    if (this.error) {
      return Promise.reject(this.error)
    }
    return new Promise((resolve, reject) => {
      const executor = { resolve, reject }
      this.commandQueue.push(executor)
      this.cp.stdin.write(`${command}\n`)
    })
  }

  /**
   * @param {Buffer} chunk
   */
  _onData(chunk) {
    if (this.error) {
      this.commandQueue.forEach((executor) => executor.reject(this.error))
      this.commandQueue = []
    }

    this.stdoutBuffer += chunk.toString()
    if (/\(gdb\)\s*$/m.test(this.stdoutBuffer)) {
      const output = this.stdoutBuffer
      this.stdoutBuffer = ''
      const executor = this.commandQueue.shift()
      executor?.resolve(output)
    }
  }

  close() {
    this.cp.stdin.end()
    this.cp.kill()
  }

  /**
   * @returns {Promise<void>}
   */
  async drainHandshake() {
    return new Promise((resolve, reject) => {
      const onData = (/** @type {Buffer} */ chunk) => {
        if (this.error) {
          this.cp.stdout.off('data', onData)
          reject(this.error)
          return
        }
        this.stdoutBuffer += chunk.toString()
        if (/\(gdb\)\s*$/m.test(this.stdoutBuffer)) {
          this.cp.stdout.off('data', onData)
          if (this.signal) {
            this.signal.removeEventListener('abort', onAbort)
          }
          this.stdoutBuffer = ''
          resolve()
        }
      }
      const onAbort = () => {
        this.cp.stdout.off('data', onData)
        this.signal?.removeEventListener('abort', onAbort)
        reject(new AbortError())
      }
      this.cp.stdout.on('data', onData)
      this.signal?.addEventListener('abort', onAbort)
    })
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

  // Try MI-style first: match optional frame-prefix then register-values
  const miMatch = regsRaw.match(
    /(?:frame=\{[^}]*\},)?register-values=\[([^\]]*)\]/
  )
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
 * @param {string} str
 * @param {string} key
 * @returns {string|undefined}
 */
function extractBracketContent(str, key) {
  const keyPattern = key + '=['
  const idx = str.indexOf(keyPattern)
  if (idx < 0) {
    return undefined
  }
  let start = str.indexOf('[', idx)
  if (start < 0) {
    return undefined
  }
  let depth = 0
  for (let i = start; i < str.length; i++) {
    const c = str[i]
    if (c === '[') {
      depth++
    } else if (c === ']') {
      depth--
      if (depth === 0) {
        return str.substring(start + 1, i)
      }
    }
  }
  return undefined
}

/**
 * @param {DecodeCoredumpParams} params
 * @param {DecodeInputFileSource} input
 * @param {boolean} [tryRepair]
 * @param {import('./decode.js').DecodeOptions} [options={}]
 * @returns {Promise<CoredumpDecodeResult>}
 */
export async function decodeCoredump(
  params,
  input,
  options = {},
  tryRepair = true
) {
  const { elfPath, toolPath } = params
  const { inputPath } = input
  const client = new GdbMiClient(
    toolPath,
    ['--interpreter=mi2', '-c', inputPath, elfPath],
    options
  )
  /** @type {ThreadDecodeResult[]} */
  const results = []

  try {
    // Use -thread-info for a more reliable MI listing of threads
    await client.drainHandshake()

    const threadsRaw = await client.sendCommand('-thread-info')

    const currentThreadMatch = threadsRaw.match(/current-thread-id="(\d+)"/)
    const currentThreadId = currentThreadMatch ? currentThreadMatch[1] : null

    // Extract the contents of the top-level threads=[ ... ] block, handling nested brackets
    const threadsContent = extractBracketContent(threadsRaw, 'threads')
    /** @type {Array<[string,string]>} */
    const threadEntries = []
    if (threadsContent) {
      // Split into individual thread objects by balanced braces
      const objs = []
      let depth = 0
      let objStart = -1
      for (let i = 0; i < threadsContent.length; i++) {
        const ch = threadsContent[i]
        if (ch === '{') {
          if (depth === 0) {
            objStart = i
          }
          depth++
        } else if (ch === '}') {
          depth--
          if (depth === 0 && objStart >= 0) {
            objs.push(threadsContent.slice(objStart, i + 1))
          }
        }
      }
      // Extract id and TCB (target-id) from each object
      for (const objStr of objs) {
        const m = /id="([^"]+)"\s*,\s*target-id="process\s+(\d+)"/.exec(objStr)
        if (m) {
          threadEntries.push([m[1], m[2]])
        }
      }
    }
    const threadIds = threadEntries.map(([id]) => id)
    const threadTcbs = Object.fromEntries(
      threadEntries.map(([id, tcb]) => [id, Number(tcb)])
    )

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

      const btOut = await client.sendCommand('-stack-list-frames')

      const argsOut = await client.sendCommand(
        `-stack-list-arguments --simple-values 0 100`
      )
      // Parse frame arguments safely, splitting on top-level frame boundaries
      const argsListMatch = argsOut.match(/stack-args=\[([\s\S]*)\]/)
      /** @type {{ level?: string; args: FrameArg[] }[]} */
      let frameArgs = []
      if (argsListMatch) {
        const content = argsListMatch[1]
        // Split on '},frame={' to avoid inner brace conflicts
        const parts = content.split(/},\s*frame=\{/).map((part, idx) => {
          if (idx === 0) {
            return part + '}'
          }
          return 'frame={' + part + '}'
        })
        frameArgs = parts.map((frameStr) => {
          const rawMatch = frameStr.match(/frame=\{([\s\S]*)\}/)
          const raw = rawMatch ? rawMatch[1] : ''
          /** @type {{ level?: string; args: FrameArg[] }} */
          const obj = { args: [] }
          // extract frame level
          const levelMatch = raw.match(/level="(\d+)"/)
          if (levelMatch) {
            obj.level = levelMatch[1]
          }
          // extract args array content
          const argsMatchInner = raw.match(/args=\[([\s\S]*)\]/)
          if (argsMatchInner && argsMatchInner[1].trim()) {
            const argsContent = argsMatchInner[1]
            const argRegex =
              /\{name="([^"]+)",type="([^"]+)",value="([^"]+)"\}/g
            let m
            while ((m = argRegex.exec(argsContent))) {
              obj.args.push({ name: m[1], type: m[2], value: m[3] })
            }
          }
          return obj
        })
      } else {
        frameArgs = []
      }

      const btParsed = parseBacktrace(btOut)
      const stacktraceLines = btParsed.map((frame, index) => {
        const args = frameArgs[index]?.args || ''
        return {
          regAddr: frame.addr,
          lineNumber: frame.line ?? '??',
          ...(frame.func && frame.file
            ? { method: frame.func, file: frame.file, args }
            : {}),
        }
      })

      results.push({
        threadId: tid,
        TCB: threadTcbs[tid],
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
            faultCode: undefined, // Xtensa includes exccause, but the RISC-V variant does not include mcause, mtval, etc.
          },
          regs: regsAsNamed,
          stacktraceLines,
        },
        current: tid === currentThreadId,
      })
    }
  } catch (error) {
    throw error
  } finally {
    client.close()
  }

  if (!results.length && tryRepair) {
    const raw = await fs.readFile(input.inputPath)
    const fallback = await tryRawElfFallback(params, raw)
    if (fallback) {
      return fallback
    }
  }

  return results
}
