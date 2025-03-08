const { ProgressCounter } = require('./progress')

describe('progress', () => {
  describe('ProgressCounter', () => {
    it('handles when toDownloadBytes is 0', () => {
      const counter = new ProgressCounter(0)
      const onProgress = jest.fn()
      counter.on('progress', onProgress)

      counter.onDownload(10)
      counter.onDownload(10)

      expect(onProgress).not.toHaveBeenCalled()

      counter.onEnter(100)

      counter.onExtract(25)
      counter.onExtract(25)
      counter.onExtract(25)
      counter.onExtract(25)

      expect(onProgress).toHaveBeenNthCalledWith(1, { current: 25 })
      expect(onProgress).toHaveBeenNthCalledWith(2, { current: 50 })
      expect(onProgress).toHaveBeenNthCalledWith(3, { current: 75 })
      expect(onProgress).toHaveBeenNthCalledWith(4, { current: 100 })
    })
  })
})
