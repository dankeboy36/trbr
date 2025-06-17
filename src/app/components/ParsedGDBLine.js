// @ts-check

import { Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} ParsedGDBLineProps
 * @property {import('../../lib/decode/decode.js').ParsedGDBLine} line
 * @property {import('chalk').ForegroundColorName} [color=undefined]
 */

/**
 * @param {ParsedGDBLineProps} props
 */
function ParsedGDBLine({ line, color }) {
  return (
    <Text wrap="wrap">
      <Text color={color ?? 'green'}>{line.regAddr}</Text>
      <Text color={color}>{': '}</Text>
      <Text color={color ?? 'blue'}>
        {line.method}
        {` (${
          line.args?.length
            ? line.args
                .map((arg) => `${arg.name}${arg.value ? `=${arg.value}` : ''}`)
                .join(', ')
            : ''
        })`}
      </Text>
      <Text color={color}>{` at ${line.file}:${line.lineNumber}`}</Text>
    </Text>
  )
}

export default ParsedGDBLine
