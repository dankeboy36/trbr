// @ts-check

import { Box, Text } from 'ink'
import React from 'react'

import AddrLocation from './AddrLocation.js'
import { texts } from './FaultInfo.text.js'

/**
 * @typedef {Object} FaultInfoProps
 * @property {import('../../lib/decode/decode.js').FaultInfo} faultInfo
 */

/**
 * @param {FaultInfoProps} props
 */
function FaultInfo({
  faultInfo: { coreId, programCounter, faultAddr, faultCode, faultMessage },
}) {
  return faultAddr ? (
    <>
      <Text color="red">
        {texts.faultText(coreId, faultCode, faultMessage)}
      </Text>
      <Box flexDirection="column" paddingTop={1}>
        <Box>
          <Text color="red">{texts.PC}</Text>
          <Text color="red"> → </Text>
          <AddrLocation color="red" addrLocation={programCounter.location} />
        </Box>
        <Box>
          <Text color="red">{texts.addr}</Text>
          <Text color="red"> → </Text>
          <AddrLocation color="red" addrLocation={faultAddr.location} />
        </Box>
      </Box>
    </>
  ) : null
}

export default FaultInfo
