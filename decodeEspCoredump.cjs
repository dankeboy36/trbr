const fs = require('fs')

const registerSets = {
  xtensa: [
    'PC',
    'PS',
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
    'SAR',
    'EXCCAUSE',
    'EXCVADDR',
    'LBEG',
    'LEND',
    'LCOUNT',
    'WINDOWBASE',
    'WINDOWSTART',
  ],
  riscv: [
    'MEPC',
    'RA',
    'SP',
    'GP',
    'TP',
    'T0',
    'T1',
    'T2',
    'S0',
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
    'MSTATUS',
    'MTVEC',
    'MCAUSE',
    'MTVAL',
    'MHARTID',
  ],
}

function readUInt32LE(buffer, offset) {
  if (offset + 4 > buffer.length) {
    return 0
  }
  return buffer.readUInt32LE(offset)
}

function readUInt16LE(buffer, offset) {
  if (offset + 2 > buffer.length) {
    return 0
  }
  return buffer.readUInt16LE(offset)
}

function parseCoreNotes(buffer, noteSections, regNames = registerSets.xtensa) {
  const tasks = []

  for (const note of noteSections) {
    if (note.name !== 'CORE' || note.size < 16) {
      continue
    }

    const desc = buffer.slice(note.offset, note.offset + note.size)
    console.log(`--- CORE NOTE ---`)
    console.log(`@ offset 0x${note.offset.toString(16)} | size: ${note.size}`)
    console.log(
      desc
        .toString('hex')
        .match(/.{1,32}/g)
        ?.join('\n')
    )
    if (desc.length < 16) {
      continue
    }

    const tcb = readUInt32LE(desc, 0)
    const stackTop = readUInt32LE(desc, 4)
    const stackEnd = readUInt32LE(desc, 8)
    const tcbSize = readUInt32LE(desc, 12)

    console.log(`tcb @0x0:        0x${tcb.toString(16)}`)
    console.log(`stackTop @0x4:   0x${stackTop.toString(16)}`)
    console.log(`stackEnd @0x8:   0x${stackEnd.toString(16)}`)
    console.log(`tcbSize @0xc:    0x${tcbSize.toString(16)}`)

    const regs = {}
    const regCount = Math.min(
      Math.floor((desc.length - 16) / 4),
      regNames.length
    )
    for (let i = 0; i < regCount; i++) {
      const offset = 16 + i * 4
      const regVal = readUInt32LE(desc, offset)
      const regName = regNames[i] || `R${i}`
      console.log(
        `reg ${regName} @0x${offset.toString(16)}: 0x${regVal.toString(16)}`
      )
      regs[regName] = regVal
    }

    const jsonSummary = {
      tcb: '0x' + tcb.toString(16),
      registers: Object.fromEntries(
        Object.entries(regs).map(([k, v]) => [k, '0x' + v.toString(16)])
      ),
    }
    console.log(JSON.stringify(jsonSummary, null, 2))

    if (tcb !== 0 || stackTop !== 0 || stackEnd !== 0 || tcbSize !== 0) {
      tasks.push({
        tcb: '0x' + tcb.toString(16),
        stackTop: '0x' + stackTop.toString(16),
        stackEnd: '0x' + stackEnd.toString(16),
        tcbSize,
        registers: regs,
      })
    }
  }

  return tasks
}

function parseProgramHeaders(buffer, phoff, phentsize, phnum, baseOffset) {
  const headers = []

  for (let i = 0; i < phnum; i++) {
    const offset = phoff + i * phentsize
    const base = baseOffset + offset
    if (base + phentsize > buffer.length) {
      break
    }
    const type = buffer.readUInt32LE(base)
    const off = buffer.readUInt32LE(base + 4)
    const vaddr = buffer.readUInt32LE(base + 8)
    const paddr = buffer.readUInt32LE(base + 12)
    const size = buffer.readUInt32LE(base + 16)
    const flags = buffer.readUInt32LE(base + 20)
    const align = buffer.readUInt32LE(base + 24)

    headers.push({
      type,
      offset: off,
      size,
      vaddr: '0x' + vaddr.toString(16),
      paddr: '0x' + paddr.toString(16),
      flags,
      align,
      isNote: type === 4,
    })
  }

  return headers
}

function decodeEspCoredump(buffer) {
  for (const offset of [4, 16, 20, 24, 28]) {
  }

  const isElf = buffer.readUInt32LE(0) === 0x464c457f

  if (!isElf) {
    for (let offset = 0; offset <= 64; offset += 4) {
      if (buffer.readUInt32LE(offset) === 0x464c457f) {
        return decodeEspElfCoredump(buffer, offset)
      }
    }
  }

  const imageLength = buffer.readUInt32LE(0)
  if (imageLength > 0x1000 && imageLength + 4 <= buffer.length) {
    buffer = buffer.slice(4, 4 + imageLength)
  }

  const result = {
    format: 'BINARY',
    binaryHeader: null,
    tasks: [],
  }

  if (buffer.length < 24) {
    throw new Error('Buffer too small to contain ESP core dump header')
  }

  const version = buffer.readUInt32LE(0)
  const taskCount = buffer.readUInt32LE(4)
  const tcbSize = buffer.readUInt32LE(8)
  const stackTop = buffer.readUInt32LE(12)
  const stackBottom = buffer.readUInt32LE(16)

  result.binaryHeader = {
    version,
    taskCount,
    tcbSize,
    stackTop: '0x' + stackTop.toString(16),
    stackBottom: '0x' + stackBottom.toString(16),
    totalLength: buffer.length,
  }

  let offset = 20
  for (let i = 0; i < taskCount; i++) {
    if (offset + 16 > buffer.length) {
      break
    }

    const tcbAddr = buffer.readUInt32LE(offset)
    const stackStart = buffer.readUInt32LE(offset + 4)
    const stackEnd = buffer.readUInt32LE(offset + 8)
    const tcbSz = buffer.readUInt32LE(offset + 12)

    const isValidAddr = (addr) => addr >= 0x3f800000 && addr < 0x40000000

    if (
      tcbAddr === 0 ||
      !isValidAddr(stackStart) ||
      !isValidAddr(stackEnd) ||
      stackStart <= stackEnd ||
      tcbSz === 0
    ) {
      offset += 16
      continue
    }

    result.tasks.push({
      tcb: '0x' + tcbAddr.toString(16),
      stackTop: '0x' + stackStart.toString(16),
      stackEnd: '0x' + stackEnd.toString(16),
      tcbSize: tcbSz,
    })

    offset += 16
  }

  return result
}

function decodeEspElfCoredump(buffer, baseOffset = 0) {
  const elfStart = baseOffset
  const elfBuffer = buffer.slice(elfStart)

  const result = {
    format: 'ELF',
    offset: 0,
    elf: {
      class: elfBuffer[4] === 1 ? 32 : 64,
      endianness: elfBuffer[5] === 1 ? 'little' : 'big',
      version: elfBuffer[6],
      abi: elfBuffer[7],
      sections: [],
      registers: null,
      programHeaders: [],
      noteSections: [],
      tasks: [],
    },
  }

  const elf = result.elf
  const elfHeader = {
    type: readUInt16LE(elfBuffer, 16),
    machine: readUInt16LE(elfBuffer, 18),
    entry: '0x' + readUInt32LE(elfBuffer, 24).toString(16),
    phoff: readUInt32LE(elfBuffer, 28),
    phentsize: readUInt16LE(elfBuffer, 42),
    phnum: readUInt16LE(elfBuffer, 44),
    shoff: readUInt32LE(elfBuffer, 32),
    shentsize: readUInt16LE(elfBuffer, 46),
    shnum: readUInt16LE(elfBuffer, 48),
    shstrndx: readUInt16LE(elfBuffer, 50),
  }
  elf.elfHeader = elfHeader

  elf.programHeaders = parseProgramHeaders(
    buffer,
    elfHeader.phoff,
    elfHeader.phentsize,
    elfHeader.phnum,
    baseOffset
  )

  const noteSections = elf.programHeaders
    .filter((ph) => ph.isNote)
    .flatMap((ph) => {
      const noteData = buffer.slice(ph.offset, ph.offset + ph.size)
      const notes = []
      let cursor = 0
      while (cursor + 12 <= noteData.length) {
        const namesz = noteData.readUInt32LE(cursor)
        const descsz = noteData.readUInt32LE(cursor + 4)
        const type = noteData.readUInt32LE(cursor + 8)
        const name = noteData
          .slice(cursor + 12, cursor + 12 + namesz)
          .toString('ascii')
          .replace(/\0+$/, '')
        const descOffset = cursor + 12 + ((namesz + 3) & ~3)
        const descEnd = descOffset + descsz
        notes.push({
          name,
          type,
          offset: baseOffset + ph.offset + descOffset,
          size: descsz,
        })
        cursor = Math.ceil(descEnd / 4) * 4
      }
      return notes
    })

  elf.noteSections = noteSections
  elf.tasks = parseCoreNotes(buffer, noteSections)

  return result
}

const input = fs.readFileSync('./core_dump.bin')
const result = decodeEspCoredump(input)

const crashed = (result.elf?.tasks || result.tasks || []).find(
  (t) =>
    t.registers &&
    Object.values(t.registers).some((v) => v !== 0) &&
    t.stackTop !== '0x0'
)

if (crashed?.registers) {
  const reg = crashed.registers
  console.log(
    "\nGuru Meditation Error: Core  0 panic'ed. Exception was unhandled.\n"
  )
  console.log('Core  0 register dump:')
  const orderedRegs = registerSets.xtensa.map((name) => ({
    name,
    value: reg[name] !== undefined ? reg[name] : null,
  }))
  const formatted = orderedRegs.map(({ name, value }) => {
    if (value === null) {
      return `${name.padEnd(8)}: <unavailable>`
    }
    const hex = '0x' + value.toString(16).padStart(8, '0')
    const signed = (value | 0) >> 0 // Convert to signed 32-bit
    return `${name.padEnd(8)}: ${hex}  ${signed}`
  })
  for (let i = 0; i < formatted.length; i += 4) {
    console.log(formatted.slice(i, i + 4).join('  '))
  }
}

console.log('\n======================== THREADS INFO =========================')
const tasks = result.elf?.tasks || result.tasks || []
for (const task of tasks) {
  const tcb = task.tcb?.toString() || '0x0'
  const top = task.stackTop?.toString() || '0x0'
  const end = task.stackEnd?.toString() || '0x0'
  const size = task.tcbSize || 0
  console.log(`${tcb.padEnd(12)} stack ${top} → ${end} (tcbSize: ${size})`)
}
