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

vi.mock('../services/arduino.js', async () => {
  return {
    resolveArduinoCliPath: vi.fn(async () => 'arduino-cli'),
  }
})

describe('useToolPath', () => {
  it('should use the tool path', async () => {
    const { result } = renderHook(() =>
      useToolPath({
        toolPathOrFqbn: 'tool',
        additionalUrls: 'url1,url2',
        arduinoCliConfig: 'config',
      })
    )
    expect(result.current).toStrictEqual({
      error: undefined,
      status: 'loading',
      result: undefined,
    })

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        error: undefined,
        status: 'success',
        result: 'tool',
      })
    })
  })

  it('should find the tool path', async () => {
    const { result } = renderHook(() =>
      useToolPath({
        toolPathOrFqbn: 'a:b:c',
        additionalUrls: 'url1,url2',
        arduinoCliConfig: 'config',
      })
    )
    expect(result.current).toStrictEqual({
      error: undefined,
      status: 'loading',
      result: undefined,
    })

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        error: undefined,
        status: 'success',
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
        toolPathOrFqbn: 'a:b:c',
        additionalUrls: 'url1,url2',
        arduinoCliConfig: 'config',
      })
    )
    expect(result.current).toStrictEqual({
      error: undefined,
      status: 'loading',
      result: undefined,
    })

    await waitFor(() => {
      expect(result.current).toStrictEqual({
        error,
        status: 'error',
        result: undefined,
      })
    })
  })
})
