// @ts-check

import path from 'node:path'

import { Box, Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} ParsedGDBLineProps
 * @property {import('../../lib').ParsedGDBLine} line
 */

/**
 * @param {ParsedGDBLineProps} props
 */
function ParsedGDBLine({ line }) {
  const basename = path.basename(line.file)
  const prefix = line.file.slice(0, -basename.length)
  return (
    <Box>
      <Text color="green">{line.address}</Text>
      <Text>{': '}</Text>
      <Text color="blue">{line.method}</Text>
      <Text>{' at '}</Text>
      {basename.trim() ? (
        <>
          <Text>{prefix}</Text>
          <Text bold>{basename}</Text>
          <Text>{':'}</Text>
          <Text>{line.lineNumber}</Text>
        </>
      ) : (
        <>
          <Text>{line.file}</Text>
          <Text>{':'}</Text>
          <Text>{line.lineNumber}</Text>
        </>
      )}
    </Box>
  )
}

export default ParsedGDBLine
