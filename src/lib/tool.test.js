// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'

import { FQBN } from 'fqbn'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { __tests as __riscvtests } from './decode/riscv.js'
import { exec } from './exec.js'
import { appendDotExeOnWindows } from './os.js'
import { __tests, findToolPath, isRiscvTargetArch } from './tool.js'

const { parseProperty } = __tests
const { gdbRegsInfo } = __riscvtests

vi.mock('node:fs', async () => {
  const originalModule = await import('node:fs')
  return {
    ...originalModule,
    promises: {
      ...originalModule.promises,
      access: vi.fn(originalModule.promises.access),
    },
  }
})

vi.mock('./arduino.js', async () => {
  return {
    resolveArduinoCliPath: vi.fn(async () => 'arduino-cli'),
  }
})
vi.mock('./exec.js')

describe('tool', () => {
  describe('findToolPath', () => {
    const testParams = [
      {
        fqbn: 'x:esp8266:y',
        toolProperty: 'runtime.tools.xtensa-lx106-elf-gcc.path',
        toolValue: 'tool',
        expected: 'xtensa-lx106-elf-gdb',
      },
      {
        fqbn: 'x:esp8266:y',
        toolProperty: 'tools.xtensa-lx106-elf-gcc.path',
        toolValue: 'tool',
        expected: 'xtensa-lx106-elf-gdb',
      },
      {
        fqbn: 'x:esp32:y',
        buildTarch: 'xtensa',
        buildTarget: 'esp32',
        toolProperty: 'runtime.tools.xtensa-esp32-elf-gcc.path',
        toolValue: 'tool',
        expected: 'xtensa-esp32-elf-gdb',
      },
      {
        fqbn: 'x:esp32:y',
        buildTarch: 'xtensa',
        buildTarget: 'esp32',
        toolProperty: 'tools.xtensa-esp32-elf-gcc.path',
        toolValue: 'tool',
        expected: 'xtensa-esp32-elf-gdb',
      },
      {
        fqbn: 'x:esp32:y',
        buildTarget: 'esp32s2',
        toolProperty: 'runtime.tools.xtensa-esp-elf-gdb.path',
        toolValue: 'tool',
        expected: 'xtensa-esp32s2-elf-gdb',
      },
      {
        fqbn: 'x:esp32:y',
        buildTarch: 'riscv32',
        buildTarget: 'esp',
        toolProperty: 'tools.riscv32-esp-elf-gdb.path',
        toolValue: 'tool',
        expected: 'riscv32-esp-elf-gdb',
      },
    ]

    testParams.map(
      ({ expected, fqbn, buildTarch, buildTarget, toolProperty, toolValue }) =>
        it(`from ${toolProperty}`, async () => {
          vi.spyOn(fs, 'access').mockImplementationOnce(async (pathLike) => {
            if (
              path.join('tool', 'bin', appendDotExeOnWindows(expected)) ===
              pathLike
            ) {
              // OK
            } else {
              throw new Error('ENOENT')
            }
          })
          const build_properties = [`${toolProperty}=${toolValue}`]
          if (buildTarch) {
            build_properties.push(`build.tarch=${buildTarch}`)
          }
          if (buildTarget) {
            build_properties.push(`build.target=${buildTarget}`)
          }

          vi.mocked(exec).mockResolvedValueOnce({
            stdout: JSON.stringify({ build_properties }),
            stderr: '',
            exitCode: 0,
          })

          const toolPath = await findToolPath({
            arduinoCliPath: 'arduino-cli',
            fqbn: new FQBN(fqbn),
          })
          expect(toolPath).toEqual(
            path.join('tool', 'bin', appendDotExeOnWindows(expected))
          )
        })
    )

    it('should use accept the Arduino CLI config path', async () => {
      vi.mocked(exec).mockResolvedValueOnce({
        stdout: JSON.stringify({ build_properties: [] }),
        stderr: '',
        exitCode: 0,
      })

      await expect(
        findToolPath({
          arduinoCliPath: 'arduino-cli',
          fqbn: new FQBN('x:esp32:y'),
          arduinoCliConfigPath: 'config',
        })
      ).rejects.toThrow()

      expect(exec).toHaveBeenCalledWith(
        'arduino-cli',
        expect.arrayContaining(['--config-file', 'config']),
        expect.any(Object)
      )
    })

    it('should use accept the additional URLs', async () => {
      vi.mocked(exec).mockResolvedValueOnce({
        stdout: JSON.stringify({ build_properties: [] }),
        stderr: '',
        exitCode: 0,
      })

      await expect(
        findToolPath({
          arduinoCliPath: 'arduino-cli',
          fqbn: new FQBN('x:esp32:y'),
          additionalUrls: 'url1,url2',
        })
      ).rejects.toThrow()

      expect(exec).toHaveBeenCalledWith(
        'arduino-cli',
        expect.arrayContaining(['--additional-urls', 'url1,url2']),
        expect.any(Object)
      )
    })

    it('should error when unsupported architecture', async () => {
      vi.mocked(exec).mockResolvedValueOnce({
        stdout: JSON.stringify({ build_properties: [] }),
        stderr: '',
        exitCode: 0,
      })

      await expect(
        findToolPath({
          arduinoCliPath: 'arduino-cli',
          fqbn: new FQBN('x:unsupported:y'),
        })
      ).rejects.toThrow("Unsupported board architecture: 'x:unsupported:y'")
    })
  })

  describe('parseProperty', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    it('should ignore invalid entry', () => {
      expect(parseProperty('key_value')).toBeUndefined()
    })

    it('should ignore falsy key', () => {
      expect(parseProperty('=value')).toBeUndefined()
    })
  })

  describe('isRiscvTargetArch', () => {
    it('should be a valid target', () => {
      Object.keys(gdbRegsInfo).forEach((target) => {
        expect(isRiscvTargetArch(target)).toBe(true)
      })
    })

    it('should not be a valid target', () => {
      ;['riscv32', 'trash'].forEach((target) => {
        expect(isRiscvTargetArch(target)).toBe(false)
      })
    })
  })
})
