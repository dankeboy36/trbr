describe('index', () => {
  it('should export the getTool function', () => {
    const { getTool } = require('./index')
    expect(typeof getTool).toBe('function')
  })
})
