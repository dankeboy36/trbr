// @ts-check

import React from 'react'

import GDBLine from './GDBLine.js'
import ParsedGDBLine from './ParsedGDBLine.js'
import RegAddr from './RegAddr.js'

/**
 * @typedef {Object} LocationProps
 * @property {import('../../lib/decode/decode.js').AddrLocation} addrLocation
 * @property {import('chalk').ForegroundColorName} [color=undefined]
 */

/**
 * @param {LocationProps} props
 */
function Location({ addrLocation, color }) {
  if (typeof addrLocation === 'string') {
    return <RegAddr color={color} regAddr={addrLocation} />
  }
  if (!isParsedGDBLine(addrLocation)) {
    return <GDBLine color={color} line={addrLocation} />
  }
  return <ParsedGDBLine color={color} line={addrLocation} />
}

/**
 * @param {import('../../lib/decode/decode.js').GDBLine} line
 * @returns {line is import('../../lib/decode/decode.js').ParsedGDBLine}
 */
function isParsedGDBLine(line) {
  return 'file' in line && 'lineNumber' in line
}

export default Location
