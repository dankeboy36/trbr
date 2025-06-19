// @ts-check

import waitFor from '@sadams/wait-for-expect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderApp } from '../app/index.js'
import { parse } from './cli.js'
import { texts } from './options.text.js'

vi.mock('../app/index.js', () => ({
  renderApp: vi.fn(),
}))

vi.mock('./stdin.js', () => ({
  attachRestoreStdinHandlers: vi.fn(),
}))

describe('cli', () => {
  let mockStderrWrite
  let mockExit

  beforeEach(async () => {
    mockStderrWrite = vi.fn()
    vi.spyOn(process.stderr, 'write').mockImplementation(mockStderrWrite)
    mockExit = vi.fn()
    // @ts-ignore
    vi.spyOn(process, 'exit').mockImplementation(mockExit)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should render app', async () => {
    parse([
      'node',
      'script.js',
      'decode',
      '-e',
      '/path/to/elf',
      '-t',
      '/path/to/tool',
      '-A',
      'xtensa',
    ])

    await waitFor(() =>
      expect(renderApp).toHaveBeenCalledWith({
        additionalUrls: '',
        arduinoCliConfig: '',
        color: false,
        elfPath: '/path/to/elf',
        targetArch: 'xtensa',
        toolPathOrFqbn: '/path/to/tool',
        decodeInput: {
          coredumpMode: false,
          inputPath: '',
        },
        coredumpMode: false,
      })
    )
  })

  it('should enable debug mode', async () => {
    expect(process.env.DEBUG).toBeUndefined()

    parse([
      'node',
      'script.js',
      'decode',
      '-e',
      '/path/to/elf',
      '-t',
      '/path/to/tool',
      '-A',
      'xtensa',
      '--debug',
    ])

    expect(process.env.DEBUG).toBe('trbr:*')
  })

  it('prints the error', async () => {
    parse(['node', 'script.js', 'decode', '-e', '/path/to/elf'])

    await waitFor(() =>
      expect(mockStderrWrite).toHaveBeenCalledWith(
        `Error: ${texts.errors.toolPathOrFqbnRequired}\n`
      )
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
