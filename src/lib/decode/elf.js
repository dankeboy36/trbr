// @ts-check
// Minimal vanilla JavaScript ELF parser for ELF32 little-endian files (as used by ESP-IDF).
// https://github.com/espressif/esp-coredump/blob/f905e81bf7ce29b2e1f0ee25dffcb31a84fc0599/esp_coredump/corefile/elf.py

import crypto from 'node:crypto'
import fs from 'node:fs'

/**
 * Read a 32-bit unsigned integer (little-endian) from buffer at offset.
 */
function readUInt32LE(buf, offset) {
  return buf.readUInt32LE(offset)
}

/**
 * Read a 16-bit unsigned integer (little-endian) from buffer at offset.
 */
function readUInt16LE(buf, offset) {
  return buf.readUInt16LE(offset)
}

/**
 * Parse the ELF header from a Buffer.
 * Returns an object with ELF header fields.
 */
function parseElfHeader(buf) {
  return {
    e_ident: buf.slice(0, 16), // Buffer
    e_type: readUInt16LE(buf, 16),
    e_machine: readUInt16LE(buf, 18),
    e_version: readUInt32LE(buf, 20),
    e_entry: readUInt32LE(buf, 24),
    e_phoff: readUInt32LE(buf, 28),
    e_shoff: readUInt32LE(buf, 32),
    e_flags: readUInt32LE(buf, 36),
    e_ehsize: readUInt16LE(buf, 40),
    e_phentsize: readUInt16LE(buf, 42),
    e_phnum: readUInt16LE(buf, 44),
    e_shentsize: readUInt16LE(buf, 46),
    e_shnum: readUInt16LE(buf, 48),
    e_shstrndx: readUInt16LE(buf, 50),
  }
}

/**
 * Parse the program headers from a Buffer using ELF header info.
 * Returns an array of program header objects.
 */
function parseProgramHeaders(buf, header) {
  const headers = []
  for (let i = 0; i < header.e_phnum; i++) {
    const offset = header.e_phoff + i * header.e_phentsize
    headers.push({
      p_type: readUInt32LE(buf, offset),
      p_offset: readUInt32LE(buf, offset + 4),
      p_vaddr: readUInt32LE(buf, offset + 8),
      p_paddr: readUInt32LE(buf, offset + 12),
      p_filesz: readUInt32LE(buf, offset + 16),
      p_memsz: readUInt32LE(buf, offset + 20),
      p_flags: readUInt32LE(buf, offset + 24),
      p_align: readUInt32LE(buf, offset + 28),
    })
  }
  return headers
}

/**
 * Parse the section headers from a Buffer using ELF header info.
 * Returns an array of section header objects.
 */
function parseSectionHeaders(buf, header) {
  const sections = []
  for (let i = 0; i < header.e_shnum; i++) {
    const offset = header.e_shoff + i * header.e_shentsize
    sections.push({
      sh_name: readUInt32LE(buf, offset),
      sh_type: readUInt32LE(buf, offset + 4),
      sh_flags: readUInt32LE(buf, offset + 8),
      sh_addr: readUInt32LE(buf, offset + 12),
      sh_offset: readUInt32LE(buf, offset + 16),
      sh_size: readUInt32LE(buf, offset + 20),
      sh_link: readUInt32LE(buf, offset + 24),
      sh_info: readUInt32LE(buf, offset + 28),
      sh_addralign: readUInt32LE(buf, offset + 32),
      sh_entsize: readUInt32LE(buf, offset + 36),
    })
  }
  return sections
}

/**
 * Parse an ELF file from disk, returning an object with
 * - elfHeader
 * - programHeaders
 * - sectionHeaders
 * @param {string} filePath
 */
export function parseElf(filePath) {
  const buf = fs.readFileSync(filePath)
  const header = parseElfHeader(buf)
  const programHeaders = parseProgramHeaders(buf, header)
  const sectionHeaders = parseSectionHeaders(buf, header)
  return {
    elfHeader: header,
    programHeaders,
    sectionHeaders,
  }
}

/**
 * Minimal ELF file class for ELF32 little-endian files.
 */
export class ElfFile {
  // Section and program header constants
  static SHN_UNDEF = 0x00
  static SHT_PROGBITS = 0x01
  static SHT_STRTAB = 0x03
  static SHT_NOBITS = 0x08

  static PT_LOAD = 0x01
  static PT_NOTE = 0x04

  static ET_CORE = 0x04
  static EV_CURRENT = 0x01

  /**
   * @param {string|null} elfPath
   * @param {number|null} e_type
   * @param {number|null} e_machine
   */
  constructor(elfPath = null, e_type = null, e_machine = null) {
    this.e_type = e_type
    this.e_machine = e_machine

    this.sections = []
    this.loadSegments = []
    this.noteSegments = []
    this.extraLoadSections = []
    this.sha256 = null

    if (elfPath && fs.existsSync(elfPath)) {
      this.readElf(elfPath)
    }
  }

  /**
   * Read and parse an ELF file, populating metadata and segments/sections.
   * @param {string} elfPath
   */
  readElf(elfPath) {
    const buf = fs.readFileSync(elfPath)
    // Calculate sha256
    const hash = crypto.createHash('sha256')
    hash.update(buf)
    this.sha256 = hash.digest()

    // Use our parser utilities
    const { elfHeader, programHeaders, sectionHeaders } = parseElf(elfPath)
    this.e_type = elfHeader.e_type
    this.e_machine = elfHeader.e_machine

    // Find section header string table
    let stringTable = null
    if (elfHeader.e_shstrndx !== ElfFile.SHN_UNDEF) {
      const strtab = sectionHeaders[elfHeader.e_shstrndx]
      stringTable = buf.slice(
        strtab.sh_offset,
        strtab.sh_offset + strtab.sh_size
      )
    }

    // Parse sections
    this.sections = sectionHeaders.map((sh) => {
      const name = stringTable
        ? this._parseStringTable(stringTable, sh.sh_name)
        : ''
      const data = buf.slice(sh.sh_offset, sh.sh_offset + sh.sh_size)
      return {
        name,
        addr: sh.sh_addr,
        data,
        flags: sh.sh_flags,
        type: sh.sh_type,
      }
    })

    // Insert all .coredump.* sections as synthetic load segments unless already present
    for (const section of this.sections) {
      if (section.name.startsWith('.coredump.')) {
        const duplicate = this.loadSegments.some((s) => s.addr === section.addr)
        if (!duplicate) {
          this.loadSegments.push({
            addr: section.addr,
            data: section.data,
            flags: section.flags,
            type: ElfFile.PT_LOAD,
          })
          this.extraLoadSections.push({
            name: section.name,
            addr: section.addr,
            data: section.data,
            flags: section.flags,
            type: ElfFile.PT_LOAD,
          })
          console.warn(
            `Detected virtual coredump segment "${section.name}", added to loadSegments.`
          )
        }
      } else if (section.flags & 0x2) {
        this.loadSegments.push({
          addr: section.addr,
          data: section.data,
          flags: section.flags,
          type: ElfFile.PT_LOAD,
        })
        this.extraLoadSections.push({
          name: section.name,
          addr: section.addr,
          data: section.data,
          flags: section.flags,
          type: ElfFile.PT_LOAD,
        })
        console.warn(
          `Detected loadable section "${section.name}", added to loadSegments.`
        )
      }
    }

    // Parse segments
    for (const ph of programHeaders) {
      const segmentData = buf.slice(ph.p_offset, ph.p_offset + ph.p_filesz)
      const segment = {
        addr: ph.p_vaddr,
        data: segmentData,
        flags: ph.p_flags,
        type: ph.p_type,
        offset: ph.p_offset,
        size: ph.p_filesz,
        vaddr: ph.p_vaddr,
        memsz: ph.p_memsz,
      }
      if (ph.p_type === ElfFile.PT_NOTE) {
        this.noteSegments.push(segment)
        console.warn(
          `Detected NOTE segment at 0x${segment.offset.toString(16)} (${
            segment.size
          } bytes)`
        )
      } else if (ph.p_type === ElfFile.PT_LOAD) {
        this.loadSegments.push(segment)
      }
    }
  }

  /**
   * Helper to parse a null-terminated string from a string table at a given offset.
   * @param {Buffer} strtab
   * @param {number} offset
   * @returns {string}
   */
  _parseStringTable(strtab, offset) {
    let end = offset
    while (end < strtab.length && strtab[end] !== 0x00) end++
    return strtab.slice(offset, end).toString('utf8')
  }

  // Allows access to virtual segments like .coredump.tasks.data
  getVirtualSegments() {
    return this.extraLoadSections
  }

  /**
   * Returns all memory segments that can be used for stack analysis.
   * This combines program header PT_LOAD segments and extra loadable sections.
   */
  getAllMemorySegments() {
    // Unify PT_LOAD segments and extraLoadSections, but avoid duplicates by addr.
    const all = [
      ...(this.loadSegments || []),
      ...(this.extraLoadSections || []),
    ]
    // Filter out segments without addr or data, and de-duplicate by addr.
    const seen = new Set()
    return all.filter(
      (s) =>
        s && s.addr != null && s.data && !seen.has(s.addr) && seen.add(s.addr)
    )
  }
  /**
   * Compatibility async parse method (noop since parsing is done in constructor)
   * Included for compatibility with coredump.js logic
   */
  async parse() {
    return this
  }
}
