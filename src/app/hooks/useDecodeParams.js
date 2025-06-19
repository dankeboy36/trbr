// @ts-check

import { useMemo } from 'react'

import { useDecodeTarget } from './useDecodeTarget.js'
import { useToolPath } from './useToolPath.js'

/**
 * @typedef {Object} UseDecodeParamsParams
 * @property {string} toolPathOrFqbn
 * @property {string} elfPath
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 * @property {import('../../lib/decode/decode.js').DecodeTarget} [targetArch]
 */

/**
 * @typedef {Omit<import('../../lib/decode/decode.js').DecodeParams, 'elfPath'>|undefined} DecodeParamsFragment
 */

/**
 * @typedef {Object} UseDecodeParamResult
 * @property {DecodeParamsFragment} decodeParams
 * @property {Error|undefined} error
 * @property {boolean} loading
 */

/**
 * @param {UseDecodeParamsParams} params
 * @returns {UseDecodeParamResult}
 */
export function useDecodeParams({
  toolPathOrFqbn,
  arduinoCliConfig,
  additionalUrls,
  targetArch,
}) {
  const {
    status: toolPathStatus,
    result: toolPathResult,
    error: toolPathError,
  } = useToolPath({
    toolPathOrFqbn,
    additionalUrls,
    arduinoCliConfig,
  })
  const resolvedTargetArch = useDecodeTarget({ toolPathOrFqbn, targetArch })

  /** @type {UseDecodeParamResult} */
  const result = useMemo(() => {
    if (toolPathError) {
      return { loading: false, error: toolPathError, decodeParams: undefined }
    }

    if (toolPathStatus === 'loading') {
      return {
        loading: true,
        error: undefined,
        decodeParams: undefined,
      }
    }

    if (toolPathResult === undefined) {
      return {
        loading: false,
        error: undefined,
        decodeParams: undefined,
      }
    }

    return {
      loading: false,
      error: undefined,
      decodeParams: {
        toolPath: toolPathResult,
        targetArch: resolvedTargetArch,
      },
    }
  }, [toolPathError, toolPathResult, toolPathStatus, resolvedTargetArch])

  return result
}
