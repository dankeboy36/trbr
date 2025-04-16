// @ts-check

import net from 'node:net'

import debug from 'debug'
import { FQBN } from 'fqbn'

import { AbortError, neverSignal } from '../abort.js'
import { exec } from '../exec.js'

// Based on the work of:
//  - [Peter Dragun](https://github.com/peterdragun)
//  - [Ivan Grokhotkov](https://github.com/igrr)
//  - [suda-morris](https://github.com/suda-morris)
//
// https://github.com/espressif/esp-idf-monitor/blob/fae383ecf281655abaa5e65433f671e274316d10/esp_idf_monitor/gdb_panic_server.py

/** @typedef {import('./decode.js').DecodeParams} DecodeParams */
/** @typedef {import('./decode.js').DecodeResult} DecodeResult */
/** @typedef {import('./decode.js').DecodeFunction} DecodeFunction */
/** @typedef {import('./decode.js').DecodeOptions} DecodeOptions */
/** @typedef {import('./decode.js').GDBLine} GDBLine */
/** @typedef {import('./decode.js').ParsedGDBLine} ParsedGDBLine */
/** @typedef {import('./decode.js').Debug} Debug */
/** @typedef {import('./decode.js').PanicInfoWithStackData} PanicInfoWithStackData */

const gdbRegsInfoRiscvIlp32 = /** @type {const}*/ ([
  'X0',
  'RA',
  'SP',
  'GP',
  'TP',
  'T0',
  'T1',
  'T2',
  'S0/FP',
  'S1',
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'T3',
  'T4',
  'T5',
  'T6',
  'MEPC', // where execution is happening (PC) and where it resumes after exception (MEPC).
])

const riscTargetArchs = /** @type {const} */ ([
  'esp32c2',
  'esp32c3',
  'esp32c6',
  'esp32h2',
  'esp32h4',
])

/** @typedef {typeof riscTargetArchs[number]} RiscvTargetArch */

/** @type {Record<RiscvTargetArch, DecodeFunction>} */
export const riscvDecoders = /** @type {const}*/ ({
  esp32c2: decodeRiscv,
  esp32c3: decodeRiscv,
  esp32c6: decodeRiscv,
  esp32h2: decodeRiscv,
  esp32h4: decodeRiscv,
})

/** @type {Record<RiscvTargetArch, gdbRegsInfoRiscvIlp32>} */
const gdbRegsInfo = {
  esp32c2: gdbRegsInfoRiscvIlp32,
  esp32c3: gdbRegsInfoRiscvIlp32,
  esp32c6: gdbRegsInfoRiscvIlp32,
  esp32h2: gdbRegsInfoRiscvIlp32,
  esp32h4: gdbRegsInfoRiscvIlp32,
}

/**
 * @param {unknown} arg
 * @returns {arg is RiscvTargetArch}
 */
function isRiscvTarget(arg) {
  return (
    typeof arg === 'string' &&
    riscTargetArchs.includes(/** @type {RiscvTargetArch} */ (arg))
  )
}

/**
 * @template {RiscvTargetArch} T
 * @param {T} type
 */
function createRegNameValidator(type) {
  const regsInfo = gdbRegsInfo[type]
  if (!regsInfo) {
    throw new Error(`Unsupported target: ${type}`)
  }
  /** @type {((regName: unknown)=> regName is gdbRegsInfoRiscvIlp32)} */
  return (regName) =>
    regsInfo.includes(
      /** @type {typeof gdbRegsInfoRiscvIlp32[number]} */ (regName)
    )
}

/**
 * @typedef {Object} RegisterDump
 * @property {number} coreId
 * @property {Record<string,number>} regs
 */

/**
 * @typedef {Object} StackDump
 * @property {number} baseAddr
 * @property {number[]} data
 */

/**
 * @typedef {Object} ParsePanicOutputParams
 * @property {string} input
 * @property {RiscvTargetArch} target
 */

/**
 * @typedef {Object} ParsePanicOutputResult
 * @property {RegisterDump[]} regDumps
 * @property {StackDump[]} stackDump
 * @property {number} [exceptionCause]
 * @property {number} [faultAddr]
 */

/**
 * @param {ParsePanicOutputParams} params
 * @returns {ParsePanicOutputResult}
 */
function parse({ input, target }) {
  const lines = input.split(/\r?\n|\r/)
  /** @type {RegisterDump[]} */
  const regDumps = []
  /** @type {StackDump[]} */
  const stackDump = []
  /** @type {RegisterDump|undefined} */
  let currentRegDump
  let inStackMemory = false
  /** @type {number|undefined} */
  let exceptionCause
  /** @type {number|undefined} */
  let faultAddr

  const regNameValidator = createRegNameValidator(target)

  lines.forEach((line) => {
    if (line.startsWith('Core')) {
      const match = line.match(/^Core\s+(\d+)\s+register dump:/)
      if (match) {
        currentRegDump = {
          coreId: parseInt(match[1], 10),
          regs: {},
        }
        regDumps.push(currentRegDump)
      }
    } else if (currentRegDump && !inStackMemory) {
      const regMatches = line.matchAll(/([A-Z_0-9/]+)\s*:\s*(0x[0-9a-fA-F]+)/g)
      for (const match of regMatches) {
        const regName = match[1]
        const regAddr = parseInt(match[2], 16)
        if (regAddr && regNameValidator(regName)) {
          currentRegDump.regs[regName] = regAddr
        } else if (regName === 'MCAUSE') {
          exceptionCause = regAddr // it's an exception code
        } else if (regName === 'MTVAL') {
          faultAddr = regAddr // EXCVADDR equivalent
        }
      }
      if (line.trim() === 'Stack memory:') {
        inStackMemory = true
      }
    } else if (inStackMemory) {
      const match = line.match(/^([0-9a-fA-F]+):\s*((?:0x[0-9a-fA-F]+\s*)+)/)
      if (match) {
        const baseAddr = parseInt(match[1], 16)
        const data = match[2]
          .trim()
          .split(/\s+/)
          .map((hex) => parseInt(hex, 16))
        stackDump.push({ baseAddr, data })
      }
    }
  })

  return { regDumps, stackDump, exceptionCause, faultAddr }
}

/**
 * @typedef {Object} GetStackAddrAndDataParams
 * @property {StackDump[]}  stackDump
 */

/**
 * @typedef {Object} GetStackAddrAndDataResult
 * @property {number} stackBaseAddr
 * @property {Buffer} stackData
 */

/**
 * @param {GetStackAddrAndDataParams} params
 * @returns {GetStackAddrAndDataResult}
 */
function getStackAddrAndData({ stackDump }) {
  let stackBaseAddr = 0
  let baseAddr = 0
  let bytesInLine = 0
  let stackData = Buffer.alloc(0)

  stackDump.forEach((line) => {
    const prevBaseAddr = baseAddr
    baseAddr = line.baseAddr
    if (stackBaseAddr === 0) {
      stackBaseAddr = baseAddr
    } else {
      if (baseAddr !== prevBaseAddr + bytesInLine) {
        throw new Error('Invalid base address')
      }
    }

    const lineData = Buffer.concat(
      line.data.map((word) =>
        Buffer.from(word.toString(16).padStart(8, '0'), 'hex')
      )
    )
    bytesInLine = lineData.length
    stackData = Buffer.concat([stackData, lineData])
  })

  return { stackBaseAddr, stackData }
}

/**
 * @typedef {Object} ParseIdfRiscvPanicOutputParams
 * @property {string} input
 * @property {RiscvTargetArch} target
 */

/**
 * @param {ParseIdfRiscvPanicOutputParams} params
 * @returns {PanicInfoWithStackData}
 */
function parsePanicOutput({ input, target }) {
  const { regDumps, stackDump, faultAddr, exceptionCause } = parse({
    input,
    target,
  })
  if (regDumps.length === 0) {
    throw new Error('No register dumps found')
  }
  if (regDumps.length > 1) {
    throw new Error('Handling of multi-core register dumps not implemented')
  }

  const { coreId, regs } = regDumps[0]
  const { stackBaseAddr, stackData } = getStackAddrAndData({ stackDump })

  return {
    faultAddr,
    exceptionCause,
    coreId,
    regs,
    stackBaseAddr,
    stackData,
    target,
  }
}

/**
 * @typedef {Object} GdbServerParams
 * @property {PanicInfoWithStackData} panicInfo
 * @property {Debug} [debug]
 */

/**
 * @typedef {Object} StartGdbServerParams
 * @property {AbortSignal} [signal]
 */

export class GdbServer {
  /**
   * @param {GdbServerParams} params
   */
  constructor(params) {
    this.panicInfo = params.panicInfo
    this.regList = gdbRegsInfo[params.panicInfo.target]
    this.debug = params.debug ?? debug('trbr:gdb-server')
  }

  /**
   * @param {StartGdbServerParams} [params]
   * @returns {Promise<net.AddressInfo>}
   */
  async start(params = {}) {
    if (this.server) {
      throw new Error('Server already started')
    }

    const { signal = neverSignal } = params
    const server = net.createServer()
    this.server = server

    await new Promise((resolve, reject) => {
      const abortHandler = () => {
        this.debug('User abort')
        reject(new AbortError())
        this.close()
      }

      if (signal.aborted) {
        abortHandler()
        return
      }

      signal.addEventListener('abort', abortHandler)
      server.on('listening', () => {
        signal.removeEventListener('abort', abortHandler)
        resolve(undefined)
      })
      server.listen(0)
    })

    const address = server.address()
    if (!address) {
      this.close()
      throw new Error('Failed to start server')
    }
    if (typeof address === 'string') {
      this.close()
      throw new Error(
        `Expected an address info object. Got a string: ${address}`
      )
    }

    server.on('connection', (socket) => {
      socket.on('data', (data) => {
        const buffer = data.toString()
        if (buffer.startsWith('-')) {
          this.debug(`Invalid command: ${buffer}`)
          socket.write('-')
          socket.end()
          return
        }

        if (buffer.length > 3 && buffer.slice(-3, -2) === '#') {
          this.debug(`Command: ${buffer}`)
          this._handleCommand(buffer, socket)
        }
      })
    })

    return address
  }

  close() {
    this.server?.close()
    this.server = undefined
  }

  /**
   * @param {string} buffer
   * @param {net.Socket} socket
   */
  _handleCommand(buffer, socket) {
    if (buffer.startsWith('+')) {
      buffer = buffer.slice(1) // ignore the leading '+'
    }

    const command = buffer.slice(1, -3) // ignore checksums
    // Acknowledge the command
    socket.write('+')
    this.debug(`Got command: ${command}`)
    if (command === '?') {
      // report sigtrap as the stop reason; the exact reason doesn't matter for backtracing
      this._respond('T05', socket)
    } else if (command.startsWith('Hg') || command.startsWith('Hc')) {
      // Select thread command
      this._respond('OK', socket)
    } else if (command === 'qfThreadInfo') {
      // Get list of threads.
      // Only one thread for now, can be extended to show one thread for each core,
      // if we dump both cores (e.g. on an interrupt watchdog)
      this._respond('m1', socket)
    } else if (command === 'qC') {
      // That single thread is selected.
      this._respond('QC1', socket)
    } else if (command === 'g') {
      // Registers read
      this._respondRegs(socket)
    } else if (command.startsWith('m')) {
      // Memory read
      const [addr, size] = command
        .slice(1)
        .split(',')
        .map((v) => parseInt(v, 16))
      this._respondMem(addr, size, socket)
    } else if (command.startsWith('vKill') || command === 'k') {
      // Quit
      this._respond('OK', socket)
      socket.end()
    } else {
      // Empty response required for any unknown command
      this._respond('', socket)
    }
  }

  /**
   * @param {string} data
   * @param {net.Socket} socket
   */
  _respond(data, socket) {
    // calculate checksum
    const dataBytes = Buffer.from(data, 'ascii')
    const checksum = dataBytes.reduce((sum, byte) => sum + byte, 0) & 0xff
    // format and write the response
    const res = `$${data}#${checksum.toString(16).padStart(2, '0')}`
    socket.write(res)
    this.debug(`Wrote: ${res}`)
  }

  /**
   * @param {net.Socket} socket
   */
  _respondRegs(socket) {
    let response = ''
    // https://github.com/espressif/esp-idf-monitor/blob/fae383ecf281655abaa5e65433f671e274316d10/esp_idf_monitor/gdb_panic_server.py#L242-L247
    // It loops over the list of register names.
    // For each register name, it gets the register value from panicInfo.regs.
    // It converts the register value to bytes in little-endian byte order.
    // It converts each byte to a hexadecimal string and joins them together.
    // It appends the hexadecimal string to the response string.
    for (const regName of this.regList) {
      const regVal = this.panicInfo.regs[regName] || 0
      const regBytes = Buffer.alloc(4)
      regBytes.writeUInt32LE(regVal)
      const regValHex = regBytes.toString('hex')
      response += regValHex
    }
    this.debug(`Register response: ${response}`)
    this._respond(response, socket)
  }

  /**
   * @param {number} startAddr
   * @param {number} size
   * @param {net.Socket} socket
   */
  _respondMem(startAddr, size, socket) {
    const stackAddrMin = this.panicInfo.stackBaseAddr
    const stackData = this.panicInfo.stackData
    const stackLen = stackData.length
    const stackAddrMax = stackAddrMin + stackLen

    const inStack = (/** @type {number} */ addr) =>
      stackAddrMin <= addr && addr < stackAddrMax

    let result = ''
    for (let addr = startAddr; addr < startAddr + size; addr++) {
      if (!inStack(addr)) {
        result += '00'
      } else {
        result += stackData[addr - stackAddrMin].toString(16).padStart(2, '0')
      }
    }

    this._respond(result, socket)
  }
}

const exceptions = [
  { code: 0x0, description: 'Instruction address misaligned' },
  { code: 0x1, description: 'Instruction access fault' },
  { code: 0x2, description: 'Illegal instruction' },
  { code: 0x3, description: 'Breakpoint' },
  { code: 0x4, description: 'Load address misaligned' },
  { code: 0x5, description: 'Load access fault' },
  { code: 0x6, description: 'Store/AMO address misaligned' },
  { code: 0x7, description: 'Store/AMO access fault' },
  { code: 0x8, description: 'Environment call from U-mode' },
  { code: 0x9, description: 'Environment call from S-mode' },
  { code: 0xb, description: 'Environment call from M-mode' },
  { code: 0xc, description: 'Instruction page fault' },
  { code: 0xd, description: 'Load page fault' },
  { code: 0xf, description: 'Store/AMO page fault' },
]

/**
 * @typedef {FQBN & { boardId: RiscvTargetArch }} RiscvFQBN
 */

/**
 * @param {FQBN} fqbn
 * @returns {fqbn is RiscvFQBN}
 */
export function isRiscvFQBN(fqbn) {
  return isRiscvTarget(fqbn.boardId)
}

/**
 * @param {string} elfPath
 * @param {number} port
 * @returns {string[]}
 */
function buildPanicServerArgs(elfPath, port) {
  return [
    '--batch',
    '-n',
    elfPath,
    // '-ex', // executes a command
    // `set remotetimeout ${debug ? 300 : 2}`, // Set the timeout limit to wait for the remote target to respond to num seconds. The default is 2 seconds. (https://sourceware.org/gdb/current/onlinedocs/gdb.html/Remote-Configuration.html)
    '-ex',
    `target remote :${port}`, // https://sourceware.org/gdb/current/onlinedocs/gdb.html/Server.html#Server
    '-ex',
    'bt',
  ]
}

/**
 * @param {DecodeParams} params
 * @param {PanicInfoWithStackData} panicInfo
 * @param {DecodeOptions} options
 * @returns {Promise<string>}
 */
async function processPanicOutput(params, panicInfo, options) {
  const { elfPath, toolPath } = params
  let server
  try {
    const { signal, debug } = options
    const gdbServer = new GdbServer({ panicInfo, debug })
    const { port } = await gdbServer.start({ signal })
    server = gdbServer

    const args = buildPanicServerArgs(elfPath, port)
    const { stdout } = await exec(toolPath, args, { signal })

    return stdout
  } finally {
    server?.close()
  }
}

/**
 * @param {number} number
 * @returns {string}
 */
function toHexString(number) {
  return `0x${number.toString(16).padStart(8, '0')}`
}

/**
 * @param {string} stdout
 * @returns {(GDBLine|ParsedGDBLine)[]}
 */
function parseGDBOutput(stdout) {
  /** @type {(GDBLine|ParsedGDBLine)[]} */
  const gdbLines = []
  const regex = /^#\d+\s+([\w:~<>]+)\s*\(([^)]*)\)\s*(?:at\s+([\S]+):(\d+))?/

  for (const line of stdout.split(/\r?\n|\r/)) {
    const match = regex.exec(line)
    if (match) {
      const method = match[1]
      const rawArgs = match[2]
      const file = match[3]
      const lineNumber = match[4]

      gdbLines.push({
        method,
        address: rawArgs || '??', // Could be a memory address if not a method
        file,
        lineNumber,
      })
    } else {
      // Try fallback for addresses without function names
      const fallbackRegex = /^#\d+\s+0x([0-9a-fA-F]+)\s*in\s+(\?\?)/
      const fallbackMatch = fallbackRegex.exec(line)
      if (fallbackMatch) {
        gdbLines.push({
          address: `0x${fallbackMatch[1]}`,
          lineNumber: '??',
        })
      }
    }
  }
  return gdbLines
}

/**
 * @param {PanicInfoWithStackData} panicInfo
 * @param {string} stdout
 * @returns {DecodeResult}
 */
function createDecodeResult(panicInfo, stdout) {
  const exception = exceptions.find((e) => e.code === panicInfo.exceptionCause)

  /** @type {Record<string, string>} */
  const registerLocations = Object.entries(panicInfo.regs).reduce(
    (acc, [regName, regValue]) => {
      acc[regName] = toHexString(regValue)
      return acc
    },
    {}
  )

  const stacktraceLines = parseGDBOutput(stdout)

  return {
    exception: exception ? [exception.description, exception.code] : undefined,
    allocLocation: undefined,
    registerLocations,
    stacktraceLines,
  }
}

/** @type {import('./decode.js').DecodeFunction} */
export async function decodeRiscv(params, input, options) {
  const target = params.targetArch
  if (!isRiscvTarget(target)) {
    throw new Error(`Unsupported target: ${target}`)
  }
  options.debug?.(`Decoding for target: ${target}`)
  options.debug?.(`Input: ${input}`)

  const panicInfo = parsePanicOutput({
    input,
    target,
  })
  options.debug?.(`Parsed panic info: ${JSON.stringify(panicInfo)}`)

  const stdout = await processPanicOutput(params, panicInfo, options)
  options.debug?.(`GDB output: ${stdout}`)
  const decodeResult = createDecodeResult(panicInfo, stdout)
  options.debug?.(`Decode result: ${JSON.stringify(decodeResult)}`)
  return decodeResult
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  createRegNameValidator,
  isTarget: isRiscvTarget,
  parsePanicOutput,
  buildPanicServerArgs,
  processPanicOutput,
  toHexString,
  parseGDBOutput,
  getStackAddrAndData,
  gdbRegsInfoRiscvIlp32,
  gdbRegsInfo,
  createDecodeResult,
})
