// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} GDBLineProps
 * @property {import('../../lib/decode/decode.js').GDBLine} line
 */

/**
 * @param {GDBLineProps} props
 */
function GDBLine({ line }) {
  return (
    <Box>
      <Text color="green">{line.address}</Text>
      <Text>{': '}</Text>
      <Text>{line.lineNumber}</Text>
    </Box>
  )
}

export default GDBLine
