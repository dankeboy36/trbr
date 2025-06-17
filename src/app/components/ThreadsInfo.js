// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

import AddrLocation from './AddrLocation.js'
import { texts } from './ThreadsInfo.text.js'

/**
 * @typedef {import('../../lib/decode/coredump.js').CoredumpDecodeResult} CoredumpDecodeResult
 */

/**
 * @typedef {Object} ThreadsInfoProps
 * @property {CoredumpDecodeResult} decodeResult
 */

/**
 * @param {ThreadsInfoProps} props
 */
function ThreadsInfo({ decodeResult }) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text color="gray">
        {texts.separator} {texts.title} {texts.separator}
      </Text>
      <Text>{`  ${texts.id}  ${texts.targetId}           ${texts.frame}`}</Text>
      {decodeResult.map((result, index) => (
        <Box key={index} flexDirection="row" paddingLeft={2}>
          <Text>
            {(result.current ? '*' : ' ') + result.threadId.padEnd(3)}
            {'process ' + result.TCB.toString().padEnd(12)}
          </Text>
          <AddrLocation addrLocation={result.result.stacktraceLines[0]} />
        </Box>
      ))}
    </Box>
  )
}

export default ThreadsInfo
