const { createWriteStream } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const zlib = require('node:zlib')

const tar = require('tar-stream')
const tmp = require('tmp-promise')
const bz2 = require('unbzip2-stream')
const unzip = require('unzip-stream')

const { createLog } = require('./log')

/**
 * @typedef {Object} ExtractParams
 * @property {Readable} source
 * @property {import('./tools').ArchiveType} archiveType
 * @property {import('./progress').ProgressCounter} [counter]
 *
 * @typedef {Object} ExtractResult
 * @property {string} destinationPath
 * @property {()=>Promise<void>} cleanup
 *
 * @param {ExtractParams} params
 * @returns {Promise<ExtractResult>}
 */
async function extract({ source, archiveType, counter }) {
  const log = createLog('extract')

  const { path: destinationPath, cleanup } = await tmp.dir({
    prefix: 'gat-',
    keep: false,
    tries: 3,
    unsafeCleanup: true,
  })
  log('Extracting to', destinationPath, 'with', archiveType)

  try {
    switch (archiveType) {
      case 'gzip': {
        await extractGzipTar({ source, destinationPath, counter })
        break
      }
      case 'bzip2': {
        await extractBzip2Tar({ source, destinationPath, counter })
        break
      }
      case 'zip': {
        await extractZip({ source, destinationPath, counter })
        break
      }
      default: {
        throw new Error(`Unsupported archive type: ${archiveType}`)
      }
    }
  } catch (err) {
    log('Error extracting to', destinationPath, err)
    try {
      await cleanup()
    } catch {}
    throw err
  }
  log('Extracted to', destinationPath)
  return {
    destinationPath,
    cleanup,
  }
}

async function extractZip({ source, destinationPath, counter }) {
  const log = createLog('extractZip')

  const invalidEntries = []
  const transformEntry = new Transform({
    objectMode: true,
    transform: async (entry, _, next) => {
      counter?.onEnter(entry.size)
      const entryPath = entry.path
      // unzip-stream guards against `..` entry paths by converting them to `.`
      // https://github.com/mhr3/unzip-stream/commit/d5823009634ad448873ec984bed84c18ee92f9b5#diff-fda971882fda4a106029f88d4b0a6eebeb04e7847cae8516b332b5b57e7e3370R153-R154
      if (entryPath.split(path.sep).includes('.')) {
        log('invalid archive entry', entryPath)
        invalidEntries.push(entryPath)
        next()
        return
      }
      const destinationFilePath = path.join(destinationPath, entryPath)
      log('extracting', destinationFilePath)
      await pipeline(
        entry,
        new Transform({
          transform: (chunk, _, next) => {
            counter.onExtract(chunk.length)
            next(null, chunk)
          },
        }),
        createWriteStream(destinationFilePath)
      )
      next()
    },
  })

  await pipeline(source, unzip.Parse(), transformEntry)
  if (invalidEntries.length) {
    throw new Error('Invalid archive entry')
  }
  log('extracting to ', destinationPath)
}

async function extractGzipTar({ source, destinationPath, counter }) {
  const log = createLog('extractGzipTar')
  return extractTar({
    source,
    decompress: zlib.createGunzip(),
    destinationPath,
    log,
    counter,
  })
}

async function extractBzip2Tar({ source, destinationPath, counter }) {
  const log = createLog('extractBzip2Tar')
  return extractTar({
    source,
    decompress: bz2(),
    destinationPath,
    log,
    strip: 1, // non-Arduino tools have a parent folder
    counter,
  })
}

async function extractTar({
  source,
  decompress,
  destinationPath,
  log,
  strip = 0,
  counter,
}) {
  log('extracting to ', destinationPath)

  const invalidEntries = []
  const extract = tar.extract()

  extract.on('entry', (header, stream, next) => {
    if (header.type === 'directory') {
      stream.resume()
      stream.on('end', next)
      return
    }

    counter?.onEnter(header.size)
    let entryPath = header.name
    if (strip > 0) {
      // the path is always POSIX inside the tar. For example, "folder/fake-tool"
      const parts = entryPath.split(path.posix.sep).slice(strip)
      entryPath = parts.length ? parts.join(path.sep) : entryPath
    }

    const destinationFilePath = path.join(destinationPath, entryPath)
    const resolvedPath = path.resolve(destinationFilePath)
    if (!resolvedPath.startsWith(path.resolve(destinationPath))) {
      log('invalid archive entry', entryPath)
      invalidEntries.push(entryPath)
      stream.resume()
      stream.on('end', next)
      return
    }

    fs.mkdir(path.dirname(destinationFilePath), { recursive: true })
      .then(() => {
        log('extracting', destinationFilePath)
        return pipeline(
          stream,
          new Transform({
            transform: (chunk, _, next) => {
              counter.onExtract(chunk.length)
              next(null, chunk)
            },
          }),
          createWriteStream(destinationFilePath)
        )
      })
      .then(() => next())
      .catch(next)
  })

  await pipeline(source, decompress, extract)
  if (invalidEntries.length) {
    throw new Error('Invalid archive entry')
  }
  log('extracted to', destinationPath)
}

module.exports = {
  extract,
}
