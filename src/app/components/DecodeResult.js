// @ts-check

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import React from 'react'

import { toHexString } from '../../lib/decode/regs.js'
import AddrLocation from './AddrLocation.js'
import AllocLocation from './AllocLocation.js'
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
    if (Array.isArray(decodeResult)) {
      content = decodeResult.map((result, index) => (
        <Box key={index} flexDirection="column" paddingBottom={1}>
          <Text>{`==================== THREAD ${
            result.threadId
          } (TCB: ${toHexString(result.TCB)}) =====================`}</Text>
          {
            <Box flexDirection="column">
              {result.result.stacktraceLines.map((line, index) => (
                <AddrLocation key={index} addrLocation={line} />
              ))}
            </Box>
          }
        </Box>
      ))
    } else {
      content = <Result decodeResult={decodeResult} />
    }
  }

  return (
    <Box flexDirection="column" paddingTop={1}>
      {content}
    </Box>
  )
}

/**
 * @param {{decodeResult:DecodeResult}} props
 */
function Result({ decodeResult }) {
  return (
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

export default DecodeResult
