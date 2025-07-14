// @ts-check

import clipboard from 'clipboardy'
import debounce from 'lodash.debounce'

import { decode, stringifyDecodeResult } from '../lib/index.js'

/**
 * @typedef {Object} ResolveDecodeTargetParams
 * @property {string} toolPathOrFqbn
 * @property {import('../lib/decode/decode.js').DecodeTarget} [targetArch]
 */

let currentAbortController
let lastClipboardText = ''

/** @param {import('./appArgs.js').AppArgs} args */
export async function app(args) {
  const { decodeParams, decodeInput, version } = args

  if (decodeInput) {
    // Non-interactive: decode once and print
    const result = await decode(decodeParams, decodeInput)
    console.log(stringifyDecodeResult(result))
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

      const result = await decode(decodeParams, text, { signal })
      process.stdout.write('\x1b[1A\x1b[2K') // move cursor up one line and clear it
      process.stdout.write('\r\n')
      process.stdout.write(stringifyDecodeResult(result))
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
