// @ts-check

import fs from 'fs'

// Helper to read binary data with dynamic endianness
export class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer
    this.view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    )
    this.offset = 0
    this.littleEndian = true
  }

  setEndian(little) {
    this.littleEndian = little
  }

  seek(pos) {
    this.offset = pos
  }

  tell() {
    return this.offset
  }

  readUInt8() {
    const val = this.view.getUint8(this.offset)
    this.offset += 1
    return val
  }

  readUInt16() {
    const val = this.view.getUint16(this.offset, this.littleEndian)
    this.offset += 2
    return val
  }

  readUInt32() {
    const val = this.view.getUint32(this.offset, this.littleEndian)
    this.offset += 4
    return val
  }

  readUInt64() {
    // JS cannot represent full 64-bit ints precisely; use BigInt
    const low = this.view.getUint32(this.offset, this.littleEndian)
    const high = this.view.getUint32(this.offset + 4, this.littleEndian)
    this.offset += 8
    return (BigInt(high) << 32n) | BigInt(low)
  }

  readBytes(length) {
    const bytes = this.buffer.slice(this.offset, this.offset + length)
    this.offset += length
    return bytes
  }
}

export class ELF {
  constructor(path) {
    this.buffer = fs.readFileSync(path)
    this.reader = new BinaryReader(this.buffer)
    this._programHeaders = null
    this._sectionHeaders = null
    this._symbols = null
    this._dynamicEntries = null
    this.parseFile(path)
  }

  parseFile(path) {
    this.path = path
    this.reader.seek(0)
    this._parseHeader()
  }

  _parseHeader() {
    const magic = this.reader.readBytes(4)
    if (magic.toString() !== '\x7fELF') {
      throw new Error('Invalid ELF magic')
    }

    const wordSize = this.reader.readUInt8() // 1=32-bit, 2=64-bit
    const byteOrder = this.reader.readUInt8() // 1=LE,2=BE
    const version = this.reader.readUInt8() // should be 1
    const osabi = this.reader.readUInt8() // OS ABI
    const abiVer = this.reader.readUInt8() // ABI version
    this.reader.readBytes(7) // padding

    this.bits = 32 * wordSize
    this._symbolEntrySize = this.bits === 32 ? 16 : 24 // Define symbol entry size based on word size
    this.littleEndian = byteOrder === 1
    this.reader.setEndian(this.littleEndian)
    this.osabi = ELF.OSABI[osabi] || 'unknown'
    this.abiVersion = abiVer

    // read type, machine, version
    const type_ = this.reader.readUInt16()
    const machine = this.reader.readUInt16()
    const ver2 = this.reader.readUInt32()
    this.type = ELF.Type[type_] || 'unknown'
    this.machine = ELF.Machine[machine] || 'unknown'
    if (ver2 !== 1) {
      throw new Error('Invalid ELF version')
    }

    // architecture-specific assertions skipped

    // read main header fields
    let entry,
      phoff,
      shoff,
      flags,
      hsize,
      phentsize,
      phnum,
      shentsize,
      shnum,
      shstrndx
    if (this.bits === 32) {
      entry = this.reader.readUInt32()
      phoff = this.reader.readUInt32()
      shoff = this.reader.readUInt32()
      flags = this.reader.readUInt32()
      hsize = this.reader.readUInt16()
      phentsize = this.reader.readUInt16()
      phnum = this.reader.readUInt16()
      shentsize = this.reader.readUInt16()
      shnum = this.reader.readUInt16()
      shstrndx = this.reader.readUInt16()
    } else {
      entry = this.reader.readUInt64()
      phoff = this.reader.readUInt64()
      shoff = this.reader.readUInt64()
      flags = this.reader.readUInt32()
      hsize = this.reader.readUInt16()
      phentsize = this.reader.readUInt16()
      phnum = this.reader.readUInt16()
      shentsize = this.reader.readUInt16()
      shnum = this.reader.readUInt16()
      shstrndx = this.reader.readUInt16()
    }
    this.entry = entry
    this.phoff = phoff
    this.shoff = shoff
    this.flags = flags
    this.hsize = hsize
    this.phentsize = phentsize
    this.phnum = phnum
    this.shentsize = shentsize
    this.shnum = shnum
    this.shstrndx = shstrndx

    console.log('ELF Header parsed:', {
      bits: this.bits,
      entry: this.entry,
      phoff: this.phoff,
      shoff: this.shoff,
      flags: this.flags,
      hsize: this.hsize,
      phentsize: this.phentsize,
      phnum: this.phnum,
      shentsize: this.shentsize,
      shnum: this.shnum,
      shstrndx: this.shstrndx,
      type: this.type,
      machine: this.machine,
      osabi: this.osabi,
      abiVersion: this.abiVersion,
      littleEndian: this.littleEndian,
    })
  }

  // Lazy-load program headers
  get programHeaders() {
    if (!this._programHeaders) {
      this._programHeaders = []
      this.reader.seek(Number(this.phoff))
      for (let i = 0; i < this.phnum; i++) {
        const data = this.reader.readBytes(this.phentsize)
        const ph = new ELF.ProgramHeader(this, data)
        this._programHeaders.push(ph)
      }
      console.log('Parsed Program Headers:')
      this._programHeaders.forEach((ph, i) => {
        console.log(
          `  [${i}] Type: ${ph.type}, Offset: ${ph.offset}, VAddr: ${ph.vaddr}, FileSz: ${ph.fileSz}, MemSz: ${ph.memSz}, Flags: ${ph.flags}`
        )
      })
    }
    return this._programHeaders
  }

  get sectionHeaders() {
    if (!this._sectionHeaders) {
      // load all section headers
      this._sectionHeaders = []
      this.reader.seek(Number(this.shoff))
      for (let i = 0; i < this.shnum; i++) {
        const data = this.reader.readBytes(this.shentsize)
        this._sectionHeaders.push(new ELF.SectionHeader(this, data))
      }
      // resolve names
      const strSection = this._sectionHeaders[this.shstrndx]
      const names = strSection.content.toString('ascii')
      this._sectionHeaders.forEach((sec) => {
        sec.name = names.slice(sec.nameIndex).split('\0')[0]
      })
      console.log('Parsed Section Headers:')
      this._sectionHeaders.forEach((sh, i) => {
        console.log(
          `  [${i}] Type: ${sh.type}, Name: ${sh.name}, Addr: ${sh.addr}, Offset: ${sh.offset}, Size: ${sh.size}`
        )
      })
    }
    return this._sectionHeaders
  }

  get symbols() {
    if (!this._symbols) {
      const symSec = this.getSection('.symtab')?.content
      const strSec = this.getSection('.strtab')?.content
      if (!symSec) {
        this._symbols = []
      } else {
        this._symbols = []
        const reader = new BinaryReader(symSec)
        reader.setEndian(this.littleEndian)
        while (reader.tell() < symSec.length) {
          const symData = symSec.slice(
            reader.tell(),
            reader.tell() + this._symbolEntrySize
          )
          reader.seek(reader.tell() + this._symbolEntrySize)
          this._symbols.push(new ELF.Symbol(this, symData, strSec))
        }
      }
      console.log('Parsed Symbols:')
      this._symbols.forEach((sym, i) => {
        console.log(
          `  [${i}] Name: ${sym.name}, Address: ${sym.value}, Type: ${sym.type}`
        )
      })
    }
    return this._symbols
  }

  getSection(name) {
    return this.sectionHeaders.find((sec) => sec.name === name)
  }
}

// Nested classes and enums
ELF.ProgramHeader = class {
  static Type = {
    unknown: -1,
    null: 0,
    load: 1,
    dynamic: 2,
    interp: 3,
    note: 4,
    shlib: 5,
    phdr: 6,
    gnu_eh_frame: 0x6474e550,
    gnu_stack: 0x6474e551,
    gnu_relro: 0x6474e552,
  }
  static Flags = { x: 1, w: 2, r: 4 }

  constructor(elf, data) {
    const br = new BinaryReader(data)
    br.setEndian(elf.littleEndian)
    if (elf.bits === 32) {
      this.typeId = br.readUInt32()
      this.offset = br.readUInt32()
      this.vaddr = br.readUInt32()
      this.paddr = br.readUInt32()
      this.fileSz = br.readUInt32()
      this.memSz = br.readUInt32()
      this.flags = br.readUInt32()
      this.align = br.readUInt32()
    } else {
      this.typeId = br.readUInt32()
      this.flags = br.readUInt32()
      this.offset = Number(br.readUInt64())
      this.vaddr = Number(br.readUInt64())
      this.paddr = Number(br.readUInt64())
      this.fileSz = Number(br.readUInt64())
      this.memSz = Number(br.readUInt64())
      this.align = Number(br.readUInt64())
    }
    this.type =
      Object.entries(ELF.ProgramHeader.Type).find(
        ([, v]) => v === this.typeId
      )?.[0] || 'unknown'
  }
}

ELF.SectionHeader = class {
  static Type = {
    /* similar mapping */
  }
  static Flags = {
    /* similar mapping */
  }
  constructor(elf, data) {
    this.elf = elf
    const br = new BinaryReader(data)
    br.setEndian(elf.littleEndian)
    if (elf.bits === 32) {
      this.nameIndex = br.readUInt32()
      this.typeId = br.readUInt32()
      this.flags = br.readUInt32()
      this.addr = br.readUInt32()
      this.offset = br.readUInt32()
      this.size = br.readUInt32()
      this.link = br.readUInt32()
      this.info = br.readUInt32()
      this.addralign = br.readUInt32()
      this.entsize = br.readUInt32()
    } else {
      this.nameIndex = br.readUInt32()
      this.typeId = br.readUInt32()
      this.flags = Number(br.readUInt64())
      this.addr = Number(br.readUInt64())
      this.offset = Number(br.readUInt64())
      this.size = Number(br.readUInt64())
      this.link = br.readUInt32()
      this.info = br.readUInt32()
      this.addralign = Number(br.readUInt64())
      this.entsize = Number(br.readUInt64())
    }
    try {
      this.type = Object.entries(ELF.SectionHeader.Type).find(
        ([, v]) => v === this.typeId
      )[0]
    } catch {
      this.type = 'unknown'
    }
  }

  get content() {
    if (!this._content) {
      const buf = this.elf.buffer.slice(this.offset, this.offset + this.size)
      this._content = buf
    }
    return this._content
  }
}

ELF.Symbol = class {
  static Binding = { local: 0, global: 1, weak: 2 }
  static Type = {
    unknown: -1,
    notype: 0,
    object: 1,
    func: 2,
    section: 3,
    file: 4,
    common: 5,
    tls: 6,
  }
  static Visibility = { default: 0, internal: 1, hidden: 2, protected: 3 }
  static SpecialSection = { undef: 0, abs: 0xfff1, common: 0xfff2 }

  constructor(elf, data, strBytes) {
    this.elf = elf
    const br = new BinaryReader(data)
    br.setEndian(elf.littleEndian)
    if (elf.bits === 32) {
      this.nameIndex = br.readUInt32()
      this.value = br.readUInt32()
      this.size = br.readUInt32()
      this.info = br.readUInt8()
      this.other = br.readUInt8()
      this.shndx = br.readUInt16()
    } else {
      this.nameIndex = br.readUInt32()
      this.info = br.readUInt8()
      this.other = br.readUInt8()
      this.shndx = br.readUInt16()
      this.value = Number(br.readUInt64())
      this.size = Number(br.readUInt64())
    }
    this.binding = Object.entries(ELF.Symbol.Binding).find(
      ([, v]) => v === this.info >> 4
    )?.[0]
    this.type = Object.entries(ELF.Symbol.Type).find(
      ([, v]) => v === (this.info & 0xf)
    )?.[0]
    this.visibility = Object.entries(ELF.Symbol.Visibility).find(
      ([, v]) => v === (this.other & 0x3)
    )?.[0]
    this.name = strBytes.slice(this.nameIndex).toString('ascii').split('\0')[0]
  }

  get content() {
    if (
      this.shndx === ELF.Symbol.SpecialSection.undef ||
      this.shndx === ELF.Symbol.SpecialSection.abs ||
      this.shndx === ELF.Symbol.SpecialSection.common
    ) {
      throw new TypeError('Symbol not defined')
    }
    if (!this._content) {
      const sec = this.elf.sectionHeaders[this.shndx]
      const offset = this.value - sec.addr
      this._content = this.elf.buffer.slice(
        sec.offset + offset,
        sec.offset + offset + this.size
      )
    }
    return this._content
  }
}

ELF.DynamicSectionEntry = class {
  static Type = {
    /* map types similarly */
  }
  static Flags = {
    /* map flags */
  }
  static Flags1 = {
    /* map flags_1 */
  }
  static Posflags1 = {
    /* map posflags_1 */
  }
  constructor(typeId, value) {
    this.typeId = typeId
    this.value = value
    this.type =
      Object.entries(ELF.DynamicSectionEntry.Type).find(
        ([, v]) => v === typeId
      )?.[0] || 'unknown'
  }
}

ELF.Type = {
  unknown: -1,
  none: 0,
  relocatable: 1,
  executable: 2,
  shared: 3,
  core: 4,
  os: 0xfe00,
  proc: 0xff00,
}
ELF.Machine = {
  /* map machines */
}
ELF.OSABI = {
  unknown: -1,
  system_v: 0,
  hp_ux: 1,
  netbsd: 2,
  linux: 3,
  solaris: 6,
  aix: 7,
  irix: 8,
  freebsd: 9,
  tru64: 10,
  modesto: 11,
  openbsd: 12,
  openvms: 13,
  nsk: 14,
  aros: 15,
  arch: 64,
  arm: 97,
}

// You can extend this module to add CLI wrappers or additional helpers as needed.
