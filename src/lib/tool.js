// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'

import { exec } from './exec.js'
import { appendDotExeOnWindows } from './os.js'

/**
 * @typedef {Object} FindTooPathParams
 * @property {string} arduinoCliPath
 * @property {import('fqbn').FQBN} fqbn
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 */

/**
 * @param {FindTooPathParams} params
 * @param {import('./decode/decode.js').DecodeOptions} [options]
 */
export async function findToolPath(
  { arduinoCliPath, fqbn, arduinoCliConfig, additionalUrls },
  options
) {
  const buildProperties = await resolveBuildProperties(
    {
      arduinoCliPath,
      fqbn,
      additionalUrls,
      arduinoCliConfig,
    },
    options
  )
  return resolveToolPath({ fqbn, buildProperties })
}

/**
 * @param {FindTooPathParams} params
 * @param {import('./decode/decode.js').DecodeOptions} [options]
 */
export async function resolveBuildProperties(
  { arduinoCliPath, fqbn, arduinoCliConfig, additionalUrls },
  options
) {
  const { stdout } = await execBoardDetails({
    arduinoCliPath,
    fqbn,
    arduinoCliConfig,
    additionalUrls,
    signal: options?.signal,
  })

  const { build_properties } = JSON.parse(stdout)
  return parseBuildProperties(build_properties)
}

/**
 * @typedef {Object} ResolveTargetArchParams
 * @property {Record<string, string>} buildProperties
 */

const riscTargetArchs = /** @type {const} */ ([
  'esp32c2',
  'esp32c3',
  'esp32c6',
  'esp32h2',
  'esp32h4',
])
const defaultTargetArch = /** @type {const} */ ('xtensa')

export const targetArchs = /** @type {const} */ ([
  defaultTargetArch,
  ...riscTargetArchs,
])

/** @typedef {typeof targetArchs[number]} DecodeTarget */

/** @typedef {typeof riscTargetArchs[number]} RiscvTargetArch */

/**
 * @param {unknown} arg
 * @returns {arg is RiscvTargetArch}
 */
export function isRiscvTargetArch(arg) {
  return (
    typeof arg === 'string' &&
    riscTargetArchs.includes(/** @type {RiscvTargetArch} */ (arg))
  )
}

const buildMcu = 'build.mcu'

/**
 * @param {ResolveTargetArchParams} params
 * @returns {Required<import('./decode/decode.js').DecodeParams['targetArch']>}
 */
export function resolveTargetArch({ buildProperties }) {
  const mcu = buildProperties[buildMcu]
  if (isRiscvTargetArch(mcu)) {
    return mcu
  }
  return defaultTargetArch
}

const esp32 = 'esp32'
const esp8266 = 'esp8266'
const supportedArchitectures = new Set([esp32, esp8266])

const defaultTarch = 'xtensa'
const defaultTarget = 'lx106'

const buildTarch = 'build.tarch'
const buildTarget = 'build.target'

/**
 * @typedef {Object} ResolveToolPathParams
 * @property {import('fqbn').FQBN} fqbn
 * @property {Record<string, string>} buildProperties
 */

/**
 * @param {ResolveToolPathParams} params
 * @returns {Promise<string>}
 */
export async function resolveToolPath({ fqbn, buildProperties }) {
  const { arch } = fqbn
  if (!supportedArchitectures.has(arch)) {
    throw new Error(`Unsupported board architecture: '${fqbn}'`)
  }
  let tarch = defaultTarch
  let target = defaultTarget
  if (arch === esp32) {
    tarch = buildProperties[buildTarch] ?? defaultTarch
    target = buildProperties[buildTarget] ?? defaultTarget
  }

  const toolchain = `${tarch}-${target}-elf`
  const gdbTool = `${tarch}-esp-elf-gdb`
  const gdb = appendDotExeOnWindows(`${toolchain}-gdb`)

  /** @type {(key:string)=>Promise<string|undefined>} */
  async function find(key) {
    const value = buildProperties[key]
    if (value) {
      const toolPath = path.join(value, 'bin', gdb)
      try {
        await fs.access(toolPath)
        return toolPath
      } catch {}
    }
    return undefined
  }

  // `runtime.tools.*` won't work for ESP32 installed from Git. See https://github.com/arduino/arduino-cli/issues/2197#issuecomment-1572921357.
  // `runtime.tools.*` ESP8266 requires this. Hence, the fallback here.
  const gdbToolPath = `tools.${gdbTool}.path`
  const toolChainGCCPath = `tools.${toolchain}-gcc.path`
  const toolPaths = await Promise.all([
    find(`runtime.${gdbToolPath}`),
    find(`runtime.${toolChainGCCPath}`),
    find(gdbToolPath),
    find(toolChainGCCPath),
  ])
  const toolPath = toolPaths.find((p) => p)
  if (!toolPath) {
    throw new Error(`Could not find GDB tool for '${fqbn}'`)
  }
  return toolPath
}

/**
 * @typedef {Object} ExecBoardDetailsParams
 * @property {import('fqbn').FQBN} fqbn
 * @property {string} arduinoCliPath
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 * @property {AbortSignal} [signal]
 */

/**
 * @param {ExecBoardDetailsParams} params
 */
async function execBoardDetails({
  fqbn,
  arduinoCliPath,
  arduinoCliConfig,
  additionalUrls,
  signal,
}) {
  const args = ['board', 'details', '-b', fqbn.toString(), '--format', 'json']
  if (arduinoCliConfig) {
    args.push('--config-file', arduinoCliConfig)
  }
  if (additionalUrls) {
    args.push('--additional-urls', additionalUrls)
  }
  return exec(arduinoCliPath, args, { signal })
}

/**
 * @param {string[]} properties
 */
function parseBuildProperties(properties) {
  return properties.reduce((acc, curr) => {
    const entry = parseProperty(curr)
    if (entry) {
      const [key, value] = entry
      acc[key] = value
    }
    return acc
  }, /** @type {Record<string, string>} */ ({}))
}

const propertySep = '='
/** @param {string} property */
function parseProperty(property) {
  const segments = property.split(propertySep)
  if (segments.length < 2) {
    console.warn(`Could not parse build property: ${property}.`)
    return undefined
  }
  const [key, ...rest] = segments
  if (!key) {
    console.warn(`Could not determine property key from raw: ${property}.`)
    return undefined
  }
  const value = rest.join(propertySep)
  return [key, value]
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  parseProperty,
})
