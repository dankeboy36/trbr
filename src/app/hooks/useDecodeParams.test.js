// @ts-check

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDecodeParams } from './useDecodeParams.js'
import { useToolPath } from './useToolPath.js'

vi.mock('./useToolPath.js', async () => {
  const originalModule = await import('./useToolPath.js')
  return {
    ...originalModule,
    useToolPath: vi.fn(originalModule.useToolPath),
  }
})

describe('useDecodeParams', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should handle OK', () => {
    vi.mocked(useToolPath).mockReturnValue({
      status: 'success',
      error: undefined,
      result: 'tool',
    })
    // @ts-ignore
    const { result } = renderHook(() => useDecodeParams({}))
    expect(result.current).toEqual({
      loading: false,
      error: undefined,
      decodeParams: {
        targetArch: 'xtensa',
        toolPath: 'tool',
      },
    })
  })

  it('should handle loading state', () => {
    vi.mocked(useToolPath).mockReturnValue({
      status: 'loading',
      error: undefined,
      result: undefined,
    })
    // @ts-ignore
    const { result } = renderHook(() => useDecodeParams({}))
    expect(result.current).toStrictEqual({
      loading: true,
      error: undefined,
      decodeParams: undefined,
    })
  })

  it('should handle error state (before loading)', () => {
    const error = new Error('error')
    vi.mocked(useToolPath).mockReturnValue({
      status: 'loading',
      error,
      result: undefined,
    })
    // @ts-ignore
    const { result } = renderHook(() => useDecodeParams({}))
    expect(result.current).toStrictEqual({
      loading: false,
      error,
      decodeParams: undefined,
    })
  })

  it('should handle no state', () => {
    vi.mocked(useToolPath).mockReturnValue({
      status: 'not-executed',
      error: undefined,
      result: undefined,
    })
    // @ts-ignore
    const { result } = renderHook(() => useDecodeParams({}))
    expect(result.current).toStrictEqual({
      loading: false,
      error: undefined,
      decodeParams: undefined,
    })
  })
})
