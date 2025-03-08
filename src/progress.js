const { EventEmitter } = require('node:events')

const { createLog } = require('./log')

class ProgressCounter extends EventEmitter {
  /**
   * @param {number} toDownloadBytes
   */
  constructor(toDownloadBytes) {
    super()
    this.log = createLog('progress')
    this.toDownloadBytes = toDownloadBytes
    this.downloadedBytes = 0

    this.toExtractBytes = 0
    this.extractedBytes = 0

    this.currentPercentage = 0
  }

  /**
   * @param {number} length
   */
  onDownload(length) {
    this.downloadedBytes += length
    this.log('download', length, this.downloadedBytes, this.toDownloadBytes)
    this.work()
  }

  /**
   * @param {number} length
   */
  onEnter(length) {
    this.toExtractBytes += length
    this.log('enter', length, this.extractedBytes, this.toExtractBytes)
    this.work()
  }

  /**
   * @param {number} length
   */
  onExtract(length) {
    this.extractedBytes += length
    this.log('extract', length, this.extractedBytes, this.toExtractBytes)
    this.work()
  }

  work() {
    let downloadPercentage = 0
    if (this.toDownloadBytes) {
      downloadPercentage = Math.trunc(
        (this.downloadedBytes / this.toDownloadBytes) * 50
      )
    }
    let extractedPercentage = 0
    if (this.toExtractBytes) {
      extractedPercentage = Math.trunc(
        (this.extractedBytes / this.toExtractBytes) *
          (this.toDownloadBytes ? 50 : 100)
      )
    }

    let nextPercentage = downloadPercentage + extractedPercentage
    this.log('next', nextPercentage, 'current', this.currentPercentage)

    if (nextPercentage > this.currentPercentage) {
      this.currentPercentage = nextPercentage
      /** @type {import('./index').OnProgressParams} */
      const progressEvent = { current: this.currentPercentage }
      this.log('emit progress', progressEvent)
      this.emit('progress', progressEvent)
    }
  }
}

module.exports = {
  ProgressCounter,
}
