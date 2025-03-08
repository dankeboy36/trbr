const { debug } = require('debug')

/**
 * @param {string} namespace
 * @returns {(formatter: any, ...args: any[])=>void}
 */
function createLog(namespace) {
  return debug(`gat:${namespace}`)
}

module.exports = {
  createLog,
}
