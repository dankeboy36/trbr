const { debug } = require('debug')

const { createLog } = require('./log')

const mockLog = jest.fn()
jest.mock('debug', () => ({ debug: jest.fn(() => mockLog) }))

describe('log', () => {
  beforeEach(() => {
    mockLog.mockClear()
  })

  it('should create a namespaced logger', () => {
    createLog('test')
    expect(debug).toHaveBeenCalledWith('gat:test')
  })

  it('should log', () => {
    const log = createLog('test')
    log('message', 'arg1', 'arg2')
    expect(mockLog).toHaveBeenCalledWith('message', 'arg1', 'arg2')
  })
})
