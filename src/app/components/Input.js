// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} InputProps
 * @property {string} input
 */

/**
 * @param {InputProps} props
 */
function Input({ input }) {
  return (
    <Box marginTop={1} width="100%" flexDirection="column">
      <Text>{input}</Text>
    </Box>
  )
}

export default Input
