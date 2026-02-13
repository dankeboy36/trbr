// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import { FQBN } from 'fqbn'
import { beforeAll, describe, expect, inject, it } from 'vitest'

import { compileWithTestEnv } from '../../../scripts/env/env.js'
import { decode, isParsedGDBLine } from '../decode/decode.js'
import { createDecodeParams } from '../decode/decodeParams.js'
import { createCapturer } from './capturer.js'
import { riscvVarsDemoStoreAccessFault } from './fixtures.js'

/** @typedef {import('../../../scripts/env/env.js').TestEnv} TestEnv */
/** @typedef {import('../decode/decode.js').DecodeParams} DecodeParams */
/** @typedef {import('../decode/decode.js').DecodeResult} DecodeResult */

// @ts-ignore
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const slowHookTimeout = 180_000
const sketchesPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.tests',
  'sketches'
)
const sketchPath = path.join(sketchesPath, 'esp32backtracetest')
const fqbn = 'esp32:esp32:esp32da'
const varsDemoSketchPath = path.join(sketchesPath, 'vars_demo')
const varsDemoFqbn = 'esp32:esp32:esp32c3'
const capturerCrashLoopSketchPath = path.join(
  sketchesPath,
  'capturer_crash_loop'
)
const capturerCrashLoopFqbn = 'esp32:esp32:esp32c3'
const capturerCrashLoopRecordingPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.tests',
  'recordings',
  'capturer_crash_loop',
  'esp32c3',
  'monitor.txt'
)
const varsDemoBuildProperties = [
  'compiler.c.extra_flags=-Og -g3 -fno-omit-frame-pointer -fno-optimize-sibling-calls',
  'compiler.cpp.extra_flags=-Og -g3 -fno-omit-frame-pointer -fno-optimize-sibling-calls',
  'compiler.optimization_flags=-Og -g3',
  'build.code_debug=1',
]

const storeProhibitedCrash = `Guru Meditation Error: Core  1 panic'ed (StoreProhibited). Exception was unhandled.

Core  1 register dump:
PC      : 0x400d15f1  PS      : 0x00060b30  A0      : 0x800d1609  A1      : 0x3ffb21d0
A2      : 0x0000002a  A3      : 0x3f40018f  A4      : 0x00000020  A5      : 0x0000ff00
A6      : 0x00ff0000  A7      : 0x00000022  A8      : 0x00000000  A9      : 0x3ffb21b0
A10     : 0x0000002c  A11     : 0x3f400164  A12     : 0x00000022  A13     : 0x0000ff00
A14     : 0x00ff0000  A15     : 0x0000002a  SAR     : 0x0000000c  EXCCAUSE: 0x0000001d
EXCVADDR: 0x00000000  LBEG    : 0x40086161  LEND    : 0x40086171  LCOUNT  : 0xfffffff5

Backtrace: 0x400d15ee:0x3ffb21d0 0x400d1606:0x3ffb21f0 0x400d15da:0x3ffb2210 0x400d15c1:0x3ffb2240 0x400d302a:0x3ffb2270 0x40088be9:0x3ffb2290`

const loadProhibitedCrash = storeProhibitedCrash.replace(
  'StoreProhibited',
  'LoadProhibited'
)

/**
 * @param {DecodeParams} decodeParams
 * @param {string} rawText
 * @param {import('../decode/decode.js').DecodeOptions} [decodeOptions]
 * @returns {Promise<DecodeResult>}
 */
async function decodeFromCapturerEvent(decodeParams, rawText, decodeOptions) {
  const decoded = await decode(decodeParams, rawText, decodeOptions)
  if (!('stacktraceLines' in decoded)) {
    throw new Error('Expected backtrace decode result')
  }
  return decoded
}

/**
 * @param {DecodeResult} decoded
 * @returns {boolean}
 */
function hasSketchFrame(decoded) {
  return decoded.stacktraceLines.some(
    (line) =>
      isParsedGDBLine(line) &&
      line.file.includes('esp32backtracetest') &&
      ['functionB', 'functionC', 'functionA'].includes(line.method)
  )
}

/**
 * @param {DecodeResult} decoded
 * @returns {boolean}
 */
function hasAnyFrameVars(decoded) {
  if ((decoded.globals?.length ?? 0) > 0) {
    return true
  }
  return decoded.stacktraceLines.some(
    (line) => isParsedGDBLine(line) && (line.locals?.length ?? 0) > 0
  )
}

/**
 * @param {DecodeResult} decoded
 * @returns {boolean}
 */
function hasLevel3Locals(decoded) {
  const frame = decoded.stacktraceLines.find(
    (line) => isParsedGDBLine(line) && line.method === 'level3'
  )
  if (!frame || !isParsedGDBLine(frame)) {
    return false
  }
  return (frame.locals ?? []).some((local) => local.name === 'localBuf')
}

/**
 * @param {string | undefined} reasonLine
 * @returns {string}
 */
function normalizeReasonLine(reasonLine) {
  return String(reasonLine ?? '')
    .toLowerCase()
    .replace(/^.*?(guru meditation error:)/, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {import('./capturer.js').Capturer} capturer
 * @param {string} text
 * @param {(value: number) => void} setNow
 * @param {number} at
 * @returns {void}
 */
function pushChunked(capturer, text, setNow, at) {
  const encoder = new TextEncoder()
  for (let i = 0; i < text.length; i += 37) {
    setNow(at + i)
    capturer.push(encoder.encode(text.slice(i, i + 37)))
  }
}

describe('capturer (slow)', () => {
  /** @type {TestEnv} */
  let testEnv
  /** @type {DecodeParams} */
  let xtensaDecodeParams
  /** @type {DecodeParams} */
  let varsDemoDecodeParams
  /** @type {string} */
  let capturerCrashLoopBuildPath

  beforeAll(async () => {
    // @ts-ignore
    testEnv = inject('testEnv')
    expect(testEnv).toBeDefined()

    const summary = await compileWithTestEnv({
      testEnv,
      fqbn,
      sketchPath,
    })
    const buildPath = summary.builder_result.build_path
    const elfPath = path.join(buildPath, `${path.basename(sketchPath)}.ino.elf`)

    xtensaDecodeParams = await createDecodeParams({
      elfPath,
      fqbn: new FQBN(fqbn),
      arduinoCliPath: testEnv.cliContext.cliPath,
      arduinoCliConfigPath: testEnv.toolEnvs.cli.cliConfigPath,
    })

    const varsDemoSummary = await compileWithTestEnv({
      testEnv,
      fqbn: varsDemoFqbn,
      sketchPath: varsDemoSketchPath,
      buildProperties: varsDemoBuildProperties,
    })
    const varsBuildPath = varsDemoSummary.builder_result.build_path
    const varsElfPath = path.join(
      varsBuildPath,
      `${path.basename(varsDemoSketchPath)}.ino.elf`
    )
    varsDemoDecodeParams = await createDecodeParams({
      elfPath: varsElfPath,
      fqbn: new FQBN(varsDemoFqbn),
      arduinoCliPath: testEnv.cliContext.cliPath,
      arduinoCliConfigPath: testEnv.toolEnvs.cli.cliConfigPath,
    })

    const crashLoopSummary = await compileWithTestEnv({
      testEnv,
      fqbn: capturerCrashLoopFqbn,
      sketchPath: capturerCrashLoopSketchPath,
      buildProperties: varsDemoBuildProperties,
    })
    capturerCrashLoopBuildPath = crashLoopSummary.builder_result.build_path
  }, slowHookTimeout)

  it('emits xtensa crash events that decode with the compiled ELF', async () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 200,
      dedupWindowMs: 2000,
    })
    const setNow = (/** @type {number} */ value) => {
      clock.now = value
    }

    pushChunked(capturer, `[I] boot\n${storeProhibitedCrash}\n`, setNow, 0)
    setNow(1200)
    capturer.flush()

    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('xtensa')

    const decoded = await decodeFromCapturerEvent(
      xtensaDecodeParams,
      events[0].rawText
    )
    expect(decoded.stacktraceLines.length).toBeGreaterThan(0)
    expect(hasSketchFrame(decoded)).toBe(true)
  })

  it('keeps distinct signatures and dedups repeated crashes while remaining decodable', async () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 180,
      dedupWindowMs: 2500,
    })
    const setNow = (/** @type {number} */ value) => {
      clock.now = value
    }

    pushChunked(capturer, `${storeProhibitedCrash}\n`, setNow, 10)
    setNow(800)
    pushChunked(capturer, '[I] noise between crashes\n', setNow, 800)
    setNow(1100)
    pushChunked(capturer, `${storeProhibitedCrash}\n`, setNow, 1100)
    setNow(3000)
    pushChunked(capturer, `${loadProhibitedCrash}\n`, setNow, 3000)
    setNow(5000)
    capturer.flush()

    const events = capturer.getEvents()
    expect(events).toHaveLength(2)
    expect(events[0].count).toBe(2)
    expect(events[1].count).toBe(1)
    expect(events[0].signature).not.toEqual(events[1].signature)

    const firstDecode = await decodeFromCapturerEvent(
      xtensaDecodeParams,
      events[0].rawText
    )
    const secondDecode = await decodeFromCapturerEvent(
      xtensaDecodeParams,
      events[1].rawText
    )
    expect(firstDecode.stacktraceLines.length).toBeGreaterThan(0)
    expect(secondDecode.stacktraceLines.length).toBeGreaterThan(0)
    expect(hasSketchFrame(firstDecode) || hasSketchFrame(secondDecode)).toBe(
      true
    )
  })

  it('streams a vars_demo crash and only materializes frame vars on evaluate', async () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 200,
      dedupWindowMs: 2000,
      evaluateEvent: async ({ event, signal }) => {
        const decoded = await decodeFromCapturerEvent(
          varsDemoDecodeParams,
          event.rawText,
          {
            signal,
            includeFrameVars: true,
          }
        )
        return {
          eventId: event.id,
          evaluatedAt: clock.now,
          status: 'decoded',
          frames: decoded.stacktraceLines.map((line) => ({
            addr: Number.parseInt(line.regAddr, 16),
            location: line,
          })),
          decodeResult: decoded,
        }
      },
    })
    const setNow = (/** @type {number} */ value) => {
      clock.now = value
    }

    pushChunked(
      capturer,
      `[I][vars-demo] booting\n${riscvVarsDemoStoreAccessFault}\n`,
      setNow,
      0
    )
    setNow(1800)
    capturer.flush()

    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event.kind).toBe('riscv')
    expect(event.evaluated).toBeUndefined()

    const lightweightDecode = await decodeFromCapturerEvent(
      varsDemoDecodeParams,
      event.rawText
    )
    expect(hasAnyFrameVars(lightweightDecode)).toBe(false)

    let evaluated
    try {
      evaluated = await capturer.evaluate(event.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `capturer.evaluate failed for event ${event.id} (${event.kind}, signature=${event.signature}, reason=${event.lightweight.reasonLine ?? 'unknown'}): ${message}`
      )
    }
    expect(evaluated.status).toBe('decoded')
    expect(evaluated.decodeResult).toBeDefined()
    expect(hasAnyFrameVars(evaluated.decodeResult)).toBe(true)
    expect(hasLevel3Locals(evaluated.decodeResult)).toBe(true)
  })

  it('compiles crash-loop and streams real monitor recording through capturer', async () => {
    expect(capturerCrashLoopBuildPath.length).toBeGreaterThan(0)
    const monitorText = await fs.readFile(
      capturerCrashLoopRecordingPath,
      'utf8'
    )
    const inputBytes = new TextEncoder().encode(monitorText)
    const chunkSizes = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 180,
      dedupWindowMs: 365 * 24 * 60 * 60 * 1000,
      maxEvents: 2000,
    })

    for (let i = 0, chunkIndex = 0; i < inputBytes.length; chunkIndex++) {
      const chunkSize = chunkSizes[chunkIndex % chunkSizes.length]
      const end = Math.min(i + chunkSize, inputBytes.length)
      capturer.push(inputBytes.slice(i, end))
      i = end
      clock.now += 7 + (chunkIndex % 4)
    }
    clock.now += 1500
    capturer.flush()

    const events = capturer.getEvents()
    expect(events).toHaveLength(2)
    const totalCrashes = events.reduce((sum, event) => sum + event.count, 0)
    expect(totalCrashes).toBe(32)

    /** @type {Map<string, number>} */
    const byFaultKey = new Map()
    /** @type {Map<string, number>} */
    const byReason = new Map()

    for (const event of events) {
      const key = `${event.lightweight.faultCode ?? 'na'}|${event.lightweight.programCounter ?? 'na'}`
      byFaultKey.set(key, (byFaultKey.get(key) ?? 0) + event.count)
      const reason = normalizeReasonLine(event.lightweight.reasonLine)
      byReason.set(reason, (byReason.get(reason) ?? 0) + event.count)
    }

    expect(byFaultKey.size).toBe(2)
    const normalizedReasons = [...byReason.keys()]
    expect(
      normalizedReasons.some((line) =>
        line.includes('instruction access fault')
      )
    ).toBe(true)
    expect(
      normalizedReasons.some((line) => line.includes('load access fault'))
    ).toBe(true)
  })
})
