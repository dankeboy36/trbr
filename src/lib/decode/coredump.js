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

import fs from 'node:fs/promises'

import { addr2line, getRegsInfo } from './add2Line.js'
import { stringifyAddr } from './decode.js'
import { ELF, parseElf } from './elf.js'

import { registerSets } from './regs.js'

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
  // Some FreeRTOS save‑area implementations store the exit/exception frame
  // 16 bytes *below* the recorded SP (A1).  Slide back by up to 32 bytes
  // to catch that pattern first.
  if (sp - 32 >= stackStart) sp -= 16
  const stackSize = stackEnd - stackStart
  if (stackSize <= 0 || sp < stackStart || sp >= stackEnd) return []

  // Translate SP to offset into buffer
  let offset = sp - stackStart
  offset = Math.max(0, Math.min(offset, stackData.length - 4))

  for (; offset + 4 <= stackData.length; offset += 4) {
    const candidate = stackData.readUInt32LE(offset)
    if (isValidPC(candidate)) {
      // Filter out back‑to‑back repeats and obvious literals
      if (
        result.length === 0 ||
        (result[result.length - 1] !== candidate && candidate % 4 === 0)
      ) {
        result.push(candidate)
      }
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

  const elfFile = parseElf(elfPath)
  if (process.env.DEBUG_COREDUMP) {
    console.log('elfFile', JSON.stringify(elfFile, null, 2))
  }

  let isElf = input.readUInt32LE(0) === elfMagic
  if (!isElf) {
    for (let offset = 4; offset <= 64; offset += 4) {
      if (input.readUInt32LE(offset) === elfMagic) {
        isElf = true
        break
      }
    }
  }

  if (!isElf) {
    throw new Error(
      'Only ESP Core Dump ELF files are supported. Please ensure CONFIG_ESP_COREDUMP_DATA_FORMAT is set to CONFIG_ESP_COREDUMP_DATA_FORMAT_ELF in your project configuration.'
    )
  }

  if (process.env.DEBUG_COREDUMP) {
    console.debug('Parsing coredump ELF headers for program segments')
  }
  const { programHeaders: rawPhdrs } = parseElf(coredumpPath)
  const programHeaders = rawPhdrs.map((ph) => ({
    type: ph.p_type,
    offset: ph.p_offset,
    size: ph.p_filesz,
    vaddr: ph.p_vaddr,
    memsz: ph.p_memsz,
  }))
  if (process.env.DEBUG_COREDUMP) {
    console.debug(
      'Program headers parsed from coredump ELF:',
      JSON.stringify(programHeaders, null, 2)
    )
  }

  const notes = programHeaders
    .filter((ph) => ph.type === 4)
    .flatMap((ph) => {
      const buffer = input.slice(ph.offset, ph.offset + ph.size)
      const result = []
      let cursor = 0
      while (cursor + 12 <= buffer.length) {
        const namesz = buffer.readUInt32LE(cursor)
        const descsz = buffer.readUInt32LE(cursor + 4)
        const type = buffer.readUInt32LE(cursor + 8)
        const name = buffer
          .toString('ascii', cursor + 12, cursor + 12 + namesz)
          .replace(/\0/g, '')
        const descOffset = cursor + 12 + ((namesz + 3) & ~3)
        const desc = buffer.slice(descOffset, descOffset + descsz)
        result.push({ name, desc, type })
        console.debug('Decoding CORE note:', {
          name,
          type,
          descLength: desc.length,
          snippet: desc.slice(0, 16).toString('hex'),
        })
        cursor = Math.ceil((descOffset + descsz) / 4) * 4
      }
      return result
    })
  if (process.env.DEBUG_COREDUMP) {
    console.log(`Parsed CORE notes: count=${notes.length}`, notes)
  }

  let summary = null
  const extraInfos = []
  const taskInfos = []
  const panicDetails = []

  for (const note of notes) {
    switch (note.name) {
      case 'ESP_CORE_DUMP_INFOE':
        summary = parseSummaryNote(note.desc)
        break
      case 'EXTRA_INFOe':
        extraInfos.push(parseExtraInfo(note.desc))
        break
      case 'ESP_CORE_DUMP_TASK_INFO':
        taskInfos.push(parseTaskNote(note.desc))
        break
      case 'COREESP':
        taskInfos.push(parseCoreespTask(note.desc))
        break
      case 'ESP_CORE_DUMP_PANIC_DETAILS':
        panicDetails.push(parsePanicDetails(note.desc))
        break
      default:
        if (process.env.DEBUG_COREDUMP)
          console.debug('Unknown note:', note.name)
    }
  }

  if (process.env.DEBUG_COREDUMP) {
    console.debug('Parsed summary:', summary)
    console.debug('Parsed extra-info entries:', extraInfos)
    console.debug('Parsed task-info entries:', taskInfos)
    console.debug('Parsed panic-details entries:', panicDetails)
  }

  const regNames = registerSets[targetArch] ?? registerSets.xtensa
  /** @type {import('./decode.js').PanicInfo|undefined} */
  let crashed

  // Mark crashed task via extraInfos
  const crashedTcbFromExtra = extraInfos[0]?.tcb

  let candidateNotes = []

  if (process.env.DEBUG_COREDUMP) {
    console.log('Beginning to process CORE notes for panic extraction...')
  }
  // Instead of iterating notes, use taskInfos (which now includes COREESP and ESP_CORE_DUMP_TASK_INFO)
  for (const taskInfo of taskInfos) {
    // If taskInfo is from parseCoreespTask
    let coreId = typeof taskInfo.coreId === 'number' ? taskInfo.coreId : 0
    let regs = {}
    let tcbAddr = null
    let buf = taskInfo.buf || null
    // For parseCoreespTask, buf is present; for parseTaskNote, other fields exist
    if (buf) {
      // Use same logic as before for COREESP notes
      const regBase = 0x48
      for (let i = 0; i < regNames.length; i++) {
        const offset = regBase + i * 4
        if (offset + 4 > buf.length) break
        regs[regNames[i]] = buf.readUInt32LE(offset)
      }
      // Try to locate TCB address in buffer
      for (let off = 0; off + 4 <= buf.length; off += 4) {
        const candidate = buf.readUInt32LE(off)
        if (regsInfo.threadRegs.hasOwnProperty(candidate)) {
          tcbAddr = candidate
          if (process.env.DEBUG_COREDUMP) {
            console.log(
              `[merge] found matching TCB at desc offset 0x${off.toString(
                16
              )}: 0x${candidate.toString(16)}`
            )
          }
          break
        }
      }
      // Merge GDB regs
      if (tcbAddr != null) {
        const gdbRegs = regsInfo.threadRegs[tcbAddr]
        if (gdbRegs) {
          for (const [name, val] of Object.entries(gdbRegs)) {
            regs[name.toUpperCase()] = val
          }
          if (process.env.DEBUG_COREDUMP) {
            console.log(
              `[merge] injected GDB regs for thread TCB=0x${tcbAddr.toString(
                16
              )}`
            )
          }
        } else if (tcbAddr === regsInfo.currentThreadAddr) {
          for (const [k, v] of Object.entries(regsInfo.regs)) {
            regs[k.toUpperCase()] = v
          }
          if (process.env.DEBUG_COREDUMP) {
            console.log(
              `[merge] injected legacy regs for current thread TCB=0x${tcbAddr.toString(
                16
              )}`
            )
          }
        }
      } else {
        if (process.env.DEBUG_COREDUMP) {
          console.warn(`[merge] no matching GDB regs found for any desc value`)
        }
      }
      // Merge extra-info (EXTRA_INFOe) regs for the crashed task
      // (summary.crashedTcb is deprecated; rely on extraInfos elsewhere)
      // Frame decode at SP (A1)
      if (regs.A1) {
        const stackStart = buf.readUInt32LE(0x0c)
        const stackEnd = buf.readUInt32LE(0x10)
        let frameBuf = null
        for (const delta of [0, -16, -32, -48, -64]) {
          const candidateSp = regs.A1 + delta
          if (
            candidateSp >= stackStart &&
            candidateSp + 100 <= stackEnd &&
            !frameBuf
          ) {
            const off = candidateSp - stackStart
            if (off >= 0 && off + 100 <= buf.length) {
              frameBuf = buf.subarray(off, off + 100)
              if (process.env.DEBUG_COREDUMP) {
                console.log(
                  `[xt-frame] note frame @0x${candidateSp.toString(
                    16
                  )} Δ${delta}`
                )
              }
            }
          }
          if (!frameBuf) {
            const spFile = virtToFile(programHeaders, candidateSp)
            if (spFile !== null) {
              frameBuf = input.subarray(spFile, spFile + 100)
              if (process.env.DEBUG_COREDUMP) {
                console.log(
                  `[xt-frame] PT_LOAD frame @0x${candidateSp.toString(
                    16
                  )} Δ${delta}`
                )
              }
            }
          }
          if (frameBuf) break
        }
        if (frameBuf) {
          const fr = parseXtensaFrame(frameBuf)
          if (fr) {
            for (const [k, v] of Object.entries(fr)) {
              if (!regs[k] || regs[k] === 0) regs[k] = v
            }
            if (process.env.DEBUG_COREDUMP) {
              console.log(
                `[xt-frame] merged frame regs for SP 0x${regs.A1.toString(16)}`
              )
            }
          } else if (process.env.DEBUG_COREDUMP) {
            console.warn(
              `[xt-frame] no valid frame at SP 0x${regs.A1.toString(16)}`
            )
          }
        }
      }
    } else {
      // parseTaskNote: not from COREESP
      // Use whatever fields are available
      regs = {}
      tcbAddr = taskInfo.taskTcb || null
      // No buffer available for further decode
    }
    let pc = 0
    if (regs.PC) {
      pc = regs.PC
      console.debug('PC found directly:', pc.toString(16))
    } else if (regs.A0) {
      pc = regs.A0
      console.debug('PC fallback to A0:', pc.toString(16))
      regs.PC = pc
    } else {
      console.debug('PC not found in regs:', Object.keys(regs))
    }
    const faultCode = regs.EXCCAUSE ?? 0
    console.debug(
      `Found CORE note | Core: ${coreId} | PC: 0x${pc.toString(
        16
      )} | EXCCAUSE: ${faultCode}`
    )
    console.debug(
      `Decoded regs for CORE ${coreId}:`,
      JSON.stringify(regs, null, 2)
    )
    // Stack scan via PT_LOAD segment containing SP (A1)
    let guessedAddrs = []
    const sp = regs.A1
    if (sp) {
      const loadSegs = programHeaders.filter((ph) => ph.type === 1)
      const seg = loadSegs.find((s) => sp >= s.vaddr && sp < s.vaddr + s.memsz)
      if (seg) {
        const stackStart = seg.vaddr
        const stackEnd = seg.vaddr + seg.memsz
        const memOff = virtToFile(programHeaders, stackStart)
        if (memOff !== null) {
          const stackBuf = input.subarray(memOff, memOff + seg.memsz)
          guessedAddrs = analyzeStack(
            stackBuf,
            sp,
            stackStart,
            stackEnd,
            defaultIsValidPC
          )
        }
      } else if (process.env.DEBUG_COREDUMP) {
        console.warn(`[scan] no load segment for SP 0x${sp.toString(16)}`)
      }
    }
    candidateNotes.push({
      note: { name: 'COREESP', desc: buf },
      coreId,
      regs,
      pc,
      faultCode,
      guessedAddrs,
      tcbAddr,
    })
    if (process.env.DEBUG_COREDUMP) {
      console.log('Added candidate note:', { coreId, pc, faultCode, regs })
    }
  }

  candidateNotes = candidateNotes.filter(({ pc }) => pc !== 0)
  if (process.env.DEBUG_COREDUMP) {
    console.log('Filtered candidate notes (pc !== 0):', candidateNotes)
  }

  /** @type {import('./decode.js').PanicInfoWithBacktrace[]} */
  const panicInfos = await Promise.all(
    candidateNotes.map(
      async ({ coreId, regs, faultCode, guessedAddrs, tcbAddr }) => {
        const faultAddr = regs.EXCVADDR ?? 0
        const pc = regs.PC ?? 0

        // Only use the crash PC and optional A0 as initial backtrace addresses,
        // plus any guessed return addresses from stack scanning.
        const addrs = [regs.PC, regs.A0, ...(guessedAddrs ?? [])]
          .filter(
            (val) =>
              typeof val === 'number' && val >= 0x40000000 && val <= 0x50000000
          )
          .filter((addr, i, self) => addr && self.indexOf(addr) === i)

        const lines = await addr2line({ elfPath, toolPath }, addrs)

        const isCrashed = tcbAddr === crashedTcbFromExtra

        return {
          coreId,
          tcbAddr, // include TCB address in panicInfos
          programCounter: pc,
          faultAddr,
          faultCode,
          regs,
          isCrashed,
          backtraceAddrs: lines,
        }
      }
    )
  )
  if (process.env.DEBUG_COREDUMP) {
    console.log('Initial panicInfos:', JSON.stringify(panicInfos))
  }

  // Remove one-off XTensa stack walk and output

  const allAddrs = panicInfos.flatMap((p) =>
    p.backtraceAddrs.map((b) => b.addr)
  )
  if (process.env.DEBUG_COREDUMP) {
    console.log('All addresses to resolve:', allAddrs)
  }
  const addLines = await addr2line({ toolPath, elfPath }, allAddrs)
  // console.log('Address to location mapping:', addLines)

  // console.log('done')
  // console.log('----------------------')
  // const padding = String(addLines.length - 1).length
  // console.log(
  //   addLines
  //     .map((line) => line.location)
  //     .map(stringifyAddr)
  //     .map(
  //       (line, index) => `#${index.toString().padStart(padding, ' ')} ${line}`
  //     )
  //     .join('\n')
  // )
  // console.log('----------------------')

  // console.log(regsInfoStdout)

  // if (regsInfoStdout?.includes('#0')) {
  //   const parsed = parseGDBOutputToPanicInfo(regsInfoStdout)
  //   return [parsed]
  // }

  // Map addresses to location objects
  const addrLocationMap = new Map()
  for (const { addr, location } of addLines) {
    addrLocationMap.set(addr, location)
  }

  // Replace raw addresses in panicInfos with { addr, location } objects
  panicInfos.forEach((info) => {
    info.backtraceAddrs = info.backtraceAddrs.map(({ addr }) => ({
      addr,
      location: addrLocationMap.get(addr) ?? `0x${addr.toString(16)}`,
    }))
  })
  if (process.env.DEBUG_COREDUMP) {
    console.log(
      'Panic infos with resolved locations:',
      JSON.stringify(panicInfos)
    )
  }

  // Per-task XTensa stack scan for each task with varied offsets, using virtToFile mapping
  if (targetArch === 'xtensa') {
    if (process.env.DEBUG_COREDUMP) {
      console.debug(
        'Performing xtensa stack scan for each task with varied offsets'
      )
    }
    const deltas = [0, -16, -32, -48, -64, -80, -96, -112, -128]
    for (const panicInfo of panicInfos) {
      const sp = panicInfo.regs.A1
      const tcb = panicInfo.tcbAddr
      if (!sp) continue
      if (process.env.DEBUG_COREDUMP) {
        console.debug(
          `Task TCB=0x${(tcb || 0).toString(16)} base SP=0x${sp.toString(16)}`
        )
      }
      for (const delta of deltas) {
        const startSp = sp + delta
        if (process.env.DEBUG_COREDUMP) {
          console.debug(
            `Trying SP offset ${delta}: VA=0x${startSp.toString(16)}`
          )
        }
        let curSp = startSp
        const visited = new Set()
        const foundAddrs = []
        for (let i = 0; i < 16; i++) {
          const fileOff = virtToFile(programHeaders, curSp)
          if (fileOff === null || fileOff + 4 > input.length) break
          const word = input.readUInt32LE(fileOff)
          if (word >= 0x40000000 && word <= 0x50000000 && !visited.has(word)) {
            foundAddrs.push(word)
            visited.add(word)
          }
          const nextSpOff = virtToFile(programHeaders, curSp + 4)
          if (nextSpOff !== null) {
            const nextSp = input.readUInt32LE(nextSpOff)
            if (nextSp > curSp && nextSp < Number.MAX_SAFE_INTEGER) {
              curSp = nextSp
              continue
            }
          }
          break
        }
        if (process.env.DEBUG_COREDUMP) {
          console.debug(`Offset ${delta} found addresses:`, foundAddrs)
        }
      }
    }
  }

  // const current = candidateNotes[0]
  // if (current) {
  //   console.log(
  //     '\n==================== CURRENT THREAD STACK ====================='
  //   )
  //   console.log(
  //     `#0  0x${current.pc.toString(16)} in ${
  //       current.regs.PC ? 'setup()' : '??'
  //     } (A1: 0x${(current.regs.A1 || 0).toString(16)})`
  //   )
  //   if (current.regs.A0) {
  //     console.log(`#1  0x${current.regs.A0.toString(16)} in loopTask()`)
  //   }
  // }

  // for (const panicInfo of panicInfos) {
  //   // console.log(`\nBacktrace for core ${panicInfo.coreId}:`)
  //   panicInfo.backtraceAddrs.forEach((entry, index) => {
  //     const addrStr = `0x${entry.addr.addr.toString(16)}`
  //     const loc = entry.addr.location
  //     // if (typeof loc === 'object') {
  //     //   console.log(
  //     //     `#${index}  ${addrStr} in ${loc.method} at ${loc.file}:${loc.lineNumber}`
  //     //   )
  //     // } else {
  //     //   console.log(`#${index}  ${addrStr} in ?? ()`)
  //     // }
  //   })
  // }

  if (process.env.DEBUG_COREDUMP) {
    console.log('decodeCoredump completed, returning panicInfos.')
  }
  return await Promise.all(panicInfos)
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
