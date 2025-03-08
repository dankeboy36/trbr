const fs = require('node:fs/promises')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const { extract: extractTar } = require('tar-stream')
const { dir } = require('tmp-promise')
const { Parse: ParseZip } = require('unzip-stream')

const { extract } = require('./extract')
const { createLog } = require('./log')

jest.mock('node:fs/promises')
jest.mock('node:stream/promises')

jest.mock('tmp-promise')
jest.mock('tar-stream')
jest.mock('unzip-stream')
jest.mock('unbzip2-stream')

jest.mock('node:os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp'),
}))

jest.mock('./log.js', () => ({
  createLog: jest.fn(),
}))

describe('extract', () => {
  const mockTempDir = '/tmp/gat-12345'
  let log
  let mockTarExtract
  let mockParseZip
  let mockBzip2
  let mockCleanup

  beforeEach(() => {
    log = jest.fn()
    mockTarExtract = {
      on: jest.fn(),
    }
    mockParseZip = jest.fn()
    mockBzip2 = jest.fn()
    mockCleanup = jest.fn()

    jest
      .mocked(dir)
      .mockResolvedValue({ path: mockTempDir, cleanup: mockCleanup })

    jest.mocked(createLog).mockReturnValue(log)
    jest.mocked(extractTar).mockReturnValue(mockTarExtract)
    jest.mocked(ParseZip).mockReturnValue(mockParseZip)
    jest.mocked(pipeline).mockResolvedValue()
    jest.clearAllMocks()
  })

  it('should extract buffer to a temporary directory', async () => {
    const source = Readable.from([1, 2, 3])

    const result = await extract({ source, archiveType: 'zip' })

    expect(dir).toHaveBeenCalledWith({
      prefix: 'gat-',
      unsafeCleanup: true,
      tries: 3,
      keep: false,
    })
    expect(ParseZip).toHaveBeenCalled()
    expect(result.destinationPath).toBe(mockTempDir)
  })

  it('should extract gzip tar buffer to a temporary directory', async () => {
    const source = Readable.from([1, 2, 3])

    const result = await extract({ source, archiveType: 'gzip' })

    expect(extractTar).toHaveBeenCalled()
    expect(result.destinationPath).toBe(mockTempDir)
  })

  it('should extract bzip2 tar buffer to a temporary directory', async () => {
    const source = Readable.from([1, 2, 3])

    const result = await extract({ source, archiveType: 'bzip2' })

    expect(extractTar).toHaveBeenCalled()
    expect(result.destinationPath).toBe(mockTempDir)
  })

  it('should throw an error for unsupported archive type', async () => {
    const source = Readable.from([1, 2, 3])

    await expect(
      extract({ source, archiveType: 'unsupported' })
    ).rejects.toThrow('Unsupported archive type: unsupported')
  })

  it('should cleanup the extracted files (on success)', async () => {
    const source = Readable.from([1, 2, 3])

    jest.mocked(fs.rm).mockResolvedValue()

    const result = await extract({ source, archiveType: 'zip' })
    await result.cleanup()

    expect(mockCleanup).toHaveBeenCalled()
  })

  it('should cleanup the extracted files (on error)', async () => {
    const source = Readable.from([1, 2, 3])
    const error = new Error('decompress error')
    jest.mocked(ParseZip).mockImplementation(() => {
      throw error
    })

    await expect(extract({ source, archiveType: 'zip' })).rejects.toThrow(error)

    expect(log).toHaveBeenCalledWith(
      'Error extracting to',
      expect.any(String),
      error
    )
    expect(mockCleanup).toHaveBeenCalled()
  })

  it('should extract zip buffer to a temporary directory and log extraction', async () => {
    const source = Readable.from([1, 2, 3])

    const result = await extract({ source, archiveType: 'zip' })

    expect(ParseZip).toHaveBeenCalled()
    expect(result.destinationPath).toBe(mockTempDir)
    expect(log).toHaveBeenCalledWith('extracting to ', mockTempDir)
  })

  it('should extract tar buffer with strip to a temporary directory and log extraction', async () => {
    const source = Readable.from([1, 2, 3])

    const result = await extract({ source, archiveType: 'bzip2' })

    expect(extractTar).toHaveBeenCalled()
    expect(result.destinationPath).toBe(mockTempDir)
    expect(log).toHaveBeenCalledWith('extracting to ', mockTempDir)
  })
})
