// @ts-check

import { describe, expect, it, vi } from 'vitest'

import { parse } from './cli.js'

vi.mock('./cli.js')

describe('index', () => {
  it('should call the parse function', async () => {
    const mockParse = vi.fn()
    vi.mocked(parse).mockImplementation(mockParse)

    await import('./index.js')

    expect(parse).toHaveBeenCalledTimes(1)
    expect(parse).toHaveBeenCalledWith(process.argv)
  })
})
