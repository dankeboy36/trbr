// @ts-check

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import waitFor from 'wait-for-expect'

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
  let mockStderr
  let stderrSpy
  let exitSpy

  beforeAll(() => {
    mockStderr = vi.fn()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(mockStderr)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
  })

  afterAll(() => {
    stderrSpy.mockRestore()
  })

  beforeEach(() => {
    vi.clearAllMocks()
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
        traceInput: '',
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
      expect(mockStderr).toHaveBeenCalledWith(
        `Error: ${texts.errors.toolPathOrFqbnRequired}\n`
      )
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
