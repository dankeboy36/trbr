// @ts-check

import { fileURLToPath } from 'node:url'

import { FQBN } from 'fqbn'
import { describe, expect, it, vi } from 'vitest'

import { parseAppArgs } from './appArgs.js'
import { texts } from './appArgs.text.js'

const { errors } = texts

vi.mock('./stdin.js', () => {
  return {
    readStdinString: async () => '',
  }
})
vi.mock('../lib/tool.js', async () => {
  return {
    resolveToolPath: async () => '/path/to/gdb',
  }
})
vi.mock('../lib/decode/decodeParams.js', async () => {
  return {
    createDecodeParams: vi.fn(async (params) => {
      if ('toolPath' in params && params.toolPath) {
        return {
          elfPath: params.elfPath,
          targetArch: params.targetArch || 'xtensa',
          toolPath: params.toolPath,
        }
      } else {
        return {
          elfPath: params.elfPath,
          targetArch: 'avr',
          fqbn: params.fqbn,
        }
      }
    }),
  }
})
vi.mock('./arduino.js', async () => {
  return {
    resolveArduinoCliPath: vi.fn(async () => 'arduino-cli'),
  }
})
vi.mock('../lib/exec.js', async () => {
  return {
    exec: async () => ({
      stdout: '{"build_properties":["tools.xtensa-lx106-elf-gcc.path=yes"]}',
      stderr: '',
    }),
  }
})
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    access: async () => {},
  }
})

describe('createDecodeParams', () => {
  describe('parseAppArgs', () => {
    it('should fail when elfPath is missing', async () => {
      await expect(() => parseAppArgs({ elfPath: '' })).rejects.toThrow(
        errors.elfPathRequired
      )
    })

    it('should error when neither tool path nor FQBN is provided', async () => {
      await expect(() => parseAppArgs({ elfPath: 'test.elf' })).rejects.toThrow(
        errors.toolPathOrFqbnRequired
      )
    })

    it('should error when both tool path and FQBN are provided', async () => {
      await expect(() =>
        parseAppArgs({ elfPath: 'test.elf', toolPath: 'tool', fqbn: 'a:b:c' })
      ).rejects.toThrow(errors.toolPathAndFqbnExclusive)
    })

    it('should default to xtensa when tool path is provided without targetArch', async () => {
      const result = await parseAppArgs({
        elfPath: 'test.elf',
        toolPath: 'tool',
      })

      expect(result).toStrictEqual({
        decodeParams: {
          elfPath: 'test.elf',
          targetArch: 'xtensa',
          toolPath: 'tool',
        },
        decodeInput: '',
        noColor: true,
      })
    })

    it('should error when tool path is provided with invalid targetArch', async () => {
      await expect(() =>
        parseAppArgs({
          elfPath: 'test.elf',
          toolPath: 'tool',
          targetArch: 'foo',
        })
      ).rejects.toThrow(errors.targetArchInvalid)
    })

    it('should error when FQBN and targetArch are provided', async () => {
      await expect(() =>
        parseAppArgs({
          elfPath: 'test.elf',
          fqbn: 'a:b:c',
          targetArch: 'xtensa',
        })
      ).rejects.toThrow(errors.targetArchAndFqbnExclusive)
    })

    it('should error when arduinoCliConfigPath is provided without FQBN', async () => {
      await expect(() =>
        parseAppArgs({
          elfPath: 'test.elf',
          toolPath: 'tool',
          targetArch: 'xtensa',
          arduinoCliConfigPath: 'config',
        })
      ).rejects.toThrow(errors.arduinoCliConfigRequiresFqbn)
    })

    it('should error when additionalUrls is provided without FQBN', async () => {
      await expect(() =>
        parseAppArgs({
          elfPath: 'test.elf',
          toolPath: 'tool',
          targetArch: 'xtensa',
          additionalUrls: 'urls',
        })
      ).rejects.toThrow(errors.additionalUrlsRequiresFqbn)
    })

    it('should read the trace input from a file', async () => {
      // @ts-ignore
      const __filename = fileURLToPath(import.meta.url)
      const result = await parseAppArgs({
        elfPath: 'test.elf',
        toolPath: 'tool',
        targetArch: 'xtensa',
        input: __filename,
      })

      expect(result).toStrictEqual({
        decodeParams: {
          elfPath: 'test.elf',
          targetArch: 'xtensa',
          toolPath: 'tool',
        },
        decodeInput: {
          inputPath: __filename,
        },
        noColor: true,
      })
    })

    it('should parse the tool path options', async () => {
      const result = await parseAppArgs({
        elfPath: 'test.elf',
        toolPath: 'tool',
        targetArch: 'xtensa',
      })

      expect(result).toStrictEqual({
        decodeParams: {
          elfPath: 'test.elf',
          targetArch: 'xtensa',
          toolPath: 'tool',
        },
        decodeInput: '',
        noColor: true,
      })
    })

    it('should parse the FQBN options', async () => {
      const result = await parseAppArgs({
        elfPath: 'test.elf',
        fqbn: 'a:esp32:c',
      })

      expect(result).toStrictEqual({
        decodeParams: {
          elfPath: 'test.elf',
          targetArch: 'avr',
          fqbn: new FQBN('a:esp32:c'),
        },
        decodeInput: '',
        noColor: true,
      })
    })
  })
})
