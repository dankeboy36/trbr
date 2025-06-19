// @ts-check

import { Box, Text } from 'ink'
import React, { useEffect, useState } from 'react'

import { texts } from './Decoder.text.js'
import DecodeResult from './DecodeResult.js'
import Input from './Input.js'

/**
 * @typedef {import('../../lib/decode/decode.js').DecodeResult} DecodeResult
 * @typedef {import('../../lib/decode/coredump.js').CoredumpDecodeResult} CoredumpDecodeResult
 */

/**
 * @typedef {Object} DecoderProps
 * @property {import('../../lib/decode/decode.js').DecodeInput} [userInput]
 * @property {DecodeResult|CoredumpDecodeResult} [decodeResult]
 * @property {boolean} [loading]
 * @property {Error} [error]
 * @property {boolean} [interactive]
 * @property {number} [blinkInterval]
 */

/**
 * @param {DecoderProps} props
 */
function Decoder({
  userInput,
  decodeResult,
  loading,
  error,
  interactive,
  blinkInterval,
}) {
  const [isBlinking, setIsBlinking] = useState(true)

  const textInput =
    interactive && typeof userInput === 'string' ? userInput : ''

  useEffect(() => {
    const interval = setInterval(() => {
      setIsBlinking((prev) => !prev)
    }, blinkInterval || 1000)
    return () => clearInterval(interval)
  }, [blinkInterval])

  return (
    <Box flexDirection="column">
      <Input input={textInput} />
      <DecodeResult
        decodeResult={decodeResult}
        error={error}
        loading={loading}
        interactive={interactive}
      />
      {interactive && !loading && (
        <Text>{isBlinking ? texts.placeholder : ' '}</Text>
      )}
    </Box>
  )
}

export default Decoder
