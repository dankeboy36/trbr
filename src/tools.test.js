const {
  createToolBasename,
  getArchiveType,
  getDownloadUrl,
} = require('./tools')

describe('tools', () => {
  describe('createToolBasename', () => {
    it('should return tool name with .exe extension on Windows', () => {
      expect(createToolBasename({ tool: 'fake', platform: 'win32' })).toBe(
        'fake.exe'
      )
    })

    it('should return tool name as is on non-Windows', () => {
      expect(createToolBasename({ tool: 'fake', platform: 'not win32' })).toBe(
        'fake'
      )
    })
  })

  describe('getArchiveType', () => {
    it('should be bzip2 regardless of the platform when non-Arduino tool', () => {
      expect(
        getArchiveType({ tool: 'clangd', platform: process.platform })
      ).toBe('bzip2')
    })

    it('should be zip if on Windows and Arduino tool', () => {
      expect(getArchiveType({ tool: 'arduino-cli', platform: 'win32' })).toBe(
        'zip'
      )
    })

    it('should be gzip if on non-Windows and Arduino tool', () => {
      expect(getArchiveType({ tool: 'arduino-cli', platform: 'linux' })).toBe(
        'gzip'
      )
    })
  })

  describe('getDownloadUrl', () => {
    it('should return correct tool name for supported tools', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'win32',
        arch: 'x64',
      })
      const result = getDownloadUrl(params)
      expect(result).toEqual(
        'https://downloads.arduino.cc/arduino-cli/arduino-cli_0.18.3_Windows_64bit.zip'
      )
    })

    it('should throw an error for unsupported tools', () => {
      const params = /** @type {const} */ ({
        tool: 'unsupported-tool',
        version: '1.0.0',
        platform: 'win32',
        arch: 'x64',
      })
      expect(() => getDownloadUrl(params)).toThrow(
        'Unsupported tool: unsupported-tool'
      )
    })

    it('should return correct tool name for macOS Intel', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'darwin',
        arch: 'x64',
      })
      const result = getDownloadUrl(params)
      expect(result).toEqual(
        'https://downloads.arduino.cc/arduino-cli/arduino-cli_0.18.3_macOS_64bit.tar.gz'
      )
    })

    it('should return correct tool name for macOS ARM64', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'darwin',
        arch: 'arm64',
      })
      const result = getDownloadUrl(params)
      expect(result).toEqual(
        'https://downloads.arduino.cc/arduino-cli/arduino-cli_0.18.3_macOS_ARM64.tar.gz'
      )
    })

    it('should return correct tool name for Linux x64', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'linux',
        arch: 'x64',
      })
      const result = getDownloadUrl(params)
      expect(result).toEqual(
        'https://downloads.arduino.cc/arduino-cli/arduino-cli_0.18.3_Linux_64bit.tar.gz'
      )
    })

    it('should return correct tool name for Linux (Raspberry Pi - arm7vl)', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'linux',
        arch: 'arm',
      })
      const result = getDownloadUrl(params)
      expect(result).toEqual(
        'https://downloads.arduino.cc/arduino-cli/arduino-cli_0.18.3_Linux_ARMv7.tar.gz'
      )
    })

    it('should return correct tool name for Linux ARM64', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'linux',
        arch: 'arm64',
      })
      const result = getDownloadUrl(params)
      expect(result).toEqual(
        'https://downloads.arduino.cc/arduino-cli/arduino-cli_0.18.3_Linux_ARM64.tar.gz'
      )
    })

    it('should use tool in the URL for clangd on non-Windows', () => {
      const params = /** @type {const} */ ({
        tool: 'clangd',
        version: '0.18.3',
        platform: 'linux',
        arch: 'x64',
      })
      const result = getDownloadUrl(params)
      expect(result).toEqual(
        'https://downloads.arduino.cc/tools/clangd_0.18.3_Linux_64bit.tar.bz2'
      )
    })

    it('should throw an error for unsupported platform', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'unsupported-platform',
        arch: 'x64',
      })
      expect(() => getDownloadUrl(params)).toThrow(
        'Unsupported platform: unsupported-platform, arch: x64'
      )
    })

    it('should throw an error for unsupported architecture', () => {
      const params = /** @type {const} */ ({
        tool: 'arduino-cli',
        version: '0.18.3',
        platform: 'linux',
        arch: 'unsupported-arch',
      })
      expect(() => getDownloadUrl(params)).toThrow(
        'Unsupported platform: linux, arch: unsupported-arch'
      )
    })
  })
})
