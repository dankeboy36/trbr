const { execFile: execFileCallback } = require('node:child_process')

const { execFile } = require('./execFile')

const mockedExecFileCallback = jest.mocked(execFileCallback)

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: jest.fn((_file, _args, callback) => {
    callback(null, { stdout: 'execution output', stderr: '' })
  }),
}))

describe('execFile', () => {
  beforeEach(() => {
    mockedExecFileCallback.mockReset()
  })

  it('should execute the file successfully', async () => {
    const mockStdout = ' untrimmed output '
    mockedExecFileCallback.mockImplementation((_file, _args, callback) =>
      callback(null, { stdout: mockStdout, stderr: '' })
    )

    const result = await execFile('testFile', ['arg1', 'arg2'])

    expect(result).toEqual(mockStdout.trim())
    expect(mockedExecFileCallback).toHaveBeenCalledWith(
      'testFile',
      ['arg1', 'arg2'],
      expect.any(Function)
    )
  })

  it('should use an empty array as the default args', async () => {
    mockedExecFileCallback.mockImplementation((_file, _args, callback) =>
      callback(null, { stdout: '', stderr: '' })
    )

    await execFile('testFile')

    expect(mockedExecFileCallback).toHaveBeenCalledWith(
      'testFile',
      [],
      expect.any(Function)
    )
  })

  it('should re-throw the error', async () => {
    const mockError = new Error('an error')
    mockedExecFileCallback.mockImplementation((_file, _args, callback) =>
      callback(mockError, { stdout: '', stderr: '' })
    )

    await expect(execFile('testFile', [])).rejects.toThrow(mockError)
  })

  it('should return the stderr when errors with canError', async () => {
    const mockError = Object.assign(new Error('an error'), { stderr: 'stderr' })
    mockedExecFileCallback.mockImplementation((_file, _args, callback) =>
      callback(mockError, { stdout: '', stderr: '' })
    )

    const result = await execFile('testFile', [], true)
    expect(result).toEqual('stderr')
  })
})
