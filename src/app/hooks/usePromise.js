// @ts-check

import { useEffect, useReducer } from 'react'

/**
 * @template T
 * @typedef {Object} UsePromiseState
 * @property {Error} [error]
 * @property {T} [result]
 * @property {boolean} loading
 */

/**
 * @typedef {Object} LoadingAction
 * @property {'LOADING'} type
 */

/**
 * @template T
 * @typedef {Object} ResultAction
 * @property {'RESULT'} type
 * @property {T} payload
 */

/**
 * @typedef {Object} ErrorAction
 * @property {'ERROR'} type
 * @property {Error} payload
 */

/**
 * @template T
 * @typedef {LoadingAction|ResultAction<T>|ErrorAction} UsePromiseAction<T>
 */

/**
 * @template T
 * @type {import('react').Reducer<UsePromiseState<T>, UsePromiseAction<T>>}
 */
const reducer = (state, action) => {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true }
    case 'RESULT':
      return { loading: false, result: action.payload, error: undefined }
    case 'ERROR':
      return { loading: false, error: action.payload, result: undefined }
    default:
      return state
  }
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @returns {UsePromiseState<T>}
 */
export function usePromise(promise) {
  const [state, dispatch] = useReducer(reducer, {
    loading: false,
    result: undefined,
    error: undefined,
  })

  useEffect(() => {
    let active = true
    const resolve = async () => {
      try {
        const result = await promise
        if (active) {
          dispatch({ type: 'RESULT', payload: result })
        }
      } catch (error) {
        if (active) {
          dispatch({ type: 'ERROR', payload: error })
        }
      }
    }

    dispatch({ type: 'LOADING' })
    resolve()

    return () => {
      active = false
      if (isCancelable(promise)) {
        promise.cancel()
      }
    }
  }, [promise])

  return state
}

/**
 * @typedef {Object} Cancelable
 * @property {()=>void} cancel
 */

/**
 * @param {unknown} arg
 * @returns {arg is Cancelable}
 */
function isCancelable(arg) {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    'cancel' in arg &&
    typeof arg.cancel === 'function'
  )
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  reducer,
})
