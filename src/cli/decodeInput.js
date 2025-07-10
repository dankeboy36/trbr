// @ts-check

import { texts } from './appArgs.text.js'
import { readStdinString } from './stdin.js'

const { errors } = texts
/**
 * @typedef {Object} ParseDecodeInputParams
 * @property {import('../lib/decode/decodeParams').DecodeParams} decodeParams
 * @property {Object} options
 */

/**
 * @param {ParseDecodeInputParams} params
 * @returns {Promise<import('../lib/decode/decode').DecodeInput|undefined>}
 */
export async function parseDecodeInput({ decodeParams, options }) {
  const { input } = options
  // superfluous check?
  if (
    !input &&
    'coredumpMode' in decodeParams &&
    Boolean(decodeParams.coredumpMode)
  ) {
    throw new Error(errors.coredumpModeRequiresInput)
  }

  if (input) {
    return { inputPath: input }
  }

  return readStdinString()
}
