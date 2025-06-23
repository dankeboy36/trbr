// @ts-check

import clipboard from 'clipboardy'
import { FQBN, valid } from 'fqbn'
import debounce from 'lodash.debounce'

import {
  decode,
  defaultTargetArch,
  isRiscvFQBN,
  stringifyDecodeResult,
} from '../lib/index.js'
import { findToolPath } from '../lib/tool.js'
import { resolveArduinoCliPath } from './arduino.js'

/**
 * @typedef {Object} AppArgs
 * @property {string} elfPath
 * @property {string} toolPathOrFqbn
 * @property {string} version
 * @property {import('../lib/decode/decode.js').DecodeInputFileSource} decodeInput
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 * @property {import('../lib/decode/decode.js').DecodeTarget} [targetArch]
 * @property {boolean} [color=true]
 */

/**
 * @typedef {Object} ResolveToolPathParams
 * @property {string} toolPathOrFqbn
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 */

/**
 * @param {ResolveToolPathParams} params
 */
async function resolveToolPath({
  toolPathOrFqbn,
  additionalUrls,
  arduinoCliConfig,
}) {
  if (!valid(toolPathOrFqbn)) {
    return toolPathOrFqbn
  }

  const arduinoCliPath = await resolveArduinoCliPath()
  return findToolPath({
    arduinoCliPath,
    fqbn: new FQBN(toolPathOrFqbn),
    additionalUrls,
    arduinoCliConfig,
  })
}

/**
 * @typedef {Object} ResolveDecodeTargetParams
 * @property {string} toolPathOrFqbn
 * @property {import('../lib/decode/decode.js').DecodeTarget} [targetArch]
 */

/**
 * @param {ResolveDecodeTargetParams} params
 * @returns {import('../lib/decode/decode.js').DecodeTarget}
 */
function resolveDecodeTarget({ toolPathOrFqbn, targetArch }) {
  if (targetArch) {
    return targetArch
  }

  try {
    const fqbn = new FQBN(toolPathOrFqbn)
    return isRiscvFQBN(fqbn) ? fqbn.boardId : defaultTargetArch
  } catch {
    return defaultTargetArch
  }
}

/**
 * @param {import('../lib/decode/decode.js').DecodeInputFileSource} input
 * @returns {Promise<import('../lib/decode/decode.js').DecodeInput|undefined>}
 */
async function resolveDecodeInput(input) {
  if (input.inputPath) {
    return input
  }
  if (!process.stdin.isTTY) {
    let stdinInput = ''
    for await (const chunk of process.stdin) {
      stdinInput += chunk
    }
    return stdinInput.trim()
  }
  return undefined
}

let currentAbortController
let lastClipboardText = ''

/**
 * @param {AppArgs} props
 */
export async function app(props) {
  const {
    elfPath,
    decodeInput,
    toolPathOrFqbn,
    arduinoCliConfig,
    additionalUrls,
    color,
    version,
  } = props

  // Resolve the tool path
  const toolPath = await resolveToolPath({
    toolPathOrFqbn,
    arduinoCliConfig,
    additionalUrls,
  })
  const targetArch = resolveDecodeTarget({
    toolPathOrFqbn,
    targetArch: props.targetArch,
  })

  // Determine decode input: from props.input or stdin
  const decodeParam = await resolveDecodeInput(decodeInput)

  if (decodeParam) {
    // Non-interactive: decode once and print
    const result = await decode({ toolPath, elfPath, targetArch }, decodeParam)
    console.log(
      stringifyDecodeResult(result, {
        lineSeparator: '\r\n',
        enableAnsiColor: color,
      })
    )
    process.exit(0)
  }

  // Interactive mode
  const decodeAndPrint = async (text) => {
    currentAbortController?.abort()
    currentAbortController = new AbortController()
    const signal = currentAbortController.signal

    try {
      process.stdout.write('\x1bc')
      process.stdout.write(`TraceBreaker ${version}\r\n\r\n`)
      process.stdout.write(text.replace(/\r/g, '\r\n') + '\r\n')
      process.stdout.write('Decoding input...r\n')

      const result = await decode({ toolPath, elfPath, targetArch }, text, {
        signal,
      })
      process.stdout.write('\x1b[1A\x1b[2K') // move cursor up one line and clear it
      process.stdout.write('\r\n')
      process.stdout.write(
        stringifyDecodeResult(result, {
          lineSeparator: '\r\n',
          enableAnsiColor: color,
        })
      )
    } catch (err) {
      process.stdout.write('\x1b[1A\x1b[2K') // move cursor up one line and clear it
      process.stdout.write('\r\n')
      process.stdout.write(err instanceof Error ? err.message : err)
    } finally {
      process.stdout.write('\r\n')
      process.stdout.write('\r\n')
      process.stdout.write('Paste input to decode, press Ctrl+C to exit...\n')
    }
  }

  const triggerDecode = debounce(
    async () => {
      const text = await clipboard.read()
      if (text && text !== lastClipboardText) {
        lastClipboardText = text
        await decodeAndPrint(text)
      }
    },
    1000,
    { leading: true, trailing: false }
  )

  process.stdout.write('\x1bc')
  process.stdout.write(`TraceBreaker ${version}\r\n\r\n`)
  process.stdout.write('Paste input to decode, press Ctrl+C to exit...\r\n')
  if (typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (key) => {
    // @ts-ignore raw mode
    if (key === '\u0003') {
      process.exit()
    }
    triggerDecode()
  })
}
