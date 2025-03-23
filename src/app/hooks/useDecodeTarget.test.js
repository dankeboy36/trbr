// @ts-check

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useDecodeTarget } from './useDecodeTarget.js'

describe('useDecodeTarget', () => {
  it('should use the target arch when set', () => {
    const { result } = renderHook(() =>
      // @ts-ignore
      useDecodeTarget({ targetArch: 'xtensa' })
    )
    expect(result.current).toEqual('xtensa')
  })

  it('should use the board ID of the FQBN (RISC-V)', () => {
    const { result } = renderHook(() =>
      useDecodeTarget({ toolPathOrFqbn: 'esp32:esp32:esp32h2' })
    )
    expect(result.current).toEqual('esp32h2')
  })

  it('should use the board ID of the FQBN (non-RISC-V)', () => {
    const { result } = renderHook(() =>
      useDecodeTarget({ toolPathOrFqbn: 'esp32:esp32:esp32' })
    )
    expect(result.current).toEqual('xtensa')
  })

  it('should use xtensa when not a FQBN', () => {
    const { result } = renderHook(() =>
      useDecodeTarget({ toolPathOrFqbn: 'foo' })
    )
    expect(result.current).toEqual('xtensa')
  })
})
