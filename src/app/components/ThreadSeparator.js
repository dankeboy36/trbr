// @ts-check

import { Text } from 'ink'
import React from 'react'

import { toHexString } from '../../lib/decode/regs.js'
import { texts } from './ThreadSeparator.text.js'

/**
 * @typedef {import('../../lib/decode/coredump.js').CoredumpDecodeResult} CoredumpDecodeResult
 */

/**
 * @typedef {Object} ThreadSeparatorProps
 * @property {CoredumpDecodeResult[number]} result
 */

/**
 * @param {ThreadSeparatorProps} props
 */
export function ThreadSeparator({ result }) {
  return (
    <Text>{`${texts.separator} ${texts.title} ${result.threadId} (${
      texts.TCB
    }: ${toHexString(result.TCB)}) ${texts.separator}`}</Text>
  )
}

export default ThreadSeparator
