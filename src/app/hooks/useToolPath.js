// @ts-check

import { FQBN, valid as validFQBN } from 'fqbn'
import { useMemo } from 'react'

import { findToolPath } from '../../lib/tool.js'
import { resolveArduinoCliPath } from '../services/arduino.js'
import { usePromise } from './usePromise.js'

/**
 * @typedef {Object} UseToolPathParams
 * @property {string} toolPathOrFqbn
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 */

/**
 * @param {UseToolPathParams} params
 */
export function useToolPath({
  toolPathOrFqbn,
  additionalUrls,
  arduinoCliConfig,
}) {
  const promise = useMemo(async () => {
    if (!validFQBN(toolPathOrFqbn)) {
      return toolPathOrFqbn
    }

    const arduinoCliPath = await resolveArduinoCliPath()
    return findToolPath({
      arduinoCliPath,
      fqbn: new FQBN(toolPathOrFqbn),
      additionalUrls,
      arduinoCliConfig,
    })
  }, [toolPathOrFqbn, additionalUrls, arduinoCliConfig])

  return usePromise(promise)
}
