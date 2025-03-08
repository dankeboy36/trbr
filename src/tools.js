const { posix } = require('node:path')

const { createLog } = require('./log')

/**
 * @typedef {import('./index').Tool} Tool
 * @typedef {import('./index').ArduinoTool} ArduinoTool
 */

const arduinoTools = [
  'arduino-cli',
  'arduino-language-server',
  'arduino-fwuploader',
]
const clangTools = ['clangd', 'clang-format']
const tools = /** @type {readonly Tool[]} */ ([...arduinoTools, ...clangTools])

/**
 * @param {Tool} tool
 * @returns {tool is ArduinoTool}
 */
function isArduinoTool(tool) {
  return arduinoTools.includes(tool)
}

/**
 * @param {{tool:Tool, platform:NodeJS.Platform}} params
 * @returns string
 */
function createToolBasename({ tool, platform }) {
  return `${tool}${platform === 'win32' ? '.exe' : ''}`
}

/**
 * @typedef {Object} GetDownloadUrlParams
 * @property {Tool} tool
 * @property {string} version
 * @property {NodeJS.Platform} platform
 * @property {NodeJS.Architecture} arch
 * @property {AbortSignal} [signal]
 *
 * @param {GetDownloadUrlParams} params
 * @returns {string}
 */
function getDownloadUrl({ tool, version, platform, arch }) {
  const log = createLog('getDownloadUrl')

  log('Getting tool name for', tool, version, platform, arch)
  if (!tools.includes(tool)) {
    throw new Error(`Unsupported tool: ${tool}`)
  }

  const suffix = getToolSuffix({ platform, arch })
  log('Tool suffix', suffix)

  const ext = getArchiveExtension({ tool, platform })
  log('Archive extension', ext)

  const remoteFilename = `${tool}_${version}_${suffix}${ext}`
  log('Remove filename', remoteFilename)

  const downloadUrl = new URL('https://downloads.arduino.cc')
  const category = isArduinoTool(tool) ? tool : 'tools'
  downloadUrl.pathname = posix.join(category, remoteFilename)
  const url = downloadUrl.toString()
  log('URL', url)

  return url
}

function getToolSuffix({ platform, arch }) {
  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return 'macOS_ARM64'
    }
    return 'macOS_64bit'
  } else if (platform === 'linux') {
    switch (arch) {
      case 'arm64':
        return 'Linux_ARM64'
      case 'x64':
        return 'Linux_64bit'
      case 'arm':
        return 'Linux_ARMv7'
    }
  } else if (platform === 'win32') {
    return 'Windows_64bit'
  }
  throw new Error(`Unsupported platform: ${platform}, arch: ${arch}`)
}

const archiveTypes = /** @type {const} */ (['zip', 'gzip', 'bzip2'])

/** @typedef {typeof archiveTypes[number]} ArchiveType */

/** @type {Record<ArchiveType, string>} */
const extMapping = {
  zip: '.zip',
  gzip: '.tar.gz',
  bzip2: '.tar.bz2',
}

/**
 * @param {{tool:Tool, platform: NodeJS.Platform}} params
 * @return {ArchiveType}
 */
function getArchiveType({ tool, platform }) {
  if (!isArduinoTool(tool)) {
    return 'bzip2'
  }
  switch (platform) {
    case 'win32':
      return 'zip'
    default:
      return 'gzip'
  }
}

function getArchiveExtension({ tool, platform }) {
  return extMapping[getArchiveType({ tool, platform })]
}

module.exports = {
  tools,
  isArduinoTool,
  createToolBasename,
  getDownloadUrl,
  getArchiveType,
}
