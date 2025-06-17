// @ts-check

import { Box } from 'ink'
import React from 'react'

import AddrLocation from './AddrLocation.js'
import ThreadSeparator from './ThreadSeparator.js'
import ThreadsInfo from './ThreadsInfo.js'

/**
 * @typedef {import('../../lib/decode/coredump.js').CoredumpDecodeResult} CoredumpDecodeResult
 */

/**
 * @typedef {Object} CoredumpDecodeResultProps
 * @property {CoredumpDecodeResult} decodeResult
 */

/**
 * @param {CoredumpDecodeResultProps} props
 */
function CoredumpDecodeResult({ decodeResult }) {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <ThreadsInfo decodeResult={decodeResult} />
      {decodeResult.map((result, index) => (
        <Box key={index} flexDirection="column" paddingBottom={1}>
          <ThreadSeparator result={result} />
          <Box flexDirection="column">
            {result.result.stacktraceLines.map((line, index) => (
              <AddrLocation key={index} addrLocation={line} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export default CoredumpDecodeResult
