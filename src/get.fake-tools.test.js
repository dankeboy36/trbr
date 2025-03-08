const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const { Readable } = require('node:stream')

const tmp = require('tmp-promise')

const { download } = require('./download')
const { getTool } = require('./get')
const {
  createToolBasename,
  getArchiveType,
  getDownloadUrl,
} = require('./tools')

jest.mock('./download')
jest.mock('./tools')

const itIsNotWin32 = process.platform !== 'win32' ? it : it.skip

describe('get', () => {
  let tempDirPath
  let cleanup

  beforeEach(async () => {
    const tmpDirResult = await tmp.dir({
      keep: false,
      tries: 3,
      unsafeCleanup: true,
    })
    tempDirPath = tmpDirResult.path
    cleanup = tmpDirResult.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  it('should preserve the executable flag of the tool (gzip)', async () => {
    jest
      .mocked(download)
      .mockResolvedValue(loadFakeToolByName('fake-tool.tar.gz'))
    jest.mocked(createToolBasename).mockReturnValue('fake-tool')
    jest.mocked(getArchiveType).mockReturnValue('gzip')

    const { toolPath } = await getTool({
      tool: '',
      version: '',
      destinationFolderPath: tempDirPath,
    })

    expect(fs.access(toolPath, fs.constants.X_OK)).resolves.toBeUndefined()
  })

  it('should preserve the executable flag of the tool (zip)', async () => {
    jest.mocked(download).mockResolvedValue(loadFakeToolByName('fake-tool.zip'))
    jest.mocked(createToolBasename).mockReturnValue('fake-tool.bat')
    jest.mocked(getArchiveType).mockReturnValue('zip')

    const { toolPath } = await getTool({
      tool: '',
      version: '',
      destinationFolderPath: tempDirPath,
    })

    expect(fs.access(toolPath, fs.constants.X_OK)).resolves.toBeUndefined()
  })

  it('should preserve the executable flag of the non-Arduino tool (bzip2)', async () => {
    jest
      .mocked(download)
      .mockResolvedValue(loadFakeToolByName('fake-tool-clang.tar.bz2'))
    jest.mocked(createToolBasename).mockReturnValue('fake-tool')
    jest.mocked(getArchiveType).mockReturnValue('bzip2')

    const { toolPath } = await getTool({
      tool: '',
      version: '',
      destinationFolderPath: tempDirPath,
    })

    expect(fs.access(toolPath, fs.constants.X_OK)).resolves.toBeUndefined()
  })

  it('should preserve the executable flag of the non-Arduino tool on Windows (bzip2)', async () => {
    jest
      .mocked(download)
      .mockResolvedValue(loadFakeToolByName('fake-tool-clang-win32.tar.bz2'))
    jest.mocked(createToolBasename).mockReturnValue('fake-tool.bat')
    jest.mocked(getArchiveType).mockReturnValue('bzip2')

    const { toolPath } = await getTool({
      tool: '',
      version: '',
      destinationFolderPath: tempDirPath,
    })

    expect(fs.access(toolPath, fs.constants.X_OK)).resolves.toBeUndefined()
  })

  describe('zip-slip', () => {
    itIsNotWin32('should error (zip)', async () => {
      jest
        .mocked(download)
        .mockResolvedValue(loadFakeToolByName('zip-slip/evil.zip'))
      jest.mocked(createToolBasename).mockReturnValue('evil.sh')
      jest.mocked(getArchiveType).mockReturnValue('zip')

      await expect(
        getTool({
          tool: '',
          version: '',
          destinationFolderPath: tempDirPath,
        })
      ).rejects.toThrow(/invalid archive entry/gi)
    })

    itIsNotWin32('should error (tar.gz)', async () => {
      jest
        .mocked(download)
        .mockResolvedValue(loadFakeToolByName('zip-slip/evil.tar.gz'))
      jest.mocked(createToolBasename).mockReturnValue('evil.sh')
      jest.mocked(getArchiveType).mockReturnValue('gzip')

      await expect(
        getTool({
          tool: '',
          version: '',
          destinationFolderPath: tempDirPath,
        })
      ).rejects.toThrow(/invalid archive entry/gi)
    })

    itIsNotWin32('should error (tar.bz2)', async () => {
      jest
        .mocked(download)
        .mockResolvedValue(loadFakeToolByName('zip-slip/evil.tar.bz2'))
      jest.mocked(createToolBasename).mockReturnValue('evil.sh')
      jest.mocked(getArchiveType).mockReturnValue('bzip2')

      await expect(
        getTool({
          tool: '',
          version: '',
          destinationFolderPath: tempDirPath,
        })
      ).rejects.toThrow(/invalid archive entry/gi)
    })
  })

  describe('with fake server', () => {
    let server

    beforeAll(async () => {
      server = http.createServer(async (_, res) => {
        const { body, length } = await loadFakeToolByName('fake-tool.tar.gz')
        res.setHeader('Content-Type', 'text/plain')
        res.setHeader('Content-Length', length)
        body.pipe(res)
      })
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    })

    afterAll(() => {
      server?.close()
    })

    it('should cancel the download', async () => {
      const { address, port } = server.address()
      jest.mocked(download).mockImplementation(({ url, signal }) => {
        const originalModule = jest.requireActual('./download')
        return originalModule.download({ url, signal })
      })
      jest.mocked(getDownloadUrl).mockReturnValue(`http://${address}:${port}`)
      jest.mocked(createToolBasename).mockReturnValue('fake-tool')
      jest.mocked(getArchiveType).mockReturnValue('gzip')

      const controller = new AbortController()
      const { signal } = controller
      controller.abort()

      await expect(
        getTool({
          tool: '',
          version: '',
          destinationFolderPath: tempDirPath,
          signal,
        })
      ).rejects.toThrow(/abort/)

      expect(fs.readdir(tempDirPath)).resolves.toStrictEqual([])
    })

    it('should support progress', async () => {
      const { address, port } = server.address()
      jest.mocked(download).mockImplementation(({ url, signal }) => {
        const originalModule = jest.requireActual('./download')
        return originalModule.download({ url, signal })
      })
      jest.mocked(getDownloadUrl).mockReturnValue(`http://${address}:${port}`)
      jest.mocked(createToolBasename).mockReturnValue('fake-tool')
      jest.mocked(getArchiveType).mockReturnValue('gzip')
      const onProgress = jest.fn()

      await getTool({
        tool: '',
        version: '',
        destinationFolderPath: tempDirPath,
        onProgress,
      })

      expect(fs.readdir(tempDirPath)).resolves.toStrictEqual(['fake-tool'])
      expect(onProgress).toHaveBeenNthCalledWith(1, { current: 50 })
      expect(onProgress).toHaveBeenNthCalledWith(2, { current: 100 })
    })
  })

  async function loadFakeToolByName(fakeToolName) {
    const originalModule = jest.requireActual('node:fs/promises')
    const toolPath = path.join(__dirname, '../fake-tools', fakeToolName)
    const buffer = await originalModule.readFile(toolPath)
    const readable = Readable.from(buffer)
    return {
      body: readable,
      length: buffer.length,
    }
  }
})
