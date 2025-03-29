// @ts-check

import fs from 'node:fs/promises'

import { isDecodeTarget } from '../lib/index.js'
import { texts } from './options.text.js'

const { errors } = texts

/**
 * @typedef {Object} ParseOptionsParams
 * @property {Object} options
 */

/**
 *
 * @param {ParseOptionsParams} params
 * @returns {Promise<import('../app/App').AppProps>}
 */
export async function parseOptions({ options }) {
  let {
    elfPath,
    toolPath,
    targetArch = '',
    fqbn,
    input = '',
    arduinoCliConfig = '',
    additionalUrls = '',
    color = true,
  } = options

  if (!elfPath) {
    throw new Error(errors.elfPathRequired)
  }
  if (!toolPath && !fqbn) {
    throw new Error(errors.toolPathOrFqbnRequired)
  }
  if (toolPath && fqbn) {
    throw new Error(errors.toolPathAndFqbnExclusive)
  }
  if (toolPath) {
    targetArch = targetArch || 'xtensa'
    if (!isDecodeTarget(targetArch)) {
      throw new Error(errors.targetArchInvalid)
    }
  }
  if (fqbn && targetArch) {
    throw new Error(errors.targetArchAndFqbnExclusive)
  }
  if (arduinoCliConfig && !fqbn) {
    throw new Error(errors.arduinoCliConfigRequiresFqbn)
  }
  if (additionalUrls && !fqbn) {
    throw new Error(errors.additionalUrlsRequiresFqbn)
  }

  const toolPathOrFqbn = toolPath ?? fqbn
  const traceInput = input ? await fs.readFile(input, 'utf8') : ''

  return {
    elfPath,
    toolPathOrFqbn,
    targetArch,
    traceInput,
    arduinoCliConfig,
    additionalUrls,
    color,
  }
}
