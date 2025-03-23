// @ts-check

/**
 * @param {unknown} arg
 * @returns {arg is import('../index').GDBLine}
 */
export function isGDBLine(arg) {
  return (
    arg !== null &&
    typeof arg === 'object' &&
    'address' in arg &&
    typeof arg.address === 'string' &&
    'lineNumber' in arg &&
    typeof arg.lineNumber === 'string'
  )
}

/**
 *
 * @param {unknown} arg
 * @returns {arg is import('../index').ParsedGDBLine}
 */
export function isParsedGDBLine(arg) {
  return (
    isGDBLine(arg) &&
    'file' in arg &&
    typeof arg.file === 'string' &&
    'method' in arg &&
    typeof arg.method === 'string'
  )
}
