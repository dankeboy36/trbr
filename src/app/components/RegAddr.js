// @ts-check

import { Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} AddressProps
 * @property {import('../../lib/decode/decode.js').RegAddr} regAddr
 * @property {import('chalk').ForegroundColorName} [color=undefined]
 */

/**
 * @param {AddressProps} props
 */
function RegAddr({ regAddr, color }) {
  return <Text color={color ?? 'green'}>{regAddr}</Text>
}

export default RegAddr
