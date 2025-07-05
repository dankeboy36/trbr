// @ts-check

import * as cp from 'node:child_process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { exec } from './exec.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

const execFileMock = vi.mocked(cp.execFile)

describe('exec', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  it('resolves with stdout only', async () => {
    execFileMock.mockImplementation((cmd, args, options, callback) => {
      callback(null, 'out-data', '')
    })

    const result = await exec('mycmd', ['arg1'], { cwd: '/tmp' })
    expect(result).toEqual({ stdout: 'out-data', stderr: '' })
    expect(execFileMock).toHaveBeenCalledWith(
      'mycmd',
      ['arg1'],
      { cwd: '/tmp' },
      expect.any(Function)
    )
  })

  it('resolves with stdout and stderr', async () => {
    execFileMock.mockImplementation((cmd, args, options, callback) => {
      callback(null, 'out-data', 'err-data')
    })

    const result = await exec('mycmd', [], {})
    expect(result).toEqual({ stdout: 'out-data', stderr: 'err-data' })
    expect(execFileMock).toHaveBeenCalledWith(
      'mycmd',
      [],
      {},
      expect.any(Function)
    )
  })

  it('rejects when execFile returns an error', async () => {
    const error = new Error('fail')
    execFileMock.mockImplementation((cmd, args, options, callback) => {
      callback(error, '', '')
    })

    await expect(exec('badcmd', [], {})).rejects.toThrow('fail')
    expect(execFileMock).toHaveBeenCalled()
  })
})
