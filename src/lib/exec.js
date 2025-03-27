// @ts-check

import { x } from 'tinyexec'

/**
 * @type {typeof x}
 */
export function exec(command, args, options) {
  return x(command, args, { ...options, throwOnError: true })
}
