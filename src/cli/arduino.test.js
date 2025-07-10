// @ts-check

import fs, { constants } from 'node:fs/promises'
import sea from 'node:sea'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveArduinoCliPath } from './arduino.js'
import { resolveAssetPath } from './asset.js'

vi.mock('node:sea')
vi.mock('./asset.js', async () => {
  return {
    resolveAssetPath: vi.fn().mockResolvedValue('/mock/path/to/arduino-cli'),
  }
})

describe('arduino', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should resolve the asset path when running in sea', async () => {
    vi.mocked(sea.isSea).mockReturnValue(true)
    // @ts-ignore
    vi.mocked(sea.getAssetAsBlob).mockResolvedValue({
      stream: vi.fn().mockReturnValue(new ReadableStream()),
    })
    await resolveArduinoCliPath()

    expect(resolveAssetPath).toHaveBeenCalledWith({
      name: 'arduino-cli',
      version: expect.any(String),
      blob: expect.any(Object),
    })
  })

  it('should resolve the asset path when not running in sea', async () => {
    vi.mocked(sea.isSea).mockReturnValue(false)
    const { resolveAssetPath } = await import('./asset.js')

    const cliPath = await resolveArduinoCliPath()
    expect(resolveAssetPath).not.toHaveBeenCalled()

    await expect(fs.access(cliPath, constants.X_OK)).resolves.toBeUndefined()
  })
})
