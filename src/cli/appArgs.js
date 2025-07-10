// @ts-check

import { FQBN, valid as isValidFQBN } from 'fqbn'

import { isDecodeTarget } from '../lib/decode/decode.js'
import { createDecodeParams } from '../lib/decode/decodeParams.js'
import { texts } from './appArgs.text.js'
import { resolveArduinoCliPath } from './arduino.js'
import { parseDecodeInput } from './decodeInput.js'

const { errors } = texts

/** @typedef {import('../lib/decode/decodeParams.js').DecodeParams} DecodeParams */

/**
 * @typedef {import('../lib/decode/decodeParams.js').CreateDecodeParamsFromParams} CreateDecodeParamsFromParams
 * @typedef {import('../lib/decode/decodeParams.js').CreateCoredumpDecodeParamsFromParams} CreateCoredumpDecodeParamsFromParams
 * @typedef {CreateDecodeParamsFromParams|CreateCoredumpDecodeParamsFromParams} CreateDecodeParamsParams
 */

/**
 * @param {Object} options
 * @returns {Promise<CreateDecodeParamsParams>}
 */
async function parseCreateDecodeParams(options) {
  const {
    elfPath,
    toolPath,
    targetArch,
    fqbn: rawFQBN,
    input,
    coredumpMode,
    arduinoCliConfigPath: arduinoCliConfigPath,
    additionalUrls,
  } = options

  if (!elfPath) {
    throw new Error(errors.elfPathRequired)
  }
  if (!toolPath && !rawFQBN) {
    throw new Error(errors.toolPathOrFqbnRequired)
  }
  if (toolPath && rawFQBN) {
    throw new Error(errors.toolPathAndFqbnExclusive)
  }
  if (coredumpMode && !input) {
    throw new Error(errors.coredumpModeRequiresInput)
  }

  if (toolPath) {
    if (targetArch && !isDecodeTarget(targetArch)) {
      throw new Error(errors.targetArchInvalid)
    }
    if (arduinoCliConfigPath) {
      throw new Error(errors.arduinoCliConfigRequiresFqbn)
    }
    if (additionalUrls) {
      throw new Error(errors.additionalUrlsRequiresFqbn)
    }

    /** @type {import('../lib/decode/decodeParams.js').CreateDecodeParamsFromToolParams} */
    const decodeParams = { elfPath, toolPath, targetArch }
    return { ...decodeParams, coredumpMode }
  }

  if (!isValidFQBN(rawFQBN)) {
    throw new Error(errors.fqbnInvalid)
  }
  if (targetArch) {
    throw new Error(errors.targetArchAndFqbnExclusive)
  }

  const fqbn = new FQBN(rawFQBN)
  const arduinoCliPath = await resolveArduinoCliPath()

  /** @type {import('../lib/decode/decodeParams.js').CreateDecodeParamsFromFQBNParams} */
  const decodeParams = {
    fqbn,
    arduinoCliPath,
    elfPath,
    additionalUrls,
    arduinoCliConfigPath,
  }

  return { ...decodeParams, coredumpMode }
}

/**
 * @typedef {Object} AppArgs
 * @property {DecodeParams} decodeParams
 * @property {import('../lib/decode/decode.js').DecodeInput} [decodeInput]
 * @property {string} version
 * @property {boolean} [noColor]
 */

/**
 * @param {import('../lib/decode/decodeParams.js').CreateDecodeParamsFromParams} params
 * @returns {Promise<import('../lib/decode/decodeParams.js').DecodeParams>}
 */
async function createBacktraceParams(params) {
  return createDecodeParams(params)
}

/**
 * @param {import('../lib/decode/decodeParams.js').CreateCoredumpDecodeParamsFromParams} params
 * @returns {Promise<import('../lib/decode/decodeParams.js').DecodeCoredumpParams>}
 */
async function createCoredumpParams(params) {
  return createDecodeParams(params)
}

/**
 * @param {Object} options
 * @returns {Promise<Omit<AppArgs, 'version'>>}
 */
export async function parseAppArgs(options) {
  const { color = false } = options
  const createDecodeParamsParams = await parseCreateDecodeParams(options)

  const decodeParams =
    'coredumpMode' in createDecodeParamsParams &&
    createDecodeParamsParams.coredumpMode
      ? await createCoredumpParams(createDecodeParamsParams)
      : await createBacktraceParams(createDecodeParamsParams)
  const decodeInput = await parseDecodeInput({ decodeParams, options })

  return {
    decodeParams,
    decodeInput,
    noColor: !color,
  }
}
