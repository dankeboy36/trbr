import { execSync } from 'child_process'
import fs from 'node:fs/promises'

import { addr2line, getRegsInfo } from './add2Line.js'
import { stringifyAddr } from './decode.js'
import { ElfFile, parseElf } from './elf.js'
import { registerSets } from './regs.js'

function parseSummaryNote(buf) {
  const dataLen = buf.readUInt32LE(0)
  // SHA lives immediately after, 16 bytes at 4–19
  const gitSha = buf.toString('ascii', 4, 20).replace(/\0.*$/, '')
  return { dataLen, gitSha }
}

function parseExtraInfo(buf) {
  const tcb = buf.readUInt32LE(0)
  const regsBuf = buf.slice(4)
  return { tcb, regsBuf }
}

function parseTaskNote(buf) {
  const taskIndex = buf.readUInt32LE(0)
  const taskFlags = buf.readUInt32LE(4)
  const taskTcb = buf.readUInt32LE(8)
  const stackStart = buf.readUInt32LE(12)
  const stackLen = buf.readUInt32LE(16)
  const nameBuf = buf.slice(20, 36)
  const taskName = nameBuf.toString('utf8').replace(/\0.*$/, '')
  return { taskIndex, taskFlags, taskTcb, stackStart, stackLen, taskName }
}

function parsePanicDetails(buf) {
  return { raw: buf }
}
/**
 * Parse a COREESP note into a task header.
 */
function parseCoreespTask(buf) {
  const coreId = buf.readUInt32LE(0)
  const tcbAddr = buf.readUInt32LE(24)
  return { coreId, tcbAddr, buf }
}
// Decode an ESP core dump in ELF format and extract panic information.

const elfMagic = 0x464c457f // ELF magic number

/**
 * Heuristically scan a task stack for return addresses, mimicking `esp-coredump` Python logic.
 * @param {Buffer} stackData - Raw stack memory bytes (as a Buffer).
 * @param {number} sp - Current stack pointer (start of valid stack).
 * @param {number} stackStart - Lowest virtual address of stack.
 * @param {number} stackEnd - Highest address (exclusive).
 * @param {function(number): boolean} isValidPC - Function to test if a 32-bit word is a valid PC.
 * @returns {number[]} - Array of guessed PC values (return addresses).
 */
export function analyzeStack(stackData, sp, stackStart, stackEnd, isValidPC) {
  const result = []

  const stackSize = stackEnd - stackStart
  if (stackSize <= 0 || sp < stackStart || sp >= stackEnd) return []

  // Slide back a bit to catch frames saved below SP (common on Xtensa)
  const scanStart = Math.max(stackStart, sp - 32)
  const offsetStart = scanStart - stackStart
  const offsetEnd = stackData.length - 4

  for (let offset = offsetStart; offset <= offsetEnd; offset += 4) {
    const candidate = stackData.readUInt32LE(offset)
    if (!isValidPC(candidate)) continue

    // Avoid repeated values and require alignment
    if (
      result.length === 0 ||
      (result[result.length - 1] !== candidate && candidate % 4 === 0)
    ) {
      result.push(candidate)
    }
  }

  return result
}

/**
 * Simple ESP32 flash-range PC check
 * @param {number} pc
 * @returns {boolean}
 */
export function defaultIsValidPC(pc) {
  return pc >= 0x40000000 && pc <= 0x50000000
}

/**
 * Translate an ESP‑core‑dump virtual address to its offset in the ELF file.
 * Returns `null` if the address does not fall inside any PT_LOAD segment.
 * @param {{type:number,offset:number,size:number,vaddr:number,memsz:number}[]} segments
 * @param {number} addr
 */
function virtToFile(segments, addr) {
  for (const seg of segments) {
    if (seg.type !== 1) continue // PT_LOAD
    if (addr >= seg.vaddr && addr < seg.vaddr + seg.memsz) {
      return seg.offset + (addr - seg.vaddr)
    }
  }
  return null
}

/** @type {import('./decode.js').DecodeCoredumpFunction} */
export async function decodeCoredump(
  { targetArch, toolPath, elfPath },
  coredumpPath,
  _options
) {
  if (process.env.DEBUG_COREDUMP)
    console.log(
      `Decoding coredump: elfPath=${elfPath}, coredumpPath=${coredumpPath}, targetArch=${targetArch}`
    )
  const input = await fs.readFile(coredumpPath)

  const regsInfo = await getRegsInfo({ elfPath, toolPath }, coredumpPath, {})
  if (process.env.DEBUG_COREDUMP) {
    console.log('regsInfo', JSON.stringify(regsInfo))
    console.log('Regs info fetched:', regsInfo)
  }
  // Prepare core dump ELF for task notes and memory segments
  const coreElf = new ElfFile(coredumpPath)

  if (process.env.USE_GDB) {
    if (process.env.DEBUG_COREDUMP) {
      console.debug(
        'Using GDB to generate backtraces for all threads (USE_GDB)'
      )
    }
    const gdbCmd = [
      toolPath,
      '-batch',
      '-ex',
      'set pagination off',
      '-ex',
      `file ${elfPath}`,
      '-ex',
      `core-file ${coredumpPath}`,
      '-ex',
      'thread apply all bt full',
    ].join(' ')
    const btOutput = execSync(gdbCmd, { encoding: 'utf8', shell: true })
    if (process.env.DEBUG_COREDUMP) {
      console.debug('GDB backtrace output:', btOutput)
    }
    return [{ raw: btOutput }]
  } else {
    // --- begin multi‐thread task info parsing ---
    const tasks = []
    for (const noteSeg of coreElf.noteSegments) {
      let off = 0
      const buf = noteSeg.data
      while (off + 12 <= buf.length) {
        const namesz = buf.readUInt32LE(off)
        const descsz = buf.readUInt32LE(off + 4)
        // skip type field at off+8
        const nameStart = off + 12
        const nameEnd = nameStart + namesz
        const name = buf
          .toString('utf8', nameStart, nameEnd)
          .replace(/\0.*$/, '')
        const descStart = nameStart + ((namesz + 3) & ~3)
        if (name === 'TASK_INFO') {
          const noteBuf = buf.slice(descStart, descStart + descsz)
          const info = parseTaskNote(noteBuf)
          tasks.push(info)
        }
        off = descStart + ((descsz + 3) & ~3)
      }
    }
    // if no TASK_INFO notes present, fall back to single‐thread
    if (tasks.length > 0) {
      const results = []
      for (const task of tasks) {
        const { taskTcb, stackStart, stackLen, taskName, taskFlags } = task
        // find the memory segment covering this task's stack
        const seg = coreElf
          .getAllMemorySegments()
          .find(
            (s) =>
              stackStart >= s.addr &&
              stackStart + stackLen <= s.addr + s.data.length
          )
        if (!seg) {
          console.warn(
            `No memory segment covers stack 0x${stackStart.toString(16)}-0x${(
              stackStart + stackLen
            ).toString(16)} for task ${taskName}`
          )
          continue
        }
        const dataOff = stackStart - seg.addr
        const stackBuf = seg.data.slice(dataOff, dataOff + stackLen)
        const retAddrs = analyzeStack(
          stackBuf,
          regsInfo.threadRegs[task.taskTcb].a1,
          stackStart,
          stackStart + stackLen,
          defaultIsValidPC
        )
        const frames = await addr2line({ elfPath, toolPath }, retAddrs)
        console.log(
          `==================== THREAD ${
            task.taskIndex
          } (TCB: 0x${taskTcb.toString(
            16
          )}, name: '${taskName}') =====================`
        )
        frames.forEach((frame, i) => {
          const loc = frame.location ? ` at ${frame.location}` : ''
          console.log(
            `#${i}  0x${frame.addr.toString(16)} in ${
              frame.symbol || '??'
            }${loc}`
          )
        })
        results.push({
          coreId: task.taskIndex,
          tcb: taskTcb,
          name: taskName,
          flags: taskFlags,
          backtrace: frames,
        })
      }
      return results
    }
    // --- end multi‐thread task info parsing ---
    else {
      // --- BEGIN: Multi-thread fallback decoding ---
      const symElf = new ElfFile(elfPath)

      // Determine valid code ranges from the firmware ELF
      const codeRanges = symElf.loadSegments
        .filter((seg) => seg.flags & 4 /* PF_X executable flag */)
        .map((seg) => ({ start: seg.addr, end: seg.addr + seg.data.length }))

      const memory = coreElf.getAllMemorySegments()

      console.debug(
        'Available memory segments for stack analysis:',
        memory.map(({ addr, data }) => ({
          start: `0x${addr.toString(16)}`,
          end: `0x${(addr + data.length).toString(16)}`,
          size: `0x${data.length.toString(16)}`,
        }))
      )

      const results = []

      for (const [tcbAddr, regs] of Object.entries(regsInfo.threadRegs)) {
        if (!regs.a1) continue // skip invalid

        console.debug(`\n=== Decoding thread (TCB: 0x${tcbAddr}) ===`)
        console.debug(
          `PC: 0x${regs.pc.toString(16)}, SP(A1): 0x${regs.a1.toString(16)}`
        )

        // Find memory segment containing this thread's stack pointer
        const segment = memory.find((s) => {
          const start = s.addr
          const end = s.addr + s.data.length
          const window = 0x1000
          return regs.a1 >= start - window && regs.a1 < end + window
        })

        let backtraceAddrsRaw = []
        if (segment) {
          // Heuristic: scan up to 16 KB of stack memory across segments
          const sp = regs.a1
          const maxDepth = 0x4000 // 16 KB
          const scanEnd = sp + maxDepth

          // Gather region buffers from all memory segments
          const sorted = memory.slice().sort((a, b) => a.addr - b.addr)
          const regionBuffers = []
          for (const seg of sorted) {
            const segStart = seg.addr
            const segEnd = seg.addr + seg.data.length
            if (segEnd <= sp) continue
            if (segStart >= scanEnd) break
            const startIdx = Math.max(0, sp - segStart)
            const endIdx = Math.min(seg.data.length, scanEnd - segStart)
            if (endIdx > startIdx) {
              regionBuffers.push(seg.data.slice(startIdx, endIdx))
            }
          }
          const region = Buffer.concat(regionBuffers)

          // Scan for potential return addresses
          const ptrSize = 4
          const seen = new Set()
          for (let i = 0; i + ptrSize <= region.length; i += ptrSize) {
            const addr = region.readUInt32LE(i)
            const aligned = addr % 4 === 0
            const inCode = codeRanges.some(
              (r) => addr >= r.start && addr < r.end
            )

            if (addr !== 0 && aligned && inCode && !seen.has(addr)) {
              seen.add(addr)
              backtraceAddrsRaw.push(addr)
              if (process.env.DEBUG_COREDUMP) {
                console.debug(`Accepted stack address: 0x${addr.toString(16)}`)
              }
            } else if (process.env.DEBUG_COREDUMP) {
              console.debug(
                `Rejected addr 0x${addr.toString(16)} (zero=${
                  addr === 0
                }, aligned=${aligned}, inCode=${inCode}, seen=${seen.has(
                  addr
                )})`
              )
            }
          }
        } else {
          console.warn(
            `No memory segment within ±0x1000 range contains SP=0x${regs.a1.toString(
              16
            )} for thread TCB 0x${tcbAddr}. Skipping stack analysis.`
          )
          continue
        }

        if (backtraceAddrsRaw.length === 0) {
          console.warn(
            'No stack return addresses found in extended stack region.'
          )
        } else {
          console.log(
            `Found ${backtraceAddrsRaw.length} return addresses on stack for thread TCB 0x${tcbAddr}.`
          )
          console.debug(
            'Stack return addresses:',
            backtraceAddrsRaw.map((a) => `0x${a.toString(16)}`)
          )
        }

        const backtraceAddrs = await addr2line(
          { elfPath, toolPath },
          backtraceAddrsRaw.length ? backtraceAddrsRaw : [regs.pc]
        )
        if (backtraceAddrs.length === 0) {
          console.warn('addr2line returned no symbolicated stack frames.')
          backtraceAddrs.push({
            addr: regs.pc,
            symbol: '(no symbol)',
            location: '',
          })
        }

        results.push({
          coreId: results.length,
          tcbAddr,
          programCounter: regs.pc,
          regs,
          backtraceAddrs,
        })
      }

      // console.log(
      //   'Final decoded coredump (all threads) result:',
      //   JSON.stringify(results, null, 2)
      // )
      return results
      // --- END: Multi-thread fallback decoding ---
    }
  }
}

/**
 * Decode a 25‑word Xtensa exception frame starting at `buf`.
 * Returns a regs map or null if PC is outside flash range.
 */
function parseXtensaFrame(buf) {
  if (buf.length < 100) return null
  const dv = new DataView(buf.buffer, buf.byteOffset, 100)
  const tag = dv.getUint32(0, true)
  // For debugging, accept any tag (including tag=0)
  // if (tag === 0) return null
  const pc = dv.getUint32(4, true)
  // PC range check disabled for debugging – accept any PC
  // if (pc < 0x40000000 || pc > 0x50000000) return null

  const regs = { PC: pc, PS: dv.getUint32(8, true) }

  if (tag !== 0) {
    // XT_STK frame (25 words)
    for (let i = 0; i < 16; i++) regs[`A${i}`] = dv.getUint32(12 + i * 4, true)
    regs.SAR = dv.getUint32(76, true)
    regs.EXCCAUSE = dv.getUint32(80, true)
    regs.EXCVADDR = dv.getUint32(84, true)
    regs.LBEG = dv.getUint32(88, true)
    regs.LEND = dv.getUint32(92, true)
    regs.LCOUNT = dv.getUint32(96, true)
    regs.PS &= ~(1 << 4) // clear EXCM bit
  } else {
    // XT_SOL frame
    for (let i = 0; i < 4; i++) regs[`A${i}`] = dv.getUint32(16 + i * 4, true)
  }
  return regs
}
