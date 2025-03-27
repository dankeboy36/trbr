// @ts-check

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { appendDotExeOnWindows } from './os.js'

describe('os', () => {
  /** @type {NodeJS.Platform}  */
  let originalPlatform

  beforeAll(() => {
    originalPlatform = process.platform
  })

  afterAll(() => {
    setPlatform(originalPlatform)
  })

  it('appends .exe on Window', async () => {
    setPlatform('win32')
    expect(appendDotExeOnWindows('foo.exe')).toBe('foo.exe.exe')
  })

  it('does not append .exe on non-Window', async () => {
    setPlatform('linux')
    expect(appendDotExeOnWindows('foo')).toBe('foo')
  })

  function setPlatform(platform) {
    Object.defineProperty(process, 'platform', { value: platform })
  }
})
