// @ts-check

import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseOptions } from './options.js'
import { texts } from './options.text.js'

const { errors } = texts

describe('options', () => {
  describe('parseOptions', () => {
    it('should fail when elfPath is missing', async () => {
      await expect(() =>
        parseOptions({ options: { elfPath: '' } })
      ).rejects.toThrow(errors.elfPathRequired)
    })

    it('should error when neither tool path nor FQBN is provided', async () => {
      await expect(() =>
        parseOptions({ options: { elfPath: 'test.elf' } })
      ).rejects.toThrow(errors.toolPathOrFqbnRequired)
    })

    it('should error when both tool path and FQBN are provided', async () => {
      await expect(() =>
        parseOptions({
          options: { elfPath: 'test.elf', toolPath: 'tool', fqbn: 'fqbn' },
        })
      ).rejects.toThrow(errors.toolPathAndFqbnExclusive)
    })

    it('should default to xtensa when tool path is provided without targetArch', async () => {
      const result = await parseOptions({
        options: { elfPath: 'test.elf', toolPath: 'tool' },
      })

      expect(result).toStrictEqual({
        elfPath: 'test.elf',
        toolPathOrFqbn: 'tool',
        targetArch: 'xtensa',
        traceInput: '',
        arduinoCliConfig: '',
        additionalUrls: '',
        color: true,
      })
    })

    it('should error when tool path is provided with invalid targetArch', async () => {
      await expect(() =>
        parseOptions({
          options: { elfPath: 'test.elf', toolPath: 'tool', targetArch: 'foo' },
        })
      ).rejects.toThrow(errors.targetArchInvalid)
    })

    it('should error when FQBN and targetArch are provided', async () => {
      await expect(() =>
        parseOptions({
          options: { elfPath: 'test.elf', fqbn: 'fqbn', targetArch: 'xtensa' },
        })
      ).rejects.toThrow(errors.targetArchAndFqbnExclusive)
    })

    it('should error when arduinoCliConfig is provided without FQBN', async () => {
      await expect(() =>
        parseOptions({
          options: {
            elfPath: 'test.elf',
            toolPath: 'tool',
            targetArch: 'xtensa',
            arduinoCliConfig: 'config',
          },
        })
      ).rejects.toThrow(errors.arduinoCliConfigRequiresFqbn)
    })

    it('should error when additionalUrls is provided without FQBN', async () => {
      await expect(() =>
        parseOptions({
          options: {
            elfPath: 'test.elf',
            toolPath: 'tool',
            targetArch: 'xtensa',
            additionalUrls: 'urls',
          },
        })
      ).rejects.toThrow(errors.additionalUrlsRequiresFqbn)
    })

    it('should error when the input ENOENT', async () => {
      await expect(() =>
        parseOptions({
          options: {
            elfPath: 'test.elf',
            toolPath: 'tool',
            targetArch: 'xtensa',
            input: 'nonexistent',
          },
        })
      ).rejects.toThrow(/ENOENT/)
    })

    it('should read the trace input from a file', async () => {
      // @ts-ignore
      const __filename = fileURLToPath(import.meta.url)
      const traceInput = await fs.readFile(__filename, 'utf8')
      const result = await parseOptions({
        options: {
          elfPath: 'test.elf',
          toolPath: 'tool',
          targetArch: 'xtensa',
          input: __filename,
        },
      })

      expect(result).toStrictEqual({
        elfPath: 'test.elf',
        toolPathOrFqbn: 'tool',
        targetArch: 'xtensa',
        traceInput,
        arduinoCliConfig: '',
        additionalUrls: '',
        color: true,
      })
    })

    it('should parse the tool path options', async () => {
      const result = await parseOptions({
        options: {
          elfPath: 'test.elf',
          toolPath: 'tool',
          targetArch: 'xtensa',
        },
      })

      expect(result).toStrictEqual({
        elfPath: 'test.elf',
        toolPathOrFqbn: 'tool',
        targetArch: 'xtensa',
        traceInput: '',
        arduinoCliConfig: '',
        additionalUrls: '',
        color: true,
      })
    })

    it('should parse the FQBN options', async () => {
      const result = await parseOptions({
        options: {
          elfPath: 'test.elf',
          fqbn: 'fqbn',
        },
      })

      expect(result).toStrictEqual({
        elfPath: 'test.elf',
        toolPathOrFqbn: 'fqbn',
        targetArch: '',
        traceInput: '',
        arduinoCliConfig: '',
        additionalUrls: '',
        color: true,
      })
    })
  })
})
