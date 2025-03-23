// @ts-check

import { describe, expect, it } from 'vitest'

import { isGDBLine, isParsedGDBLine } from './location.js'

describe('location', () => {
  describe('isGDBLine', () => {
    it('should return true for valid GDB line', () => {
      const validLine = { lineNumber: '??', address: '0x1234' }
      expect(isGDBLine(validLine)).toBe(true)
    })

    it('should return false for invalid GDB line', () => {
      const invalidLine = 'This is not a GDB line'
      expect(isGDBLine(invalidLine)).toBe(false)
    })
  })

  describe('isParsedGDBLine', () => {
    it('should return true for a valid parsed GDB line object', () => {
      const validParsedLine = {
        file: 'main.c',
        lineNumber: '10',
        method: 'main',
        address: '0x1234',
      }
      expect(isParsedGDBLine(validParsedLine)).toBe(true)
    })

    it('should return false for an invalid parsed GDB line object', () => {
      const invalidParsedLine = {
        file: 'main.c',
        lineNumber: 10,
        function: 'main',
        address: '0x1234',
      }
      expect(isParsedGDBLine(invalidParsedLine)).toBe(false)
    })

    it('should return false for a completely invalid object', () => {
      const invalidObject = { randomKey: 'randomValue' }
      expect(isParsedGDBLine(invalidObject)).toBe(false)
    })
  })
})
