// @ts-check

import { act, renderHook, waitFor } from '@testing-library/react'
import clipboardy from 'clipboardy'
import { useStdin } from 'ink'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useInput } from './useInput.js'

vi.mock('ink', async () => {
  const originalModule = await import('ink')
  return {
    ...originalModule,
    useStdin: vi.fn(originalModule.useStdin),
  }
})

vi.mock('clipboardy', async () => {
  const originalModule = await import('clipboardy')
  return {
    ...originalModule,
    read: vi.fn(async () => 'clipboard-content'),
  }
})

describe('useDecodeTarget', () => {
  let originalIsTTY

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY
  })

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY
    vi.resetAllMocks()
  })

  it('should use the trace input when set', () => {
    const { result } = renderHook(() => useInput({ traceInput: 'content' }))
    expect(result.current.input).toEqual('content')
  })

  it('should be non-interactive when trace input is set', () => {
    const { result } = renderHook(() => useInput({ traceInput: 'content' }))
    expect(result.current.interactive).toBe(false)
  })

  it('should get the input from stdin', async () => {
    const { result } = renderHook(() => useInput({}))
    expect(result.current.input).toEqual('')

    act(() => {
      process.stdin.emit('data', 'content')
    })

    await waitFor(() => {
      expect(result.current.input).toEqual('content')
    })
  })

  it('should interactive when no trace data and is TTY', async () => {
    process.stdin.isTTY = true

    const { result } = renderHook(() => useInput({}))
    expect(result.current.interactive).toBe(true)
  })

  it('should buffer the data events', async () => {
    const { result } = renderHook(() => useInput({}))
    expect(result.current.input).toEqual('')

    act(() => {
      for (let i = 0; i < 100; i++) {
        setTimeout(() => process.stdin.emit('data', String(i)), 1)
      }
    })

    await waitFor(() => {
      expect(result.current.input).toContain('99')
    })
  })

  it('should set the raw mode when supported and is interactive', async () => {
    const setRawMode = vi.fn()
    vi.mocked(useStdin).mockReturnValue(mockUseStdin({ setRawMode }))

    renderHook(() => useInput({}))

    act(() => {
      process.stdin.emit('data', 'content')
    })

    await waitFor(() => {
      expect(setRawMode).toHaveBeenCalledExactlyOnceWith(true)
    })
  })

  it('should get the clipboard content when pasted', async () => {
    process.stdin.isTTY = true
    const read = vi.fn(async () => 'clipboard-content')
    vi.spyOn(clipboardy, 'read').mockImplementationOnce(read)

    const { result } = renderHook(() => useInput({}))

    act(() => {
      process.stdin.emit('data', 'ctrl+v')
    })

    await waitFor(() => {
      expect(read).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(result.current.input).toContain('clipboard-content')
    })
  })

  it('should reset the raw mode when supported and is interactive', async () => {
    const setRawMode = vi.fn()
    vi.mocked(useStdin).mockReturnValue(mockUseStdin({ setRawMode }))

    const { unmount } = renderHook(() => useInput({}))

    unmount()

    await waitFor(() => {
      expect(setRawMode).toHaveBeenNthCalledWith(1, true)
      expect(setRawMode).toHaveBeenNthCalledWith(2, false)
    })
  })

  it('should not reset the raw mode when not supported', async () => {
    const setRawMode = vi.fn()
    vi.mocked(useStdin).mockReturnValue(
      mockUseStdin({ setRawMode, isRawModeSupported: false })
    )

    const { unmount } = renderHook(() => useInput({}))

    unmount()

    await waitFor(() => {
      expect(setRawMode).not.toHaveBeenCalled()
    })
  })

  it('should not reset the raw mode when not interactive', async () => {
    const setRawMode = vi.fn()
    vi.mocked(useStdin).mockReturnValue(
      mockUseStdin({ setRawMode, isTTY: false })
    )

    const { unmount } = renderHook(() => useInput({}))

    unmount()

    await waitFor(() => {
      expect(setRawMode).not.toHaveBeenCalled()
    })
  })

  /** @returns {ReturnType<typeof useStdin>} */
  function mockUseStdin({
    isTTY = true,
    isRawModeSupported = true,
    setRawMode = vi.fn(),
  }) {
    return {
      isRawModeSupported,
      setRawMode,
      // @ts-ignore
      stdin: {
        on: vi.fn(),
        resume: vi.fn(),
        off: vi.fn(),
        isTTY,
      },
    }
  }
})
