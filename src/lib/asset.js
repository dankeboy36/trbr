// @ts-check

import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import stream from 'node:stream/promises'

import packageJson from '../../package.json'
import { appendDotExeOnWindows } from './os.js'

/**
 * @typedef {Object} ResolveAssetParams
 * @property {string} name
 * @property {string} version
 * @property {Blob} blob
 */

/**
 * @param {ResolveAssetParams} params
 * @returns {Promise<string>}
 */
export async function resolveAssetPath({ name, version, blob }) {
  const binaryBasename = appendDotExeOnWindows(name)
  const binaryDirPath = path.join(assetsBinDirPath, name, version)
  const binaryPath = path.join(binaryDirPath, binaryBasename)

  let closeHandle
  let removeBin
  try {
    await fs.mkdir(binaryDirPath, { recursive: true })
    // xw to create the file but fail if it already exists
    // 0o755 to make the file executable
    const handle = await fs.open(binaryPath, 'wx', 0o755)
    closeHandle = () => handle.close()
    removeBin = () => fs.rm(binaryPath)

    // @ts-ignore
    const source = Readable.fromWeb(blob.stream())
    const destination = handle.createWriteStream()

    await stream.pipeline(source, destination)
    removeBin = undefined

    return binaryPath
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return binaryPath
    }
    throw error
  } finally {
    closeHandle?.()
    await removeBin?.()
  }
}

const assetsRootDirName = `.${packageJson.name}`
const assetsBinDirPath = path.join(tmpdir(), assetsRootDirName, 'bin')

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  assetsBinDirPath,
})
