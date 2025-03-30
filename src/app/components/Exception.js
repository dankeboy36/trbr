// @ts-check

import { Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} ExceptionProps
 * @property {import('../../lib').Exception} exception
 */

/**
 * @param {ExceptionProps} props
 */
function Exception({ exception }) {
  const [message, code] = exception
  return (
    <Text color="red">
      {message} ({code})
    </Text>
  )
}

export default Exception
