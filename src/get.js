const { createReadStream } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const { download } = require('./download')
const { extract } = require('./extract')
const { createLog } = require('./log')
const { ProgressCounter } = require('./progress')
const {
  createToolBasename,
  getArchiveType,
  getDownloadUrl,
  tools,
} = require('./tools')

/**
 * @type {typeof import('./index').getTool}
 */
async function getTool({
  tool,
  version,
  destinationFolderPath,
  platform = process.platform,
  arch = process.arch,
  force = false,
  onProgress = () => {},
  signal,
}) {
  const log = createLog('getTool')

  const url = getDownloadUrl({
    tool,
    version,
    platform,
    arch,
  })

  /** @type {(()=>Promise<void>)|undefined} */
  let toCleanupOnError

  const basename = createToolBasename({ tool, platform })
  log('Basename for', tool, platform, 'is', basename)
  const destinationPath = path.join(destinationFolderPath, basename)
  log('Destination path', destinationPath)
  const flags = force
    ? // opens for write truncates the files
      'w'
    : // creates the file on open fails when already exists
      'wx'
  const mode = 511 // decimal equivalent of '0o777'

  try {
    log('Opening destination file', destinationPath, flags, mode)
    const destinationFd = await fs.open(destinationPath, flags, mode)
    if (!force) {
      toCleanupOnError = () => fs.unlink(destinationPath)
    }
    const destination = destinationFd.createWriteStream()

    const downloadResult = await download({ url, signal })

    const counter = new ProgressCounter(downloadResult.length)
    counter.on('progress', onProgress)

    const archiveType = getArchiveType({ tool, platform })
    log('Got archive type', archiveType, 'from', tool, platform)
    const extractResult = await extract({
      source: downloadResult.body.pipe(
        new Transform({
          transform: (chunk, _, next) => {
            counter.onDownload(chunk.length)
            next(null, chunk)
          },
        })
      ),
      archiveType,
      counter,
    })

    const sourcePath = path.join(extractResult.destinationPath, basename)
    const source = createReadStream(sourcePath)

    try {
      log('Piping from', sourcePath, 'to', destinationPath)
      await pipeline(source, destination, { signal })
      log('Piping completed')
      toCleanupOnError = undefined
    } finally {
      await extractResult.cleanup()
    }

    return { toolPath: destinationPath }
  } catch (err) {
    log('Failed to download from', url, err)
    throw err
  } finally {
    await toCleanupOnError?.()
  }
}

module.exports = {
  tools,
  getTool,
}
