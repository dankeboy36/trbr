// @ts-check

import { useMemo } from 'react'

import { findToolPath } from '../../lib/index.js'
import { usePromise } from './usePromise.js'

/**
 * @typedef {import('../../lib/tool.js').FindToolPathParams} UseToolPathParams
 */

/**
 * @param {UseToolPathParams} params
 */
export function useToolPath({
  toolPathOrFqbn,
  additionalUrls,
  arduinoCliConfig,
}) {
  const promise = useMemo(
    () =>
      findToolPath({
        toolPathOrFqbn,
        additionalUrls,
        arduinoCliConfig,
      }),
    [toolPathOrFqbn, additionalUrls, arduinoCliConfig]
  )

  return usePromise(promise)
}
