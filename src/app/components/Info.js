// @ts-check

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import React from 'react'

import { texts } from './Info.text.js'

/**
 * @typedef {Object} InfoProps
 * @property {string} [toolPath]
 * @property {string} [elfPath]
 */

/**
 * @param {InfoProps} props
 */
function Info({ toolPath, elfPath }) {
  return (
    <Box
      borderStyle="single"
      borderColor="green"
      width="100%"
      flexDirection="column"
    >
      <Text>
        {texts.elfPath}: {elfPath ? elfPath : <Spinner />}
      </Text>
      <Text>
        {texts.toolPath}: {toolPath ? toolPath : <Spinner />}
      </Text>
    </Box>
  )
}

export default Info
