// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

import Location from './Location.js'

/**
 * @typedef {Object} RegisterLocationProps
 * @property {string} name
 * @property {import('../../lib').Location} location
 */

/**
 * @param {RegisterLocationProps} props
 */
function RegisterLocation({ name, location }) {
  return (
    <Box>
      <Text color="red">{name}</Text>
      <Text> </Text>
      <Location location={location} />
    </Box>
  )
}

export default RegisterLocation
