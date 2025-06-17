// @ts-check

import clipboardy from 'clipboardy'
import { useStdin } from 'ink'
import { useEffect, useMemo, useState } from 'react'

const defaultBufferTimeout = 1000

/**
 * @typedef  {import('../../lib/decode/decode.js').DecodeInput} DecodeInput
 */

/**
 * @typedef {Object} UseDecodeInputParams
 * @property {DecodeInput} [decodeInput]
 * @property {number} [bufferTimeout=1000]
 * @property {boolean} [coredumpMode=false]
 */

/**
 * @param {UseDecodeInputParams} params
 */
export function useDecodeInput({ decodeInput, bufferTimeout }) {
  const { stdin, setRawMode, isRawModeSupported } = useStdin()
  /** @type {ReturnType<typeof useState<DecodeInput|undefined>>} */
  const [userInput, setUserInput] = useState()
  const interactive = useMemo(() => !decodeInput && !!stdin.isTTY, [stdin])

  useEffect(() => {
    if (decodeInput) {
      setUserInput(decodeInput)
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
          setUserInput(input)
          return
        }

        // Handle pasted text (assuming multi-character input)
        if (interactive && input.length > 1) {
          const clipboardContent = await clipboardy.read()
          setUserInput(clipboardContent.trim())
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

  return { userInput, interactive }
}
