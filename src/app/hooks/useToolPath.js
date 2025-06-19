// @ts-check

import { useAsync, useMountEffect } from '@react-hookz/web'
import { FQBN, valid as validFQBN } from 'fqbn'
import { useMemo } from 'react'

import { findToolPath } from '../../lib/tool.js'
import { resolveArduinoCliPath } from '../services/arduino.js'

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

  const [state, actions] = useAsync(() => promise)

  useMountEffect(actions.execute)

  return {
    status: state.status,
    result: state.result,
    error: state.error,
  }
}
