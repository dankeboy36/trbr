// @ts-check

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import React from 'react'

import AddrLocation from './AddrLocation.js'
import AllocLocation from './AllocLocation.js'
import CoredumpDecodeResult from './CoredumpDecodeResult.js'
import { texts } from './DecodeResult.text.js'
import FaultInfo from './FaultInfo.js'

/**
 * @typedef {import('../../lib/decode/decode.js').DecodeResult} DecodeResult
 * @typedef {import('../../lib/decode/coredump.js').CoredumpDecodeResult} CoredumpDecodeResult
 */

/**
 * @typedef {Object} DecodeResultProps
 * @property {DecodeResult|CoredumpDecodeResult} [decodeResult]
 * @property {Error} [error]
 * @property {boolean} [loading]
 * @property {boolean} [interactive]
 */

/**
 * @param {DecodeResultProps} props
 */
function DecodeResult({ decodeResult, error, loading, interactive }) {
  let content = null

  if (error) {
    content = <Text color="red">{error.message}</Text>
  }

  if (!content && loading && interactive) {
    content = (
      <>
        <Text>{texts.decoding}</Text>
        <Spinner />
      </>
    )
  }

  if (!content && decodeResult) {
    content = Array.isArray(decodeResult) ? (
      <CoredumpDecodeResult decodeResult={decodeResult} />
    ) : (
      <>
        {decodeResult.faultInfo && (
          <FaultInfo faultInfo={decodeResult.faultInfo} />
        )}
        <Box flexDirection="column" paddingTop={decodeResult.faultInfo ? 1 : 0}>
          {decodeResult.stacktraceLines.map((line, index) => (
            <AddrLocation key={index} addrLocation={line} />
          ))}
        </Box>
        {decodeResult.allocInfo && (
          <Box flexDirection="column" paddingTop={1}>
            <AllocLocation allocInfo={decodeResult.allocInfo} />
          </Box>
        )}
      </>
    )
  }

  return (
    <Box flexDirection="column" paddingTop={1}>
      {content}
    </Box>
  )
}

export default DecodeResult
