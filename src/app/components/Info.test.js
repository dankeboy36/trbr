// @ts-check

import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'

import Info from './Info.js'

describe('Info', () => {
  it('renders info', () => {
    const instance = render(
      <Info elfPath="/path/to/elf" toolPath="/path/to/tool" />
    )
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toEqual(expect.stringContaining('Elf path: /path/to/elf'))
    expect(lastFrame).toEqual(
      expect.stringContaining('Tool path: /path/to/tool')
    )
  })

  it('renders info when elf path is absent', () => {
    const instance = render(<Info toolPath="/path/to/tool" />)
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toEqual(expect.stringContaining('Elf path: ⠋'))
    expect(lastFrame).toEqual(
      expect.stringContaining('Tool path: /path/to/tool')
    )
  })

  it('renders info when tool path is absent', () => {
    const instance = render(<Info elfPath="/path/to/elf" />)
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toEqual(expect.stringContaining('Elf path: /path/to/elf'))
    expect(lastFrame).toEqual(expect.stringContaining('Tool path: ⠋'))
  })

  it('renders info when all is absent', () => {
    const instance = render(<Info />)
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toEqual(expect.stringContaining('Elf path: ⠋'))
    expect(lastFrame).toEqual(expect.stringContaining('Tool path: ⠋'))
  })

  it('renders border', () => {
    const instance = render(<Info />)
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toEqual(expect.stringContaining('\x1b[32m┌'))
    expect(lastFrame).toEqual(expect.stringContaining('\x1b[32m└'))
    expect(lastFrame).toEqual(expect.stringContaining('┐\x1b[39m'))
    expect(lastFrame).toEqual(expect.stringContaining('┘\x1b[39m'))
  })
})
