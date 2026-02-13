// @ts-check

import { describe, expect, it } from 'vitest'

import { LineDecoder } from './lineDecoder.js'

const encoder = new TextEncoder()

describe('lineDecoder', () => {
  it('handles CRLF split across chunks', () => {
    const decoder = new LineDecoder()
    expect(decoder.push(encoder.encode('first\r'))).toEqual([])
    expect(decoder.push(encoder.encode('\nsecond\r\n'))).toEqual([
      'first',
      'second',
    ])
  })

  it('flushes trailing unterminated content as final line', () => {
    const decoder = new LineDecoder()
    expect(decoder.push(encoder.encode('partial-line'))).toEqual([])
    expect(decoder.flush()).toEqual(['partial-line'])
    expect(decoder.flush()).toEqual([])
  })

  it('supports mixed line endings in one chunk', () => {
    const decoder = new LineDecoder()
    expect(decoder.push(encoder.encode('a\nb\rc\r\nd'))).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(decoder.flush()).toEqual(['d'])
  })
})
