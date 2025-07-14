// @ts-check

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { __tests, decode, isGDBLine, isParsedGDBLine } from './decode.js'
import { texts } from './decode.text.js'
import { riscvDecoders } from './riscv.js'
import { decodeXtensa } from './xtensa.js'

vi.mock('./riscv.js', async () => {
  const originalModule = await import('./riscv.js')
  return {
    ...originalModule,
    riscvDecoders: { esp32c2: vi.fn(originalModule.riscvDecoders['esp32c2']) },
  }
})
vi.mock('./xtensa.js', async () => {
  const originalModule = await import('./xtensa.js')
  return {
    ...originalModule,
    decodeXtensa: vi.fn(originalModule.decodeXtensa),
  }
})

const { fixWindowsPath, fixWindowsPaths } = __tests

describe('decode', () => {
  /** @type {NodeJS.Platform} */
  let originalPlatform

  beforeAll(() => {
    originalPlatform = process.platform
  })

  afterAll(() => {
    setPlatform(originalPlatform)
  })

  describe('fixWindowsPath', () => {
    it('should fix the path on Windows', () => {
      setPlatform('win32')
      expect(
        fixWindowsPath(
          'D:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1/riscv_1.ino'
        )
      ).toBe(
        'D:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1\\riscv_1.ino'
      )
    })

    it('should be noop if not on Windows', () => {
      setPlatform('linux')
      expect(
        fixWindowsPath(
          'D:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1/riscv_1.ino'
        )
      ).toBe(
        'D:\\a\\esp-exception-decoder\\esp-exception-decoder\\src\\test\\sketches\\riscv_1/riscv_1.ino'
      )
    })
  })

  describe('fixWindowsPaths', () => {
    it('should fix the paths on Windows', () => {
      setPlatform('win32')
      const actual = fixWindowsPaths({
        faultInfo: {
          programCounter: {
            regAddr: '0x400d15af',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE/AE.ino',
            lineNumber: '7',
          },
          faultAddr: '0x00000000',
          coreId: 1,
          faultCode: 1,
        },
        stacktraceLines: [
          {
            regAddr: '0x400d15ac',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE/AE.ino',
            lineNumber: '6',
          },
          {
            regAddr: '0x400d2f98',
            method: 'loopTask(void*)',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\test-resources\\envs\\cli\\Arduino15\\packages\\esp32\\hardware\\esp32\\3.1.1\\cores\\esp32\\main.cpp',
            lineNumber: '74',
          },
          {
            regAddr: '0x40088be9',
            method: 'vPortTaskWrapper',
            file: '/home/runner/work/esp32-arduino-lib-builder/esp32-arduino-lib-builder/esp-idf/components/freertos/FreeRTOS-Kernel/portable/xtensa/port.c',
            lineNumber: '139',
          },
          {
            regAddr: '0x40088be9',
            lineNumber: '??',
          },
        ],
        allocInfo: {
          allocAddr: {
            regAddr: '0x40088be9',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE/AE.ino',
            lineNumber: '139',
            method: 'vPortTaskWrapper',
          },
          allocSize: 36,
        },
        regs: {},
      })
      expect(actual).toEqual({
        exception: undefined,
        faultInfo: {
          coreId: 1,
          programCounter: {
            regAddr: '0x400d15af',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE\\AE.ino',
            lineNumber: '7',
          },
          faultAddr: '0x00000000',
          faultCode: 1,
        },
        regs: {},
        stacktraceLines: [
          {
            regAddr: '0x400d15ac',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE\\AE.ino',
            lineNumber: '6',
          },
          {
            regAddr: '0x400d2f98',
            method: 'loopTask(void*)',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\test-resources\\envs\\cli\\Arduino15\\packages\\esp32\\hardware\\esp32\\3.1.1\\cores\\esp32\\main.cpp',
            lineNumber: '74',
          },
          {
            regAddr: '0x40088be9',
            method: 'vPortTaskWrapper',
            file: '/home/runner/work/esp32-arduino-lib-builder/esp32-arduino-lib-builder/esp-idf/components/freertos/FreeRTOS-Kernel/portable/xtensa/port.c',
            lineNumber: '139',
          },
          {
            regAddr: '0x40088be9',
            lineNumber: '??',
          },
        ],
        allocInfo: {
          allocAddr: {
            regAddr: '0x40088be9',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE\\AE.ino',
            lineNumber: '139',
            method: 'vPortTaskWrapper',
          },
          allocSize: 36,
        },
      })
    })
  })

  describe('isGDBLine', () => {
    it('should return true for valid GDB line', () => {
      const validLine = { lineNumber: '??', regAddr: '0x1234' }
      expect(isGDBLine(validLine)).toBe(true)
    })

    it('should return false for invalid GDB line', () => {
      const invalidLine = 'This is not a GDB line'
      expect(isGDBLine(invalidLine)).toBe(false)
    })
  })

  describe('isParsedGDBLine', () => {
    it('should return true for a valid parsed GDB line object', () => {
      const validParsedLine = {
        file: 'main.c',
        lineNumber: '10',
        method: 'main',
        regAddr: '0x1234',
      }
      expect(isParsedGDBLine(validParsedLine)).toBe(true)
    })

    it('should return false for an invalid parsed GDB line object', () => {
      const invalidParsedLine = {
        file: 'main.c',
        lineNumber: 10,
        function: 'main',
        regAddr: '0x1234',
      }
      expect(isParsedGDBLine(invalidParsedLine)).toBe(false)
    })

    it('should return false for a completely invalid object', () => {
      const invalidObject = { randomKey: 'randomValue' }
      expect(isParsedGDBLine(invalidObject)).toBe(false)
    })
  })

  describe('decode', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should throw when targetArch is not supported', async () => {
      // @ts-ignore
      await expect(() => decode({ targetArch: 'unknown' }, '')).rejects.toThrow(
        texts.unsupportedTargetArch('unknown')
      )
    })

    it('should decode xtensa', async () => {
      vi.mocked(decodeXtensa).mockResolvedValueOnce({
        faultInfo: {
          programCounter: '0x400d15af',
          faultAddr: '0x00000000',
          coreId: 1,
          faultCode: 1,
        },
        stacktraceLines: [],
        regs: {},
      })

      await expect(
        decode({ toolPath: 'tool', elfPath: 'elf', targetArch: 'xtensa' }, '')
      ).resolves.toBeTruthy()

      expect(decodeXtensa).toHaveBeenCalledWith(
        { toolPath: 'tool', elfPath: 'elf', targetArch: 'xtensa' },
        '',
        { debug: expect.any(Function), signal: expect.any(AbortSignal) }
      )
    })

    it('should decode riscv', async () => {
      vi.mocked(riscvDecoders.esp32c2).mockImplementationOnce(async () => ({
        faultInfo: {
          programCounter: '0x400d15af',
          faultAddr: '0x00000000',
          coreId: 1,
          faultCode: 1,
        },
        stacktraceLines: [],
        regs: {},
      }))

      await expect(
        decode({ toolPath: 'tool', elfPath: 'elf', targetArch: 'esp32c2' }, '')
      ).resolves.toBeTruthy()

      expect(riscvDecoders.esp32c2).toHaveBeenCalledWith(
        { toolPath: 'tool', elfPath: 'elf', targetArch: 'esp32c2' },
        '',
        { debug: expect.any(Function), signal: expect.any(AbortSignal) }
      )
    })
  })

  function setPlatform(platform) {
    Object.defineProperty(process, 'platform', { value: platform })
  }
})
