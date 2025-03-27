// @ts-check

import { FQBN } from 'fqbn'
import { useState } from 'react'

import { isRiscvFQBN } from '../../lib/index.js'

/** @typedef {import('../../index.js').DecodeTarget} DecodeTarget */

/**
 * @typedef {Object} UseModeParams
 * @property {string} toolPathOrFqbn
 * @property {DecodeTarget} [targetArch]
 */

/**
 * @param {UseModeParams} params
 * @returns {DecodeTarget}
 */
export function useDecodeTarget({ toolPathOrFqbn, targetArch }) {
  const [resolvedTarget] = useState(
    resolveDecodeTarget({ toolPathOrFqbn, targetArch })
  )
  return resolvedTarget
}

/**
 * @param {UseModeParams} params
 * @returns {DecodeTarget}
 */
function resolveDecodeTarget({ toolPathOrFqbn, targetArch }) {
  if (targetArch) {
    return targetArch
  }

  try {
    const fqbn = new FQBN(toolPathOrFqbn)
    return isRiscvFQBN(fqbn) ? fqbn.boardId : 'xtensa'
  } catch {
    return 'xtensa'
  }
}
