const { ReadableStream } = require('node:stream/web')
const { Readable } = require('node:stream')

const xhr = require('request-light-stream')
const { CancellationTokenSource } = require('vscode-jsonrpc')

const { createLog } = require('./log')

/**
 * @typedef {Object} DownloadParams
 * @property {string} url
 * @property {AbortSignal} [signal]
 *
 * @typedef {Object} DownloadResult
 * @property {Readable} body
 * @property {number} length
 *
 * @param {DownloadParams} params
 * @returns {Promise<DownloadResult>}
 */
async function download({ url, signal }) {
  const log = createLog('download')

  /** @type {xhr.CancellationToken|undefined} */
  let token
  if (signal) {
    const source = new CancellationTokenSource()
    token = source.token
    signal.addEventListener('abort', () => source.cancel())
  }

  log('Downloading', url)
  try {
    const { body, status, headers } = await xhr.xhr({
      url,
      responseType: 'stream',
      token,
    })
    if (status !== 200) {
      throw new Error(`Failed to download ${url}: unexpected status ${status}`)
    }
    if (!body) {
      throw new Error(`Failed to download ${url}: no body`)
    }
    log(`Downloaded ${url}`)

    const length = getContentLength(headers)
    return {
      body: createReadableFromWeb(body),
      length,
    }
  } catch (err) {
    log(
      `Error downloading ${url}: ${
        err instanceof Error ? err : JSON.stringify(err)
      }`
    )
    throw new Error(
      err.responseText ||
        (err.status && xhr.getErrorStatusDescription(err.status)) ||
        err.toString()
    )
  }
}

/**
 * @param {import('request-light-stream').XHRResponse['headers']} [headers]
 */
function getContentLength(headers) {
  return (
    Object.entries(headers ?? {}).reduce(
      (/** @type {number[]}*/ acc, [key, value]) => {
        if (key.toLowerCase() === 'content-length') {
          const lengthValue = Array.isArray(value) ? value[0] : value
          if (lengthValue) {
            const length = parseInt(lengthValue, 10)
            if (!Number.isNaN(length)) {
              acc.push(length)
            }
          }
        }
        return acc
      },
      []
    )[0] ?? 0
  )
}

/**
 * @param {ReadableStream} body
 * @returns {Readable}
 */
function createReadableFromWeb(body) {
  const reader = body.getReader()
  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read()
        if (done) {
          this.push(null)
        } else {
          this.push(Buffer.from(value))
        }
      } catch (err) {
        this.destroy(err)
      }
    },
  })
}

module.exports = {
  download,
}
