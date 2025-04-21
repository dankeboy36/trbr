// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

import AddrLocation from './AddrLocation.js'
import { texts } from './AllocLocation.text.js'

/**
 * @typedef {Object} AllocLocationProps
 * @property {import('../../lib/decode/decode.js').AllocInfo} allocInfo
 */

/**
 * @param {AllocLocationProps} props
 */
function AllocLocation({ allocInfo: { allocAddr, allocSize } }) {
  return (
    <Box>
      <Text color="red">{texts.memoryAllocationFailed(allocSize)}</Text>
      <Text> </Text>
      <AddrLocation addrLocation={allocAddr} />
    </Box>
  )
}

export default AllocLocation
