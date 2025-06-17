// @ts-check

import { spawn } from 'node:child_process'

import { toHexString } from './regs.js'

/** @typedef {import('./decode.js').DecodeResult} DecodeResult */
/** @typedef {import('./decode.js').FrameArg} FrameArg */

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

export class GdbMiClient {
  /**
   * @param {string} gdbPath
   * @param {string[]} args
   */
  constructor(gdbPath, args) {
    this.cp = spawn(gdbPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    this.stdoutBuffer = ''
    this.readyPrompt = /\(gdb\)\s*$/m
    this.commandQueue = /** @type {((result:string)=>void)[]} */ ([])
    // For debugging: record each command and its raw MI reply
    // this.history = []
    // this.pendingCommands = []
    // Capture both stdout and stderr
    this.cp.stdout.on('data', (chunk) => {
      // console.debug('GDB stdout chunk:', chunk.toString())
      this._onData(chunk)
    })
    this.cp.stderr.on('data', (chunk) => {
      // console.debug('GDB stderr chunk:', chunk.toString())
      this._onData(chunk)
    })
  }

  /**
   * @param {string} command
   * @returns {Promise<string>}
   */
  sendCommand(command) {
    // console.log('[GDB MI] ->', command)
    // remember this command for later logging
    // this.pendingCommands.push(command)
    return new Promise((resolve) => {
      this.commandQueue.push(resolve)
      this.cp.stdin.write(`${command}\n`)
    })
  }

  /**
   * @param {Buffer} chunk
   */
  _onData(chunk) {
    // console.log('[GDB MI] <- chunk:', chunk.toString().replace(/\r?\n/g, '\\n'))
    this.stdoutBuffer += chunk.toString()
    // console.log(
    //   '[GDB MI] current buffer:',
    //   this.stdoutBuffer.replace(/\r?\n/g, '\\n')
    // )
    if (this.readyPrompt.test(this.stdoutBuffer)) {
      // console.log(
      //   '[GDB MI] full reply:',
      //   this.stdoutBuffer.replace(/\r?\n/g, '\\n')
      // )
      const output = this.stdoutBuffer
      // match this reply back to the command we sent
      // const cmd = this.pendingCommands.shift()
      // if (cmd !== undefined) {
      //   this.history.push({ command: cmd, reply: output })
      // }
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

  /**
   * Drain initial GDB banner and prompt before issuing MI commands.
   * @returns {Promise<void>}
   */
  async drainHandshake() {
    return new Promise((resolve) => {
      const onData = (/** @type {Buffer} */ chunk) => {
        this.stdoutBuffer += chunk.toString()
        // console.log(
        //   '[GDB MI] handshake chunk:',
        //   chunk.toString().replace(/\r?\n/g, '\\n')
        // )
        if (this.readyPrompt.test(this.stdoutBuffer)) {
          this.cp.stdout.off('data', onData)
          this.stdoutBuffer = ''
          // console.log('Initial GDB prompt seen—handshake drained.')
          resolve()
        }
      }
      this.cp.stdout.on('data', onData)
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
 * Extracts the comma-separated contents of the first matching key=[...] block,
 * properly handling nested brackets.
 * @param {string} str
 * @param {string} key
 * @returns {string|null}
 */
function extractBracketContent(str, key) {
  const keyPattern = key + '=['
  const idx = str.indexOf(keyPattern)
  if (idx < 0) {
    return null
  }
  let start = str.indexOf('[', idx)
  if (start < 0) {
    return null
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
  return null
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
  // console.log(
  //   'GDB MI client started:',
  //   toolPath,
  //   '--interpreter=mi2 -c',
  //   coredumpPath,
  //   elfPath
  // )
  /** @type {ThreadDecodeResult[]} */
  const results = []

  try {
    // Use -thread-info for a more reliable MI listing of threads
    // console.log('Draining initial GDB MI output...')
    await client.drainHandshake()

    // console.log('Initial GDB MI handshake drained')
    const threadsRaw = await client.sendCommand('-thread-info')
    // console.log('Threads raw output (thread-info):', threadsRaw);

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
      // console.log(`Decoding thread ${tid}`)
      await client.sendCommand(`-thread-select ${tid}`)

      const regNamesRaw = await client.sendCommand('-data-list-register-names')
      // console.log('Register names raw output:', regNamesRaw)
      const regNameMatch = regNamesRaw.match(/register-names=\[(.*?)\]/)
      const regNames = regNameMatch
        ? regNameMatch[1]
            .split(',')
            .map((s) => s.trim().replace(/^"|"$/g, ''))
            .map((name, i) => [i.toString(), name])
            .filter(([, name]) => !!name)
        : []
      const regNameMap = Object.fromEntries(regNames)
      // console.log('Register names:', regNameMap)

      const regsOut = await client.sendCommand('-data-list-register-values x')
      // console.log('Registers raw output:', regsOut)
      const parsedRegs = parseRegisters(regsOut)

      const regsAsNamed = Object.fromEntries(
        Object.entries(parsedRegs)
          .map(([num, val]) => [regNameMap[num], Number(val)])
          .filter(([name]) => !!name)
      )
      // console.log(`Registers for thread ${tid}:`, regsAsNamed)

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
      // console.log(`Stack trace for thread ${tid}:`, stacktraceLines)

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
    // console.error('Error during GDB MI interaction:', error)
    throw error
  } finally {
    // console.log('Closing GDB MI client.')
    client.close()
    // Dump full MI command history
    // console.log('GDB MI history:', JSON.stringify(client.history, null, 2))
  }

  return results
}
