// @ts-check

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { __tests, usePromise } from './usePromise.js'

const { reducer } = __tests

describe('usePromise', () => {
  it('cancels the promise on unmount', async () => {
    const cancel = vi.fn()
    const promise = Object.assign(new Promise(() => {}), { cancel })

    const { unmount } = renderHook(() => usePromise(promise))
    unmount()

    expect(cancel).toHaveBeenCalled()
  })

  describe('reducer', () => {
    it('should be noop on unhandled action', () => {
      const state = { loading: false }
      const action = { type: 'UNKNOWN' }

      // @ts-ignore
      expect(reducer(state, action)).toBe(state)
    })
  })
})
