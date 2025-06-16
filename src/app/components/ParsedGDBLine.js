// @ts-check

import path from 'node:path'

import { Box, Text } from 'ink'
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
  const basename = path.basename(line.file)
  const prefix = line.file.slice(0, -basename.length)
  return (
    <Box>
      <Text color={color ?? 'green'}>{line.regAddr}</Text>
      <Text color={color}>{': '}</Text>
      <Text color={color ?? 'blue'}>{`${line.method} (`}</Text>
      {line.args?.map((arg, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Text color={color ?? 'blue'}>{', '}</Text>}
          <Text color={color ?? 'blue'}>
            {arg.name}
            {arg.value ? `=${arg.value}` : ''}
          </Text>
        </React.Fragment>
      ))}
      <Text color={color ?? 'blue'}>{')'}</Text>
      <Text color={color}>{' at '}</Text>
      {basename.trim() ? (
        <>
          <Text color={color}>{prefix}</Text>
          <Text color={color}>{basename}</Text>
          <Text color={color}>{':'}</Text>
          <Text color={color}>{line.lineNumber}</Text>
        </>
      ) : (
        <>
          <Text color={color}>{line.file}</Text>
          <Text color={color}>{':'}</Text>
          <Text color={color}>{line.lineNumber}</Text>
        </>
      )}
    </Box>
  )
}

export default ParsedGDBLine
