// @ts-check

import { x } from 'tinyexec'
import { describe, expect, it, vi } from 'vitest'

import { exec } from './exec.js'

vi.mock('tinyexec', async () => {
  const originalModule = await import('tinyexec')
  return {
    ...originalModule,
    x: vi.fn(),
  }
})

describe('exec', () => {
  it('should always call with throwOnError: true', async () => {
    vi.mocked(x).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })

    await exec('command', ['arg'], {
      nodeOptions: { cwd: 'cwd' },
      throwOnError: false,
    })

    expect(x).toHaveBeenCalledWith('command', ['arg'], {
      nodeOptions: { cwd: 'cwd' },
      throwOnError: true,
    })
  })
})
