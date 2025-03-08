const fs = require('node:fs/promises')
const path = require('node:path')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const { download } = require('./download')
const { extract } = require('./extract')
const { getTool } = require('./get')
const { createLog } = require('./log')
const {
  createToolBasename,
  getDownloadUrl,
  isArduinoTool,
  getArchiveType,
} = require('./tools')
const { ProgressCounter } = require('./progress')

jest.mock('node:fs')
jest.mock('node:fs/promises')
jest.mock('node:stream/promises')
jest.mock('./download')
jest.mock('./extract')
jest.mock('./log')
jest.mock('./tools')

describe('get', () => {
  const log = jest.fn()
  const mockTool = 'mockTool'
  const mockVersion = '1.0.0'
  const mockDestinationFolderPath = '/mock/destination'
  const mockPlatform = 'linux'
  const mockArch = 'x64'
  const mockData = '1, 2, 3, 4, 5'
  const mockExtractResult = {
    destinationPath: '/mock/extracted',
    cleanup: jest.fn(),
  }
  const mockedFd = {
    createWriteStream: jest.fn(),
  }

  beforeEach(() => {
    jest.mocked(createLog).mockReturnValue(log)
    jest.mocked(download).mockResolvedValue({
      body: Readable.from(mockData),
      length: 111,
    })
    jest.mocked(extract).mockResolvedValue(mockExtractResult)
    jest
      .mocked(getDownloadUrl)
      .mockReturnValue('https://downloads.arduino.cc/mock')
    jest.clearAllMocks()
    jest.mocked(isArduinoTool).mockReturnValue(false)
    jest.mocked(fs.open).mockReturnValue(mockedFd)
    jest.mocked(fs.rm).mockResolvedValue(Promise.resolve())
    jest.mocked(pipeline).mockReturnValue(Promise.resolve())
    jest.mocked(createToolBasename).mockReturnValue(mockTool)
  })

  it('should open a file, download, extract, and pipe the tool to the file', async () => {
    jest.mocked(getDownloadUrl).mockImplementation((params) => {
      const toolsModule = jest.requireActual('./tools')
      return toolsModule.getDownloadUrl(params)
    })
    jest.mocked(isArduinoTool).mockImplementation((tool) => {
      const toolsModule = jest.requireActual('./tools')
      return toolsModule.isArduinoTool(tool)
    })
    jest.mocked(createToolBasename).mockReturnValue('arduino-cli')
    jest.mocked(getArchiveType).mockReturnValue('zip')

    const result = await getTool({
      tool: 'arduino-cli',
      version: mockVersion,
      destinationFolderPath: mockDestinationFolderPath,
      platform: mockPlatform,
      arch: mockArch,
    })

    expect(fs.open).toHaveBeenCalledWith(
      path.join(mockDestinationFolderPath, 'arduino-cli'),
      'wx',
      511
    )
    expect(download).toHaveBeenCalledWith({
      url: 'https://downloads.arduino.cc/arduino-cli/arduino-cli_1.0.0_Linux_64bit.tar.gz',
    })
    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.any(Readable),
        archiveType: 'zip',
        counter: expect.any(ProgressCounter),
      })
    )
    expect(mockExtractResult.cleanup).toHaveBeenCalled()
    expect(result.toolPath).toBe(
      path.join(mockDestinationFolderPath, 'arduino-cli')
    )
  })

  it('should throw an error if download fails', async () => {
    const err = new Error('download error')
    jest.mocked(download).mockRejectedValue(err)

    await expect(
      getTool({
        tool: mockTool,
        version: mockVersion,
        destinationFolderPath: mockDestinationFolderPath,
      })
    ).rejects.toThrow(err)
  })

  it('should overwrite the tool if force is true', async () => {
    await getTool({
      tool: mockTool,
      version: mockVersion,
      destinationFolderPath: mockDestinationFolderPath,
      force: true,
    })

    expect(fs.open).toHaveBeenCalledWith(
      path.join(mockDestinationFolderPath, mockTool),
      'w',
      511
    )
  })

  it('should throw an error if tool already exists and force is false', async () => {
    const err = Object.assign(new Error(), { code: 'EEXIST' })
    jest.mocked(fs.open).mockRejectedValue(err)

    await expect(
      getTool({
        tool: mockTool,
        version: mockVersion,
        destinationFolderPath: mockDestinationFolderPath,
      })
    ).rejects.toThrow(err)
  })
})
