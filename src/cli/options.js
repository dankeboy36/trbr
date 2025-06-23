// @ts-check

import { defaultTargetArch, isDecodeTarget } from '../lib/decode/decode.js'
import { texts } from './options.text.js'

const { errors } = texts

/**
 * @typedef {Object} ParseOptionsParams
 * @property {Object} options
 */

/**
 *
 * @param {ParseOptionsParams} params
 * @returns {Promise<Omit<import('./app.js').AppArgs, 'version'>>}
 */
export async function parseOptions({ options }) {
  let {
    elfPath,
    toolPath,
    targetArch = '',
    fqbn,
    input = '',
    coredumpMode = false,
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
    targetArch = targetArch || defaultTargetArch
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
  if (coredumpMode && !input) {
    throw new Error(errors.coredumpModeRequiresInput)
  }

  const toolPathOrFqbn = toolPath ?? fqbn

  return {
    elfPath,
    toolPathOrFqbn,
    targetArch,
    decodeInput: {
      inputPath: input,
      coredumpMode,
    },
    arduinoCliConfig,
    additionalUrls,
    color,
  }
}
