// @ts-check

import clipboardy from 'clipboardy'
import { useStdin } from 'ink'
import { useEffect, useMemo, useState } from 'react'

const defaultBufferTimeout = 1000

/**
 * @typedef {Object} UseInputParams
 * @property {string} [traceInput]
 * @property {number} [bufferTimeout=1000]
 */

/**
 * @param {UseInputParams} params
 */
export function useInput({ traceInput, bufferTimeout }) {
  const { stdin, setRawMode, isRawModeSupported } = useStdin()
  const [input, setInput] = useState('')
  const interactive = useMemo(() => !traceInput && !!stdin.isTTY, [stdin])

  useEffect(() => {
    if (traceInput) {
      setInput(traceInput)
      return
    }

    let buffer = ''
    /** @type {NodeJS.Timeout|undefined} */
    let timeout

    if (interactive && isRawModeSupported) {
      setRawMode(true)
    }

    const onData = (data) => {
      buffer += data.toString()
      clearTimeout(timeout)
      timeout = setTimeout(async () => {
        const input = buffer.trim()
        buffer = ''

        if (!interactive) {
          setInput(input)
          return
        }

        // Handle pasted text (assuming multi-character input)
        if (interactive && input.length > 1) {
          const clipboardContent = await clipboardy.read()
          setInput(clipboardContent.trim())
        }
      }, bufferTimeout ?? defaultBufferTimeout)
    }

    stdin.on('data', onData)
    stdin.resume()

    return () => {
      stdin.off('data', onData)
      clearTimeout(timeout)
      if (interactive && isRawModeSupported) {
        setRawMode(false)
      }
    }
  }, [stdin, setRawMode, isRawModeSupported, interactive])

  return { input, interactive }
}
