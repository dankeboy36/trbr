// @ts-check

import path from 'node:path'

import { Box, Text } from 'ink'
import React from 'react'

/**
 * @typedef {Object} ParsedGDBLineProps
 * @property {import('../../index').ParsedGDBLine} line
 */

/**
 * @param {ParsedGDBLineProps} props
 */
function ParsedGDBLine({ line }) {
  const segments = line.file.split(path.sep)
  const basename = segments.pop()
  return (
    <Box>
      <Text color="green">{line.address}</Text>
      <Text>{': '}</Text>
      <Text color="blue">{line.method}</Text>
      <Text>{' at '}</Text>
      {basename?.trim() ? (
        <>
          <Text>
            {segments.join(path.sep)}
            {path.sep}
          </Text>
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
