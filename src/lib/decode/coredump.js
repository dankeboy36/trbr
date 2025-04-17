// Decode an ESP core dump in ELF format and extract panic information.

import { registerSets } from './regs.js'

const elfMagic = 0x464c457f // ELF magic number

/** @type {import('./decode.js').DecodeCoredumpFunction} */
export async function decodeCoredump({ targetArch }, input, _options) {
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
        result.push({ name, desc })
        console.debug('Note:', { name, type, descLength: desc.length })
        cursor = Math.ceil((descOffset + descsz) / 4) * 4
      }
      return result
    })

  const regNames = registerSets[targetArch] ?? registerSets.xtensa
  /** @type {import('./decode.js').PanicInfo|undefined} */
  let crashed

  const candidateNotes = notes
    .filter((note) => note.name === 'CORE' && note.desc.length >= 16)
    .map((note) => {
      const coreId = note.desc.readUInt32LE(0)
      const regs = {}
      for (let i = 0; i < regNames.length; i++) {
        const offset = 16 + i * 4
        if (offset + 4 > note.desc.length) break
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
      const excCause = regs.EXCCAUSE ?? 0
      console.debug(
        `Found CORE note | Core: ${coreId} | PC: 0x${pc.toString(
          16
        )} | EXCCAUSE: ${excCause}`
      )
      console.debug(
        `Decoded regs for CORE ${coreId}:`,
        JSON.stringify(regs, null, 2)
      )
      return { note, coreId, regs, pc, excCause }
    })
    .filter(({ pc }) => pc !== 0)

  const panicInfos = candidateNotes.map(({ coreId, regs, excCause }) => {
    const excVaddr = regs.EXCVADDR ?? 0
    return {
      coreId,
      regs,
      faultAddr: excVaddr,
      exceptionCause: excCause,
    }
  })

  console.log('----all panicInfos----')
  console.log(JSON.stringify(panicInfos, null, 2))
  console.log('----------------------')

  return panicInfos[0]
}
