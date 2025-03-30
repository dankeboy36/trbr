// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

import { texts } from './AllocLocation.text.js'
import Location from './Location.js'

/**
 * @typedef {Object} AllocLocationProps
 * @property {import('../../lib').AllocLocation} allocLocation
 */

/**
 * @param {AllocLocationProps} props
 */
function AllocLocation({ allocLocation }) {
  const [location, size] = allocLocation
  return (
    <Box>
      <Text color="red">{texts.memoryAllocationFailed(size)}</Text>
      <Text> </Text>
      <Location location={location} />
    </Box>
  )
}

export default AllocLocation
