// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

import { texts } from './Footer.text.js'

/**
 * @typedef {Object} FooterProps
 * @property {boolean} [interactive]
 */

/**
 * @param {FooterProps} props
 */
function Footer({ interactive }) {
  return interactive ? (
    <Box flexDirection="column" paddingTop={1}>
      <Text>{texts.pressCtrlCToExit}</Text>
    </Box>
  ) : null
}

export default Footer
