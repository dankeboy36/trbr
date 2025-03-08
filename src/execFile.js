const cp = require('node:child_process')
const { promisify } = require('node:util')

const { createLog } = require('./log')

const execFileAsync = promisify(cp.execFile)

/**
 * @param {string} file
 * @param {readonly string[]} [args=[]]
 * @param {boolean} [canError=false]
 */
async function execFile(file, args = [], canError = false) {
  const log = createLog('execFile')

  log(`execFile: ${file} ${args.join(' ')}`)
  try {
    const { stdout } = await execFileAsync(file, args)
    return stdout.trim()
  } catch (err) {
    if (canError && 'stderr' in err) {
      return err.stderr.trim()
    }
    throw err
  }
}

module.exports = {
  execFile,
}
