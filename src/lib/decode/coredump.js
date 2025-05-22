// Decode an ESP core dump in ELF format and extract panic information.

import fs from 'node:fs/promises'

import { addr2line, regsInfo } from './add2Line.js'
import { stringifyAddr } from './decode.js'
import { ELF } from './elf.js'
import { registerSets } from './regs.js'

const elfMagic = 0x464c457f // ELF magic number

/** @type {import('./decode.js').DecodeCoredumpFunction} */
export async function decodeCoredump(
  { targetArch, toolPath, elfPath },
  coredumpPath,
  _options
) {
  const input = await fs.readFile(coredumpPath)

  const coredumpElf = new ELF(coredumpPath)
  // console.log('coredump ELF:', coredumpElf)
  // console.log('coredump ELF details:', {
  //   type: coredumpElf.type,
  //   machine: coredumpElf.machine,
  //   bits: coredumpElf.bits,
  //   entry: coredumpElf.entry,
  //   phoff: coredumpElf.phoff,
  //   shoff: coredumpElf.shoff,
  //   phnum: coredumpElf.phnum,
  //   shnum: coredumpElf.shnum,
  // })
  const elf = new ELF(elfPath)
  // console.log('ELF:', elf)
  // console.log('ELF details:', {
  //   type: elf.type,
  //   machine: elf.machine,
  //   bits: elf.bits,
  //   entry: elf.entry,
  //   phoff: elf.phoff,
  //   shoff: elf.shoff,
  //   phnum: elf.phnum,
  //   shnum: elf.shnum,
  // })

  const regsInfoStdout = await regsInfo(
    { toolPath, elfPath },
    '/Users/kittaakos/dev/sandbox/trbr/.tests/coredumps/esp32da/esp32backtracetest/coredump.elf',
    {}
  )
  // console.log('regsInfoStdout:', regsInfoStdout)

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
    const type = input.readUInt32LE(offset)
    const poffset = input.readUInt32LE(offset + 4)
    const psize = input.readUInt32LE(offset + 16)
    programHeaders.push({ type, offset: poffset, size: psize })
    console.debug('Program Header:', { type, offset: poffset, size: psize })
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
  // console.log('Parsed notes:', notes)

  const regNames = registerSets[targetArch] ?? registerSets.xtensa
  /** @type {import('./decode.js').PanicInfo|undefined} */
  let crashed

  let candidateNotes = []

  for (const note of notes) {
    if (!note.name.startsWith('CORE') || note.desc.length < 16) {
      continue
    }

    const coreId = note.desc.readUInt32LE(0)
    /** @type {Record<string,number>} */
    const regs = {}
    for (let i = 0; i < regNames.length; i++) {
      const offset = 16 + i * 4
      if (offset + 4 > note.desc.length) {
        break
      }
      regs[regNames[i]] = note.desc.readUInt32LE(offset)
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

    candidateNotes.push({ note, coreId, regs, pc, faultCode })
  }

  candidateNotes = candidateNotes.filter(({ pc }) => pc !== 0)

  /** @type {import('./decode.js').PanicInfoWithBacktrace[]} */
  const panicInfos = await Promise.all(
    candidateNotes.map(async ({ coreId, regs, faultCode }) => {
      const faultAddr = regs.EXCVADDR ?? 0
      const pc = regs.PC ?? 0

      // Collect potential backtrace addresses
      const addrs = Object.values(regs)
        .filter(
          (val) =>
            typeof val === 'number' && val >= 0x40000000 && val <= 0x50000000
        )
        .filter((addr, i, self) => addr !== 0 && self.indexOf(addr) === i)

      const lines = await addr2line({ elfPath, toolPath }, addrs)

      return {
        coreId,
        programCounter: pc,
        faultAddr,
        faultCode,
        regs,
        backtraceAddrs: lines,
      }
    })
  )

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

  console.dir(panicInfos, { depth: null })

  //

  const allAddrs = panicInfos.flatMap((p) => p.backtraceAddrs)
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
    info.backtraceAddrs = info.backtraceAddrs.map((addr) => ({
      addr,
      location: addrLocationMap.get(addr) ?? `0x${addr.toString(16)}`,
    }))
  })

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

  for (const panicInfo of panicInfos) {
    // console.log(`\nBacktrace for core ${panicInfo.coreId}:`)
    panicInfo.backtraceAddrs.forEach((entry, index) => {
      const addrStr = `0x${entry.addr.addr.toString(16)}`
      const loc = entry.addr.location
      // if (typeof loc === 'object') {
      //   console.log(
      //     `#${index}  ${addrStr} in ${loc.method} at ${loc.file}:${loc.lineNumber}`
      //   )
      // } else {
      //   console.log(`#${index}  ${addrStr} in ?? ()`)
      // }
    })
  }

  return await Promise.all(panicInfos)
}
