// @ts-check

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import React from 'react'

import AddrLocation from './AddrLocation.js'
import AllocLocation from './AllocLocation.js'
import { texts } from './DecodeResult.text.js'
import FaultInfo from './FaultInfo.js'

/**
 * @typedef {Object} DecodeResultProps
 * @property {import('../../lib/decode/decode.js').DecodeResult} [decodeResult]
 * @property {Error} [error]
 * @property {boolean} [loading]
 */

/**
 * @param {DecodeResultProps} props
 */
function DecodeResult({ decodeResult, error, loading }) {
  let content = null

  if (error) {
    content = <Text color="red">{error.message}</Text>
  }

  if (!content && loading) {
    content = (
      <>
        <Text>{texts.decoding}</Text>
        <Spinner />
      </>
    )
  }

  if (!content && decodeResult) {
    content = (
      <>
        <FaultInfo faultInfo={decodeResult.faultInfo} />
        <Box flexDirection="column" paddingTop={1}>
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
