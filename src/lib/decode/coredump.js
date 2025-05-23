// Decode an ESP core dump in ELF format and extract panic information.

import fs from 'node:fs/promises'

import { addr2line, getRegsInfo } from './add2Line.js'
import { stringifyAddr } from './decode.js'
import { ELF } from './elf.js'
import { analyzeStack, defaultIsValidPC } from './esp_stack_bt_guess.js'
import { registerSets } from './regs.js'

const elfMagic = 0x464c457f // ELF magic number

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

  let elfOffset = 0
  let isElf = input.readUInt32LE(0) === elfMagic
  if (!isElf) {
    for (let offset = 4; offset <= 64; offset += 4) {
      if (input.readUInt32LE(offset) === elfMagic) {
        elfOffset = offset
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

  const phoff = input.readUInt32LE(elfOffset + 28)
  const phentsize = input.readUInt16LE(elfOffset + 42)
  const phnum = input.readUInt16LE(elfOffset + 44)

  console.debug('PHOFF:', phoff, 'PHENTSIZE:', phentsize, 'PHNUM:', phnum)
  const programHeaders = []
  for (let i = 0; i < phnum; i++) {
    const offset = elfOffset + phoff + i * phentsize
    const type = input.readUInt32LE(offset + 0)
    const poffset = input.readUInt32LE(offset + 4)
    const vaddr = input.readUInt32LE(offset + 8)
    /* p_paddr not needed */
    const filesz = input.readUInt32LE(offset + 16)
    const memsz = input.readUInt32LE(offset + 20)
    programHeaders.push({ type, offset: poffset, size: filesz, vaddr, memsz })
    console.debug('Program Header:', {
      type,
      offset: poffset,
      size: filesz,
      vaddr,
      memsz,
    })
  }
  if (process.env.DEBUG_COREDUMP)
    console.log('Program headers parsed:', programHeaders)

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
  console.log(`Parsed CORE notes: count=${notes.length}`, notes)

  const regNames = registerSets[targetArch] ?? registerSets.xtensa
  /** @type {import('./decode.js').PanicInfo|undefined} */
  let crashed

  let candidateNotes = []

  console.log('Beginning to process CORE notes for panic extraction...')
  for (const note of notes) {
    console.log(
      `Processing note: name=${note.name}, type=${note.type}, descLength=${note.desc.length}`
    )
    if (!note.name.startsWith('CORE') || note.desc.length < 16) {
      continue
    }

    const coreId = note.desc.readUInt32LE(0)
    /** @type {Record<string,number>} */
    const regs = {}
    // Task header (0x18) + 0x30 bytes of extra metadata → regs start at 0x48
    const regBase = 0x48
    for (let i = 0; i < regNames.length; i++) {
      const offset = regBase + i * 4
      if (offset + 4 > note.desc.length) {
        break
      }
      regs[regNames[i]] = note.desc.readUInt32LE(offset)
    }
    /* ── Extend regs with the task's saved Xtensa frame ── */
    try {
      // Dynamically locate the task’s TCB pointer by scanning note.desc for a value that matches a GDB thread address
      let tcbAddr = null
      for (let off = 0; off + 4 <= note.desc.length; off += 4) {
        const candidate = note.desc.readUInt32LE(off)
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
      // Only run merge logic if tcbAddr was found
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
          // fallback to legacy `.regs`
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
      // Enhanced stack frame recovery: scan stack for valid frame like espcoredump.py
      const stackStart = note.desc.readUInt32LE(0x04)
      const stackEnd = note.desc.readUInt32LE(0x08)
      const stackLen = stackEnd - stackStart

      // Define exception frame register layout and size dynamically
      const frameRegs = [
        'PC',
        'PS',
        'LBEG',
        'LEND',
        'LCOUNT',
        'SAR',
        'A0',
        'A1',
        'A2',
        'A3',
        'A4',
        'A5',
        'A6',
        'A7',
        'A8',
        'A9',
        'A10',
        'A11',
        'A12',
        'A13',
        'A14',
        'A15',
        'EXCCAUSE',
        'EXCVADDR',
        'WINDOWBASE',
        'WINDOWSTART',
      ]
      const frameSize = frameRegs.length * 4

      let bestFrameOff = null
      let bestFrame = null

      for (let offset = 0; offset + frameSize <= stackLen; offset += 4) {
        const virt = stackStart + offset
        const fileOff = virtToFile(programHeaders, virt)
        if (fileOff === null) continue

        const pc = input.readUInt32LE(fileOff + 0)
        // Only require PC to be within executable range
        const isValidPC = pc >= 0x40000000 && pc <= 0x50000000
        if (!isValidPC) continue

        const frame = {}
        for (let i = 0; i < frameRegs.length; i++) {
          frame[frameRegs[i]] = input.readUInt32LE(fileOff + i * 4)
        }
        bestFrameOff = fileOff
        bestFrame = frame
        break // first valid frame
      }

      if (bestFrame) {
        for (const [k, v] of Object.entries(bestFrame)) {
          regs[k] = v
        }
        // Use recovered PC and A1 if the original values were missing or invalid
        if (!regs.A1 || regs.A1 === 0) {
          regs.A1 = bestFrame.A1
        }
        if (!regs.PC || regs.PC === 0) {
          regs.PC = bestFrame.PC
        }
        if (process.env.DEBUG_COREDUMP) {
          console.log(
            '[frame-scan] valid frame found @',
            bestFrameOff.toString(16),
            {
              PC: `0x${regs.PC.toString(16)}`,
              A1: `0x${regs.A1.toString(16)}`,
            }
          )
          console.log('[frame-scan] using recovered PC and A1', {
            PC: `0x${regs.PC.toString(16)}`,
            A1: `0x${regs.A1.toString(16)}`,
          })
        }
      } else {
        if (process.env.DEBUG_COREDUMP) {
          console.warn('[frame-scan] no valid frame found in task stack')
        }
      }
    } catch (e) {
      if (process.env.DEBUG_COREDUMP) {
        console.warn('[frame] failed to recover regs:', e)
      }
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

    const stackCandidates = []
    for (let i = 0; i < note.desc.length - 4; i += 4) {
      const word = note.desc.readUInt32LE(i)
      if (word >= 0x40000000 && word <= 0x50000000) {
        stackCandidates.push({ offset: i, word })
      }
    }
    const uniqueAddrs = new Set([
      pc,
      ...Object.values(regs),
      ...stackCandidates.map((w) => w.word),
    ])
    const addresses = Array.from(uniqueAddrs)

    // Fallback: guess stack return addresses using analyzeStack
    const guessedAddrs = []
    try {
      const stackStart = note.desc.readUInt32LE(0x04)
      const stackEnd = note.desc.readUInt32LE(0x08)
      const stackLen = stackEnd - stackStart
      const sp = regs.A1 ?? 0
      const memOff = virtToFile(programHeaders, stackStart)
      if (memOff !== null && stackLen > 0) {
        const stackBuf = input.subarray(memOff, memOff + stackLen)
        guessedAddrs.push(
          ...analyzeStack(stackBuf, sp, stackStart, stackEnd, defaultIsValidPC)
        )
      }
    } catch (e) {
      if (process.env.DEBUG_COREDUMP) {
        console.warn('[guess] Failed to scan stack:', e)
      }
    }

    // console.log(
    //   `Resolving ${addresses.length} memory addresses:`,
    //   addresses.map((addr) => `0x${addr.toString(16)}`)
    // )
    const lines = await addr2line({ elfPath, toolPath }, addresses)

    // console.log('Stack word candidates:')
    // for (const { offset, word } of stackCandidates) {
    //   const decoded = lines.find((l) => l.addr === word)
    //   const lineStr =
    //     decoded && typeof decoded.location === 'object'
    //       ? `${decoded.location.method} at ${decoded.location.file}:${decoded.location.lineNumber}`
    //       : '??'
    //   console.log(
    //     `[0x${offset.toString(16).padStart(4, '0')}] 0x${word.toString(
    //       16
    //     )} → ${lineStr}`
    //   )
    // }

    const padding = String(lines.length - 1).length
    // console.log('Resolved addresses:')
    lines.forEach((line, index) => {
      const info = stringifyAddr(line.location)
      // console.log(`#${index.toString().padStart(padding, ' ')} ${info}`)
      // console.log(`  └── addr: 0x${line.addr.toString(16)}`)
      // if (typeof line.location === 'object') {
      //   console.log(
      //     `      function: ${line.location.method}\n      file: ${line.location.file}:${line.location.lineNumber}`
      //   )
      // }
    })

    // console.log('Full raw add2line_v2 output:')
    console.dir(lines, { depth: null })
    // Summarize unique frames after resolved addresses
    const frameSummary = {}
    for (const line of lines) {
      const loc = line.location
      if (typeof loc === 'object' && loc.method && loc.file && loc.lineNumber) {
        const key = `${loc.method}|${loc.file}|${loc.lineNumber}`
        if (!frameSummary[key]) {
          frameSummary[key] = {
            addr: `0x${line.addr.toString(16)}`,
            method: loc.method,
            file: loc.file,
            line: loc.lineNumber,
            count: 1,
          }
        } else {
          frameSummary[key].count++
        }
      }
    }
    // console.log('Decoded Summary:', Object.values(frameSummary))

    const unresolved = lines.filter((line) => line.location === '??')
    if (unresolved.length > 0) {
      console.warn(
        `Warning: ${unresolved.length} addresses could not be resolved.`
      )
      unresolved.forEach((u) =>
        console.warn(`  Unresolved: 0x${u.addr.toString(16)}`)
      )
    }

    // console.log('----------------------')

    candidateNotes.push({ note, coreId, regs, pc, faultCode, guessedAddrs })
    console.log('Added candidate note:', { coreId, pc, faultCode, regs })
  }

  candidateNotes = candidateNotes.filter(({ pc }) => pc !== 0)
  console.log('Filtered candidate notes (pc !== 0):', candidateNotes)

  /** @type {import('./decode.js').PanicInfoWithBacktrace[]} */
  const panicInfos = await Promise.all(
    candidateNotes.map(async ({ coreId, regs, faultCode, guessedAddrs }) => {
      const faultAddr = regs.EXCVADDR ?? 0
      const pc = regs.PC ?? 0

      // Collect potential backtrace addresses (merge regs and guessedAddrs)
      const addrs = [...Object.values(regs), ...(guessedAddrs ?? [])]
        .filter(
          (val) =>
            typeof val === 'number' && val >= 0x40000000 && val <= 0x50000000
        )
        .filter((addr, i, self) => addr !== 0 && self.indexOf(addr) === i)

      const lines = await addr2line({ elfPath, toolPath }, addrs)

      // Merge guessed addresses into backtraceAddrs if not already present and in valid range
      return {
        coreId,
        programCounter: pc,
        faultAddr,
        faultCode,
        regs,
        backtraceAddrs: [
          ...lines,
          ...(guessedAddrs ?? [])
            .filter(
              (addr, i, self) =>
                typeof addr === 'number' &&
                addr >= 0x40000000 &&
                addr <= 0x50000000 &&
                !lines.some((line) => line.addr === addr) &&
                self.indexOf(addr) === i
            )
            .map((addr) => ({
              addr,
              location: `0x${addr.toString(16)}`,
            })),
        ],
      }
    })
  )
  console.log('Initial panicInfos:', JSON.stringify(panicInfos))

  // Xtensa-style stack walking based on A1 (stack pointer)
  const stackWalkAddrs = []
  if (candidateNotes.length > 0) {
    const firstRegs = candidateNotes[0].regs
    let sp = firstRegs.A1
    const visited = new Set()
    for (let i = 0; i < 16 && sp; i++) {
      if (sp + 8 > input.length) {
        break
      }
      const word = input.readUInt32LE(sp)
      if (word >= 0x40000000 && word <= 0x50000000 && !visited.has(word)) {
        stackWalkAddrs.push(word)
        visited.add(word)
      }
      // attempt to walk to next stack frame (A1 saved at sp+4)
      const nextSp = input.readUInt32LE(sp + 4)
      if (nextSp > sp && nextSp < input.length) {
        sp = nextSp
      } else {
        break
      }
    }
    // console.log(
    //   'Xtensa-walked stack addresses:',
    //   stackWalkAddrs.map((a) => `0x${a.toString(16)}`)
    // )
  }
  console.log('XTensa stack walk addresses:', stackWalkAddrs)

  console.dir(panicInfos, { depth: null })

  //

  const allAddrs = panicInfos.flatMap((p) =>
    p.backtraceAddrs.map((b) => b.addr)
  )
  console.log('All addresses to resolve:', allAddrs)
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
  console.log(
    'Panic infos with resolved locations:',
    JSON.stringify(panicInfos)
  )

  for (const panicInfo of panicInfos) {
    if (targetArch === 'xtensa') {
      const extraAddrs = stackWalkAddrs.filter(
        (addr) => !panicInfo.backtraceAddrs.find((a) => a.addr === addr)
      )
      const extraLines = await addr2line({ elfPath, toolPath }, extraAddrs)
      panicInfo.backtraceAddrs.push(...extraLines)
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

  console.log('decodeCoredump completed, returning panicInfos.')
  return await Promise.all(panicInfos)
}
