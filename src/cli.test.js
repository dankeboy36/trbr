const { enable } = require('debug')
const ProgressBar = require('progress')
const waitFor = require('@sadams/wait-for-expect')

const { parse } = require('./cli')
const { getTool } = require('./get')

jest.mock('debug', () => ({
  __esModule: true,
  ...jest.requireActual('debug'),
  enable: jest.fn(),
}))
jest.mock('progress')

jest.mock('./get')

describe('cli', () => {
  let mockLog
  let consoleSpy

  beforeAll(() => {
    mockLog = jest.fn()
    consoleSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((args) => mockLog(args))
    jest.mocked(getTool).mockResolvedValue({ toolPath: '' })
  })

  afterAll(() => {
    consoleSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getTool).mockResolvedValue({ toolPath: '' })
  })

  it('should get the data', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1'])

    expect(getTool).toHaveBeenCalledWith({
      tool: 'arduino-cli',
      version: '1.1.1',
      destinationFolderPath: process.cwd(),
      platform: process.platform,
      arch: process.arch,
      force: false,
      silent: false,
      verbose: false,
      onProgress: expect.any(Function),
    })
  })

  it('should provide progress', async () => {
    const currents = [0, 5, 5, 6, 10]

    const tick = jest.fn()
    jest.mocked(ProgressBar).mockImplementation(() => ({ tick }))
    jest.mocked(getTool).mockImplementation(async ({ onProgress }) => {
      currents.forEach((current) => onProgress?.({ current }))
      return { toolPath: '' }
    })

    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1'])

    // noop 0
    expect(tick).toHaveBeenNthCalledWith(1, 5) // 5
    // noop 5
    expect(tick).toHaveBeenNthCalledWith(2, 1) // 6
    expect(tick).toHaveBeenNthCalledWith(3, 4) // 10
  })

  it('should enable the log with the --verbose flag', () => {
    jest.mocked(enable).mockImplementation(() => {})

    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '--verbose'])

    expect(enable).toHaveBeenCalledWith('gat:*')
  })

  it('should omit the error stacktrace from the CLI output', async () => {
    jest.mocked(getTool).mockRejectedValueOnce(Error('my error'))

    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1'])

    await waitFor(() => expect(mockLog).toHaveBeenCalledWith('my error'))
  })

  it('should prompt --force when errors with EEXIST', async () => {
    jest
      .mocked(getTool)
      .mockRejectedValueOnce(
        Object.assign(new Error('my error'), { code: 'EEXIST' })
      )

    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1'])

    await waitFor(() => expect(mockLog).toHaveBeenNthCalledWith(1, 'my error'))

    await waitFor(() =>
      expect(mockLog).toHaveBeenNthCalledWith(
        2,
        'Use --force to overwrite existing files'
      )
    )
  })

  it('should print the reason as is when has no message', async () => {
    jest.mocked(getTool).mockRejectedValueOnce('just string')

    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1'])

    await waitFor(() => expect(mockLog).toHaveBeenCalledWith('just string'))
  })

  it('should override the destination with the -d flag', () => {
    parse([
      'node',
      'script.js',
      'get',
      'arduino-cli',
      '1.1.1',
      '-d',
      'path/to/out',
    ])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ destinationFolderPath: 'path/to/out' })
    )
  })

  it('should override the destination with the --destination-folder-path flag', () => {
    parse([
      'node',
      'script.js',
      'get',
      'arduino-cli',
      '1.1.1',
      '--destination-folder-path',
      'path/to/out',
    ])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ destinationFolderPath: 'path/to/out' })
    )
  })

  it('should override the platform with --platform flag', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '-p', 'bar'])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'bar' })
    )
  })

  it('should override the platform with -p', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '-p', 'foo'])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'foo' })
    )
  })

  it('should override the platform with --platform flag', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '-p', 'bar'])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'bar' })
    )
  })

  it('should override the arch with -a flag', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '-a', 'mirr'])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ arch: 'mirr' })
    )
  })

  it('should override the arch with --arch flag', () => {
    parse([
      'node',
      'script.js',
      'get',
      'arduino-cli',
      '1.1.1',
      '--arch',
      'murr',
    ])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ arch: 'murr' })
    )
  })

  it('should override the force with -f flag', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '-f'])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    )
  })

  it('should override the force with --force flag', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '--force'])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    )
  })

  it('should enable silent mode with the --silent flag', () => {
    parse(['node', 'script.js', 'get', 'arduino-cli', '1.1.1', '--silent'])

    expect(getTool).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true })
    )
  })
})
