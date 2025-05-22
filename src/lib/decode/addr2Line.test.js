// @ts-check

import temp from 'temp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { __tests } from './add2Line.js'

const { buildCommandFlags } = __tests

describe('addr2Line', () => {
  let tracked
  beforeAll(() => (tracked = temp.track()))
  afterAll(() => tracked.cleanupSync())

  describe('buildCommand', () => {
    it('should build command with flags from instruction addresses', () => {
      const elfPath = 'path/to/elf'
      const actualFlags = buildCommandFlags([0x4020104e, 0x40100d19], elfPath)
      expect(actualFlags).toEqual([
        '--batch',
        'path/to/elf',
        '-ex',
        'set listsize 1',
        '-ex',
        'set pagination off',
        '-ex',
        'set confirm off',
        '-ex',
        'set verbose off',
        '-ex',
        'printf ">>> ADDR: 0x4020104e\\n"',
        '-ex',
        'info line *0x4020104e',
        '-ex',
        'info symbol 0x4020104e',
        '-ex',
        'info functions 0x4020104e',
        '-ex',
        'info variables 0x4020104e',
        '-ex',
        'list *0x4020104e',
        '-ex',
        'printf ">>> ADDR: 0x40100d19\\n"',
        '-ex',
        'info line *0x40100d19',
        '-ex',
        'info symbol 0x40100d19',
        '-ex',
        'info functions 0x40100d19',
        '-ex',
        'info variables 0x40100d19',
        '-ex',
        'list *0x40100d19',
        '-ex',
        'quit',
      ])
    })
  })
})
