// @ts-check

import { Box, Text } from 'ink'
import React, { useEffect, useState } from 'react'

import { texts } from './Decoder.text.js'
import DecodeResult from './DecodeResult.js'
import Input from './Input.js'

/**
 * @typedef {Object} DecoderProps
 * @property {string} input
 * @property {import('../../index').DecodeResult} [decodeResult]
 * @property {boolean} [loading]
 * @property {Error} [error]
 * @property {boolean} [interactive]
 * @property {number} [blinkInterval]
 */

/**
 * @param {DecoderProps} props
 */
function Decoder({
  input,
  decodeResult,
  loading,
  error,
  interactive,
  blinkInterval,
}) {
  const [isBlinking, setIsBlinking] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsBlinking((prev) => !prev)
    }, blinkInterval || 1000)
    return () => clearInterval(interval)
  }, [blinkInterval])

  return (
    <Box flexDirection="column">
      <Input input={input} />
      <DecodeResult
        decodeResult={decodeResult}
        error={error}
        loading={loading}
      />
      {interactive && !loading && (
        <Text>{isBlinking ? texts.placeholder : ' '}</Text>
      )}
    </Box>
  )
}

export default Decoder
