// @ts-check

import cp from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { glob } from 'glob'
import unzipper from 'unzipper'

import { appendDotExeOnWindows, projectRootPath } from '../utils.js'

const { version: expectedVersion } = JSON.parse(
  readFileSync(path.join(projectRootPath, 'package.json'), 'utf8')
)

/**
 * Smoke test setup:
 *
 * - Checks if `bin/trbr(.exe)?` exists and matches expected version.
 * - If not, unpacks latest `trbr-*.zip` into `bin/` and checks version.
 * - If still not valid, runs `npm run package`, unpacks zip, checks version.
 * - Returns the path to the valid `trbr` binary.
 */

const binDirPath = path.join(projectRootPath, 'bin')
const trbrBinPath = path.join(binDirPath, appendDotExeOnWindows('trbr'))

/** @returns {Promise<string>} - Path to usable `trbr` binary */
export async function setupTrbrCli() {
  if (await isValidTrbr(trbrBinPath)) {
    return trbrBinPath
  }

  const zipPath = await findZip(binDirPath)
  if (zipPath) {
    await unzip(zipPath, binDirPath)
    if (await isValidTrbr(trbrBinPath)) {
      return trbrBinPath
    }
  }

  const execFile = promisify(cp.execFile)
  await execFile('npm', ['run', 'package'], { cwd: projectRootPath })

  const newZipPath = await findZip(binDirPath)
  if (!newZipPath) {
    throw new Error('Failed to package trbr: zip not found')
  }

  await unzip(newZipPath, binDirPath)
  if (await isValidTrbr(trbrBinPath)) {
    return trbrBinPath
  }

  throw new Error('Failed to setup valid trbr CLI')
}

/** @param {string} cliPath */
async function isValidTrbr(cliPath, fixChmod = true) {
  try {
    const execFile = promisify(cp.execFile)
    const envCopy = JSON.parse(JSON.stringify(process.env))
    if (envCopy.NODE_OPTIONS?.includes('--inspect-publish-uid=http')) {
      // Let the smoke tests run from VS Code JS Debug console.
      // Otherwise, it's an '--inspect-publish-uid= is not allowed in NODE_OPTIONS' error.
      delete envCopy.NODE_OPTIONS
    }
    const { stdout } = await execFile(cliPath, ['--version'], { env: envCopy })
    return stdout.toString().trim() === expectedVersion
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      err.code === 'EACCES' &&
      fixChmod
    ) {
      await chmod(cliPath, 0o755)
      return isValidTrbr(cliPath, false)
    }
    return false
  }
}

/** @param {string} cwd */
async function findZip(cwd) {
  const archives = await glob(`trbr_${expectedVersion}_*.zip`, {
    cwd,
    absolute: true,
  })
  return archives.shift()
}

/**
 * @param {string} zipFile
 * @param {string} destDirPath
 */
async function unzip(zipFile, destDirPath) {
  const directory = await unzipper.Open.file(zipFile)
  await directory.extract({ path: destDirPath, verbose: true })
}
