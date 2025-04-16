// @ts-check

import { Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} AddressProps
 * @property {import('../../lib/decode/decode.js').Address} address
 */

/**
 * @param {AddressProps} props
 */
function Address({ address }) {
  return <Text color="green">{address}</Text>
}

export default Address
