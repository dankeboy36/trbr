// @ts-check

import path from 'node:path'
import url from 'node:url'

export const isWindows = process.platform === 'win32'

/** @param {string} filename */
export function appendDotExeOnWindows(filename) {
  return `${filename}${isWindows ? '.exe' : ''}`
}

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
export const projectRootPath = path.join(__dirname, '..')
