// @ts-check

import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { findToolPath } from '../../lib/tool.js'
import { useToolPath } from './useToolPath.js'

vi.mock('../../lib/tool.js', async () => {
  return {
    findToolPath: vi.fn(async () => 'xtensa'),
  }
})

describe('useToolPath', () => {
  it('should find the tool path', async () => {
    const { result } = renderHook(() =>
      useToolPath({
        toolPathOrFqbn: 'tool',
        additionalUrls: 'url1,url2',
        arduinoCliConfig: 'config',
      })
    )
    expect(result.current).toStrictEqual({
      error: undefined,
      loading: true,
      result: undefined,
    })

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        error: undefined,
        loading: false,
        result: 'xtensa',
      })
    })
  })

  it('should signal error', async () => {
    const error = new Error('error')
    vi.mocked(findToolPath).mockImplementationOnce(async () => {
      throw error
    })

    const { result } = renderHook(() =>
      useToolPath({
        toolPathOrFqbn: 'tool',
        additionalUrls: 'url1,url2',
        arduinoCliConfig: 'config',
      })
    )
    expect(result.current).toStrictEqual({
      error: undefined,
      loading: true,
      result: undefined,
    })

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        error,
        loading: false,
        result: undefined,
      })
    })
  })
})
