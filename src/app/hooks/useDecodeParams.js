// @ts-check

import { useMemo } from 'react'

import { useDecodeTarget } from './useDecodeTarget.js'
import { useToolPath } from './useToolPath.js'

/**
 * @typedef {Object} UseDecodeParamParams
 * @property {string} toolPathOrFqbn
 * @property {string} elfPath
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 * @property {import('../../lib').DecodeTarget} [targetArch]
 */

/**
 * @typedef {Omit<import('../../lib').DecodeParams, 'elfPath'>|undefined} DecodeParamsFragment
 */

/**
 * @typedef {Object} UseDecodeParamResult
 * @property {DecodeParamsFragment} decodeParams
 * @property {Error|undefined} error
 * @property {boolean} loading
 */

/**
 * @param {UseDecodeParamParams} params
 * @returns {UseDecodeParamResult}
 */
export function useDecodeParams({
  toolPathOrFqbn,
  arduinoCliConfig,
  additionalUrls,
  targetArch,
}) {
  const toolPath = useToolPath({
    toolPathOrFqbn,
    additionalUrls,
    arduinoCliConfig,
  })
  const resolvedTargetArch = useDecodeTarget({ toolPathOrFqbn, targetArch })

  /** @type {UseDecodeParamResult} */
  const result = useMemo(() => {
    if (toolPath.error) {
      return { loading: false, error: toolPath.error, decodeParams: undefined }
    }

    if (toolPath.loading) {
      return {
        loading: true,
        error: undefined,
        decodeParams: undefined,
      }
    }

    if (toolPath.result === undefined) {
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
        toolPath: toolPath.result,
        targetArch: resolvedTargetArch,
      },
    }
  }, [toolPath.error, toolPath.result, toolPath.loading, resolvedTargetArch])

  return result
}
