// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} GDBLineProps
 * @property {import('../../lib/decode/decode.js').GDBLine} line
 * @property {import('chalk').ForegroundColorName} [color=undefined]
 */

/**
 * @param {GDBLineProps} props
 */
function GDBLine({ line, color }) {
  return (
    <Box>
      <Text color={color ?? 'green'}>{line.regAddr}</Text>
      <Text color={color}>{': '}</Text>
      <Text color={color}>{line.lineNumber}</Text>
    </Box>
  )
}

export default GDBLine
