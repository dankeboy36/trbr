// @ts-check

import colors from 'tinyrainbow'

import { isParsedGDBLine } from './decode.js'

/** @typedef {import('./coredump.js').CoredumpDecodeResult} CoredumpDecodeResult */
/** @typedef {import('./coredump.js').ThreadDecodeResult} ThreadDecodeResult */

const defaultOptions = {
  enableAnsiColor: true,
  lineSeparator: '\r\n',
}

/**
 * @typedef {Object} StringifyOptions
 * @property {boolean} [enableAnsiColor=false]
 * @property {string} [lineSeparator='\n']
 */

/**
 * @param {CoredumpDecodeResult} result
 * @param {StringifyOptions} options
 */
function stringifyCoredumpDecodeResult(result, options) {
  const lines = [...stringifyThreadsInfo(result, options), '']

  for (let i = 0; i < result.length; i++) {
    const thread = result[i]
    lines.push(
      formatThreadHeader(thread),
      ...stringifyThreadDecodeResult(thread, options)
    )
    if (i < result.length - 1) {
      lines.push('')
    }
  }

  return lines.join(options.lineSeparator)
}

/**
 * @param {import('./decode.js').DecodeResult | CoredumpDecodeResult} result
 * @param {StringifyOptions} [options]
 */
export function stringifyDecodeResult(result, options = defaultOptions) {
  options = { ...defaultOptions, ...options }

  if (Array.isArray(result)) {
    return stringifyCoredumpDecodeResult(result, options)
  }
  return stringifySingleDecodeResult(result, options)
}

/**
 * @param {import('./decode.js').DecodeResult} result
 * @param {StringifyOptions} options
 */
function stringifySingleDecodeResult(result, options) {
  const lines = []
  const errorOptions = createStringifyAddrLocationOptions(options, true)
  const stdOptions = createStringifyAddrLocationOptions(options)

  const red = options.enableAnsiColor
    ? colors.red
    : (/** @type {string} */ text) => text

  if (typeof result.faultInfo?.faultCode === 'number') {
    let faultCodeLine = `${result.faultInfo.coreId}`
    if (result.faultInfo.faultMessage) {
      faultCodeLine += ` | ${result.faultInfo.faultMessage}`
    }
    faultCodeLine += ` | ${result.faultInfo.faultCode}`
    lines.push(red(faultCodeLine))
  }

  const pc = result.faultInfo?.programCounter.location
  if (pc) {
    if (lines.length) {
      lines.push('')
    }
    lines.push(`${red('PC -> ')}${stringifyAddrLocation(pc, errorOptions)}`)
  }

  const faultAddr = result.faultInfo?.faultAddr?.location
  if (faultAddr) {
    lines.push(
      `${red('fault addr -> ')}${stringifyAddrLocation(
        faultAddr,
        errorOptions
      )}`
    )
  }

  if (result.stacktraceLines.length && lines.length) {
    lines.push('')
  }

  for (const line of result.stacktraceLines) {
    lines.push(stringifyAddrLocation(line, stdOptions))
  }

  if (result.allocInfo) {
    if (lines.length) {
      lines.push('')
    }
    lines.push(
      `${red(
        `Memory allocation of ${result.allocInfo.allocSize} bytes failed`
      )}${stdOptions.color(' at ')}${stringifyAddrLocation(
        result.allocInfo.allocAddr,
        stdOptions
      )}`
    )
  }

  return lines.join(options.lineSeparator)
}

/**
 *
 * @param {CoredumpDecodeResult} result
 * @param {Pick<StringifyOptions, 'enableAnsiColor'>} options
 */
function stringifyThreadsInfo(result, options = defaultOptions) {
  const lines = []
  lines.push('==================== THREADS INFO ====================')
  lines.push('  ID  Target ID            Frame')

  const addrLocationOptions = createStringifyAddrLocationOptions(options)
  for (const thread of result) {
    const mark = thread.current ? '*' : ' '
    const tid = thread.threadId.toString().padStart(2)
    const tcb = thread.TCB.toString().padEnd(12)
    const top = thread.result.stacktraceLines?.[0]
    lines.push(
      ` ${mark}${tid}  process ${tcb} ${stringifyAddrLocation(
        top,
        addrLocationOptions
      )}`
    )
  }
  return lines
}

/**
 * @param {ThreadDecodeResult} thread
 */
function formatThreadHeader(thread) {
  return `==================== THREAD ${
    thread.threadId
  } (TCB: 0x${(+thread.TCB).toString(16)}) ====================`
}

/**
 * @param {ThreadDecodeResult} result
 * @param {Pick<StringifyOptions, 'enableAnsiColor'>} options
 */
function stringifyThreadDecodeResult(result, options) {
  const lines = []
  const addrLocationOptions = createStringifyAddrLocationOptions(options)
  for (const line of result.result.stacktraceLines) {
    lines.push(stringifyAddrLocation(line, addrLocationOptions))
  }
  return lines
}

/**
 * @param {Pick<StringifyOptions, 'enableAnsiColor'>} options
 * @param {boolean} [isError=false]
 */
function createStringifyAddrLocationOptions(options, isError = false) {
  const text = (/** @type {string} */ text) => text
  if (!options.enableAnsiColor) {
    return {
      color: text,
    }
  }

  return {
    color: (
      /** @type {string} */ text,
      /** @type {'blue'|'green'|undefined} */ color = undefined
    ) => {
      if (isError) {
        return red(text)
      }

      switch (color) {
        case 'blue':
          return blue(text)
        case 'green':
          return green(text)
        default:
          return text
      }
    },
  }
}

/**
 * @typedef {Object} StringifyAddrLocationOptions
 * @property {(text:string, color?:'green'|'blue')=>string} color
 */

/**
 * @param {import('./decode.js').AddrLocation} location
 * @param {StringifyAddrLocationOptions} options
 */
function stringifyAddrLocation(location, options) {
  if (typeof location === 'string') {
    return options.color(location)
  }
  if (!isParsedGDBLine(location)) {
    return `${options.color(location.regAddr, 'green')}${options.color(
      `: ${location.lineNumber}`
    )}`
  }

  const args =
    location.args
      ?.map((arg) => `${arg.name}${arg.value ? `=${arg.value}` : ''}`)
      .join(', ') ?? ''

  const signature = `${location.method} (${args})`

  return `${options.color(location.regAddr, 'green')}${options.color(
    ': '
  )}${options.color(signature, 'blue')}${options.color(
    ` at ${location.file}:${location.lineNumber}`
  )}`
}

/** @param {string} str */
function red(str) {
  return colors.red(str)
}

/** @param {string} str */
function blue(str) {
  return colors.blue(str)
}

/** @param {string} str */
function green(str) {
  return colors.green(str)
}
