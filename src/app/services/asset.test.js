// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'
import stream from 'node:stream/promises'
import { ReadableStream } from 'node:stream/web'

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { appendDotExeOnWindows } from '../../lib/os.js'
import { __tests, resolveAssetPath } from './asset.js'

const { assetsBinDirPath } = __tests

vi.mock('node:fs', async () => {
  const originalModule = await import('node:fs')
  return {
    ...originalModule,
    promises: {
      ...originalModule.promises,
      mkdir: vi.fn(originalModule.promises.mkdir),
      open: vi.fn(originalModule.promises.open),
    },
  }
})

vi.mock('node:stream/promises', async () => {
  const originalModule = await import('node:stream/promises')
  return {
    ...originalModule,
    pipeline: vi.fn(originalModule.pipeline),
  }
})

describe('asset', () => {
  /** @type {Array<()=>Promise<void>>} */
  const disposables = []

  afterAll(async () => {
    await Promise.allSettled(disposables.map((dispose) => dispose()))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  it('should copy the asset to the temp folder', async () => {
    const blob = createBlob('hello')
    const assetPath = await resolveAssetPath({
      name: 'foo',
      version: '1.0.0',
      blob,
    })
    disposables.push(() => fs.rm(assetPath))

    const assetContent = await fs.readFile(assetPath, 'utf8')

    expect(assetContent).toBe('hello')
    expect(blob.stream).toHaveBeenCalledTimes(1)
  })

  it('should be noop when the asset already exists ', async () => {
    const blob = createBlob('hello')
    const assetPath = await resolveAssetPath({
      name: 'bar',
      version: '1.0.0',
      blob,
    })
    disposables.push(() => fs.rm(assetPath))

    expect(blob.stream).toHaveBeenCalledTimes(1)

    const otherBlob = createBlob('world')
    await resolveAssetPath({
      name: 'bar',
      version: '1.0.0',
      blob: otherBlob,
    })

    expect(otherBlob.stream).not.toHaveBeenCalled()
  })

  it('should handle different versions', async () => {
    const blobV1 = createBlob('hello')
    const assetPathV1 = await resolveAssetPath({
      name: 'baz',
      version: '1.0.0',
      blob: blobV1,
    })
    disposables.push(() => fs.rm(assetPathV1))

    expect(blobV1.stream).toHaveBeenCalledTimes(1)

    const blobV2 = createBlob('world')
    const assetPathV2 = await resolveAssetPath({
      name: 'baz',
      version: '2.0.0',
      blob: blobV2,
    })
    disposables.push(() => fs.rm(assetPathV2))

    expect(blobV2.stream).toHaveBeenCalledTimes(1)
  })

  it('should set the executable mode on the asset', async () => {
    const blob = createBlob('hello')
    const assetPath = await resolveAssetPath({
      name: 'bax',
      version: '1.0.0',
      blob,
    })
    disposables.push(() => fs.rm(path.dirname(assetPath)))

    expect(() => fs.access(assetPath, fs.constants.X_OK)).not.toThrow()
  })

  it('should throw when opening the file fails', async () => {
    const name = 'open-error'
    const version = '1.0.0'

    vi.spyOn(fs, 'open').mockImplementationOnce(async () => {
      throw new Error(name)
    })

    await expect(
      resolveAssetPath({ name, version, blob: createBlob('') })
    ).rejects.toThrow(name)

    await expect(
      fs.readFile(
        path.join(assetsBinDirPath, name, version, appendDotExeOnWindows(name))
      )
    ).rejects.toThrow(/ENOENT/)
  })

  it('should throw when streaming the asset fails', async () => {
    const name = 'stream-error'
    const version = '1.0.0'

    // @ts-ignore
    const blob = /** @type {Blob} */ ({
      stream: vi.fn(() => {
        throw new Error(name)
      }),
    })

    await expect(resolveAssetPath({ name, version, blob })).rejects.toThrow(
      name
    )

    await expect(
      fs.readFile(
        path.join(assetsBinDirPath, name, version, appendDotExeOnWindows(name))
      )
    ).rejects.toThrow(/ENOENT/)
  })

  it('should throw when piping the asset to destination fails', async () => {
    const name = 'pipeline-error'
    const version = '1.0.0'

    vi.spyOn(stream, 'pipeline').mockImplementationOnce(async () => {
      throw new Error(name)
    })

    await expect(
      resolveAssetPath({ name, version, blob: createBlob('') })
    ).rejects.toThrow(name)

    await expect(
      fs.readFile(
        path.join(assetsBinDirPath, name, version, appendDotExeOnWindows(name))
      )
    ).rejects.toThrow(/ENOENT/)
  })

  it('file handle close is noop when folder creation fails', async () => {
    const name = 'mkdir-error'
    const version = '1.0.0'

    vi.spyOn(fs, 'mkdir').mockImplementationOnce(async () => {
      throw new Error(name)
    })

    vi.spyOn(fs, 'open').mockImplementationOnce(vi.fn(fs.open))

    await expect(
      resolveAssetPath({ name, version, blob: createBlob('') })
    ).rejects.toThrow(name)

    expect(fs.open).not.toHaveBeenCalled()
  })

  /** @returns {Blob} */
  function createBlob(content) {
    // @ts-ignore
    return {
      stream: vi.fn(() => {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(content))
            controller.close()
          },
        })
      }),
    }
  }
})
