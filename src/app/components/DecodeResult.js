// @ts-check

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import React from 'react'

import AllocLocation from './AllocLocation.js'
import { texts } from './DecodeResult.text.js'
import Exception from './Exception.js'
import Location from './Location.js'
import RegisterLocation from './RegisterLocation.js'

/**
 * @typedef {Object} DecodeResultProps
 * @property {import('../../index').DecodeResult} [decodeResult]
 * @property {Error} [error]
 * @property {boolean} [loading]
 */

/**
 * @param {DecodeResultProps} props
 */
function DecodeResult({ decodeResult, error, loading }) {
  let content = null

  if (error) {
    content = <Text color="red">{error.message}</Text>
  }

  if (!content && loading) {
    content = (
      <>
        <Text>{texts.decoding}</Text>
        <Spinner />
      </>
    )
  }

  if (!content && decodeResult) {
    content = (
      <>
        {decodeResult.exception && (
          <Exception exception={decodeResult.exception} />
        )}
        <Box flexDirection="column" paddingTop={decodeResult.exception ? 1 : 0}>
          {Object.entries(decodeResult.registerLocations).map(
            ([name, location]) => (
              <RegisterLocation key={name} name={name} location={location} />
            )
          )}
        </Box>
        <Box flexDirection="column" paddingTop={1}>
          {decodeResult.stacktraceLines.map((line, index) => (
            <Location key={index} location={line} />
          ))}
        </Box>
        {decodeResult.allocLocation && (
          <Box flexDirection="column" paddingTop={1}>
            <AllocLocation allocLocation={decodeResult.allocLocation} />
          </Box>
        )}
      </>
    )
  }

  return (
    <Box flexDirection="column" paddingTop={1}>
      {content}
    </Box>
  )
}

export default DecodeResult
