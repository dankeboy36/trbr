// @ts-check

import React from 'react'

import Address from './Address.js'
import GDBLine from './GDBLine.js'
import ParsedGDBLine from './ParsedGDBLine.js'

/**
 * @typedef {Object} LocationProps
 * @property {import('../../lib').Location} location
 */

/**
 * @param {LocationProps} props
 */
function Location({ location }) {
  if (typeof location === 'string') {
    return <Address address={location} />
  }
  if (!isParsedGDBLine(location)) {
    return <GDBLine line={location} />
  }
  return <ParsedGDBLine line={location} />
}

/**
 * @param {import('../../lib').GDBLine} line
 * @returns {line is import('../../lib').ParsedGDBLine}
 */
function isParsedGDBLine(line) {
  return 'file' in line && 'lineNumber' in line
}

export default Location
