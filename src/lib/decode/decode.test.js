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

import { __tests, decode } from './decode.js'
import { texts } from './decode.text.js'
import { decodeRiscv } from './riscv.js'
import { decodeXtensa } from './xtensa.js'

vi.mock('./riscv.js', async () => {
  const originalModule = await import('./riscv.js')
  return {
    ...originalModule,
    decodeRiscv: vi.fn(originalModule.decodeRiscv),
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
  /** @type {NodeJS.Platform}  */
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
        exception: undefined,
        registerLocations: {
          PC: {
            address: '0x400d15af',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE/AE.ino',
            lineNumber: '7',
          },
          EXCVADDR: '0x00000000',
        },
        stacktraceLines: [
          {
            address: '0x400d15ac',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE/AE.ino',
            lineNumber: '6',
          },
          {
            address: '0x400d2f98',
            method: 'loopTask(void*)',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\test-resources\\envs\\cli\\Arduino15\\packages\\esp32\\hardware\\esp32\\3.1.1\\cores\\esp32\\main.cpp',
            lineNumber: '74',
          },
          {
            address: '0x40088be9',
            method: 'vPortTaskWrapper',
            file: '/home/runner/work/esp32-arduino-lib-builder/esp32-arduino-lib-builder/esp-idf/components/freertos/FreeRTOS-Kernel/portable/xtensa/port.c',
            lineNumber: '139',
          },
          {
            address: '0x40088be9',
            lineNumber: '??',
          },
        ],
        allocLocation: [
          {
            address: '0x40088be9',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE/AE.ino',
            lineNumber: '139',
            method: 'vPortTaskWrapper',
          },
          36,
        ],
      })
      expect(actual).toEqual({
        exception: undefined,
        registerLocations: {
          PC: {
            address: '0x400d15af',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE\\AE.ino',
            lineNumber: '7',
          },
          EXCVADDR: '0x00000000',
        },
        stacktraceLines: [
          {
            address: '0x400d15ac',
            method: 'loop()',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE\\AE.ino',
            lineNumber: '6',
          },
          {
            address: '0x400d2f98',
            method: 'loopTask(void*)',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\test-resources\\envs\\cli\\Arduino15\\packages\\esp32\\hardware\\esp32\\3.1.1\\cores\\esp32\\main.cpp',
            lineNumber: '74',
          },
          {
            address: '0x40088be9',
            method: 'vPortTaskWrapper',
            file: '/home/runner/work/esp32-arduino-lib-builder/esp32-arduino-lib-builder/esp-idf/components/freertos/FreeRTOS-Kernel/portable/xtensa/port.c',
            lineNumber: '139',
          },
          {
            address: '0x40088be9',
            lineNumber: '??',
          },
        ],
        allocLocation: [
          {
            address: '0x40088be9',
            file: 'C:\\Users\\kittaakos\\dev\\esp-exception-decoder\\src\\test\\sketches\\AE\\AE.ino',
            lineNumber: '139',
            method: 'vPortTaskWrapper',
          },
          36,
        ],
      })
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
        registerLocations: {},
        stacktraceLines: [],
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
      vi.mocked(decodeRiscv).mockResolvedValueOnce({
        registerLocations: {},
        stacktraceLines: [],
      })

      await expect(
        decode({ toolPath: 'tool', elfPath: 'elf', targetArch: 'esp32c2' }, '')
      ).resolves.toBeTruthy()

      expect(decodeRiscv).toHaveBeenCalledWith(
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
