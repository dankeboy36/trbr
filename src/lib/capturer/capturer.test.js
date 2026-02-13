// @ts-check

import { describe, expect, it, vi } from 'vitest'

import { Capturer, createCapturer } from './capturer.js'
import {
  createRecordedCrashLoop,
  riscvLoadAccessFault,
  xtensaStoreProhibited,
} from './fixtures.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * @param {import('./capturer.js').Capturer} capturer
 * @param {{ now: number }} clock
 * @param {string} text
 * @param {number} [at]
 * @returns {import('./types.js').CapturerEvent}
 */
function pushCrashAndFlush(capturer, clock, text, at = 0) {
  clock.now = at
  capturer.push(encoder.encode(`${text}\n`))
  clock.now = at + 1000
  capturer.flush()
  const events = capturer.getEvents()
  return events[events.length - 1]
}

describe('capturer', () => {
  it('exposes capturer api names', () => {
    const capturer = createCapturer()
    expect(capturer).toBeInstanceOf(Capturer)
  })

  it('detects a chunked xtensa crash event', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 150,
    })
    /** @type {import('./types.js').CapturerEvent[]} */
    const detected = []
    capturer.on('eventDetected', (event) => detected.push(event))

    const input = `${xtensaStoreProhibited}\n`
    for (let i = 0; i < input.length; i += 17) {
      clock.now += 10
      expect(
        capturer.push(encoder.encode(input.slice(i, i + 17)))
      ).toBeUndefined()
    }

    clock.now += 1000
    capturer.flush()

    expect(detected).toHaveLength(1)
    expect(detected[0].kind).toBe('xtensa')
    expect(detected[0].signature).toContain('xtensa|')
    expect(detected[0].lightweight.backtraceAddrs.length).toBeGreaterThan(0)
  })

  it('frames realistic monitor recording and deduplicates repeated crashes', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 180,
      dedupWindowMs: 1200,
    })
    /** @type {import('./types.js').CapturerEvent[]} */
    const detected = []
    /** @type {import('./types.js').CapturerEvent[]} */
    const updated = []
    capturer.on('eventDetected', (event) => detected.push(event))
    capturer.on('eventUpdated', (event) => updated.push(event))

    for (const entry of createRecordedCrashLoop()) {
      clock.now = entry.atMs
      capturer.push(encoder.encode(entry.text))
    }

    clock.now += 1000
    capturer.flush()

    const events = capturer.getEvents()
    expect(events).toHaveLength(2)
    const xtensaEvent = events.find((event) => event.kind === 'xtensa')
    const riscvEvent = events.find((event) => event.kind === 'riscv')
    expect(xtensaEvent?.count).toBe(2)
    expect(riscvEvent?.count).toBe(1)
    expect(detected).toHaveLength(2)
    expect(
      updated.some((event) => event.id === xtensaEvent?.id && event.count === 2)
    ).toBe(true)
  })

  it('coalesces contained payload variants into one event and prefers fuller payloads', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 100,
      dedupWindowMs: 10_000,
    })
    const partialCrash = xtensaStoreProhibited
      .split('\n')
      .slice(0, 6)
      .join('\n')

    pushCrashAndFlush(capturer, clock, partialCrash, 0)
    pushCrashAndFlush(capturer, clock, xtensaStoreProhibited, 1_000)
    pushCrashAndFlush(capturer, clock, partialCrash, 2_000)

    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].count).toBe(3)
    expect(events[0].rawText).toContain('Backtrace:')
    expect(events[0].signature).toContain('fc:')
  })

  it('normalizes prefixed guru reason lines to a stable signature', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      dedupWindowMs: 10_000,
    })
    const prefixed = `[capturer-sketch] bad-instr entry${xtensaStoreProhibited}`

    pushCrashAndFlush(capturer, clock, prefixed, 0)
    pushCrashAndFlush(capturer, clock, xtensaStoreProhibited, 1_000)

    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].count).toBe(2)
    expect(events[0].signature).toContain('guru meditation error:')
  })

  it('keeps push synchronous', () => {
    const capturer = createCapturer()
    expect(
      capturer.push(encoder.encode('[I][capturer] heartbeat\n'))
    ).toBeUndefined()
  })

  it('evaluates once and returns cached result', async () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
    })
    const onUpdated = vi.fn()
    capturer.on('eventUpdated', onUpdated)

    clock.now = 10
    capturer.push(encoder.encode(`${xtensaStoreProhibited}\n`))
    clock.now = 500
    capturer.flush()

    const [event] = capturer.getEvents()
    const first = await capturer.evaluate(event.id)
    const second = await capturer.evaluate(event.id)

    expect(first).toBe(second)
    expect(first.status).toBe('stub')
    expect(onUpdated).toHaveBeenCalledTimes(1)
  })

  it('throws when push chunk is not Uint8Array', () => {
    const capturer = createCapturer()
    expect(
      // @ts-expect-error coverage for runtime type guard
      () => capturer.push('not-bytes')
    ).toThrow('Expected a Uint8Array monitor chunk')
  })

  it('returns cloned raw state and trims raw buffers by byte and line limits', () => {
    const capturer = createCapturer({
      maxRawBytes: 5,
      maxRawLines: 2,
    })

    capturer.push(encoder.encode('abc'))
    capturer.push(encoder.encode('defg'))
    capturer.push(encoder.encode('hijkl'))
    capturer.push(encoder.encode('L1\nL2\nL3\n'))
    capturer.flush()

    const rawState = capturer.getRawState()
    const rawText = rawState.bytes
      .map((chunk) => decoder.decode(chunk))
      .join('')
    expect(rawState.byteLength).toBe(5)
    expect(rawState.lines).toEqual(['L2', 'L3'])
    expect(rawText.endsWith('L3\n')).toBe(true)

    rawState.lines.push('tampered')
    rawState.bytes[0][0] = 120
    const freshRawState = capturer.getRawState()
    const freshRawText = freshRawState.bytes
      .map((chunk) => decoder.decode(chunk))
      .join('')
    expect(freshRawState.lines).toEqual(['L2', 'L3'])
    expect(freshRawText.endsWith('L3\n')).toBe(true)
  })

  it('supports unsubscribing event listeners', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
    })
    const onDetected = vi.fn()
    const unsubscribe = capturer.on('eventDetected', onDetected)
    unsubscribe()

    pushCrashAndFlush(capturer, clock, xtensaStoreProhibited)
    expect(onDetected).not.toHaveBeenCalled()
  })

  it('throws for unknown event id evaluation', async () => {
    const capturer = createCapturer()
    await expect(capturer.evaluate('missing-event')).rejects.toThrow(
      'Unknown event id: missing-event'
    )
  })

  it('reuses in-flight evaluation promise', async () => {
    const clock = { now: 0 }
    /** @type {(value: import('./types.js').CapturerEvaluated) => void} */
    let resolveEvaluation = () => {}
    const evaluateEvent = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveEvaluation = resolve
        })
    )
    const capturer = createCapturer({
      now: () => clock.now,
      evaluateEvent,
    })

    const event = pushCrashAndFlush(capturer, clock, xtensaStoreProhibited)
    const first = capturer.evaluate(event.id)
    const second = capturer.evaluate(event.id)

    expect(evaluateEvent).toHaveBeenCalledTimes(1)

    const resolvedValue = {
      eventId: event.id,
      evaluatedAt: 42,
      status: /** @type {const} */ ('decoded'),
      frames: [],
    }
    resolveEvaluation(resolvedValue)

    await expect(first).resolves.toEqual(resolvedValue)
    await expect(second).resolves.toEqual(resolvedValue)
  })

  it('supports aborted evaluations before start, during custom evaluator, and after microtask checkpoint', async () => {
    const clock = { now: 0 }
    const baseCapturer = createCapturer({
      now: () => clock.now,
    })
    const baseEvent = pushCrashAndFlush(
      baseCapturer,
      clock,
      xtensaStoreProhibited
    )

    const preAborted = new AbortController()
    preAborted.abort()
    await expect(
      baseCapturer.evaluate(baseEvent.id, { signal: preAborted.signal })
    ).rejects.toThrow(/user abort/i)

    const microtaskAbort = new AbortController()
    const delayedAbortEvaluation = baseCapturer.evaluate(baseEvent.id, {
      signal: microtaskAbort.signal,
    })
    microtaskAbort.abort()
    await expect(delayedAbortEvaluation).rejects.toThrow(/user abort/i)

    const duringEvalAbort = new AbortController()
    const evaluateEvent = vi.fn(async () => {
      duringEvalAbort.abort()
      return {
        eventId: baseEvent.id,
        evaluatedAt: 777,
        status: /** @type {const} */ ('decoded'),
        frames: [],
      }
    })
    const customCapturer = createCapturer({
      now: () => clock.now,
      evaluateEvent,
    })
    const customEvent = pushCrashAndFlush(
      customCapturer,
      clock,
      xtensaStoreProhibited
    )
    await expect(
      customCapturer.evaluate(customEvent.id, {
        signal: duringEvalAbort.signal,
      })
    ).rejects.toThrow(/user abort/i)
    expect(evaluateEvent).toHaveBeenCalledTimes(1)
  })

  it('trims events to maxEvents and handles defensive negative maxEvents', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      maxEvents: 1,
      dedupWindowMs: 10,
    })

    const loadProhibited = xtensaStoreProhibited.replace(
      'StoreProhibited',
      'LoadProhibited'
    )
    pushCrashAndFlush(capturer, clock, xtensaStoreProhibited, 0)
    pushCrashAndFlush(capturer, clock, loadProhibited, 2000)
    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].rawText).toContain('LoadProhibited')

    const defensiveCapturer = createCapturer({
      now: () => clock.now,
      maxEvents: /** @type {number} */ (-1),
    })
    pushCrashAndFlush(defensiveCapturer, clock, xtensaStoreProhibited, 5000)
    expect(defensiveCapturer.getEvents()).toHaveLength(0)
  })

  it('parses unknown and riscv crash kinds without throwing', () => {
    const clock = { now: 0 }
    const unknownCapturer = createCapturer({
      now: () => clock.now,
    })
    const unknownInput = `Core  0 panic'ed (MysteryFault). Exception was unhandled.
noise-only line`
    const unknownEvent = pushCrashAndFlush(unknownCapturer, clock, unknownInput)
    expect(unknownEvent.kind).toBe('unknown')
    expect(unknownEvent.signature).toContain('|nopc')
    expect(unknownEvent.lightweight.programCounter).toBeUndefined()

    const riscvCapturer = createCapturer({
      now: () => clock.now,
    })
    const riscvEvent = pushCrashAndFlush(
      riscvCapturer,
      clock,
      riscvLoadAccessFault,
      2500
    )
    expect(riscvEvent.kind).toBe('riscv')
    expect(Object.keys(riscvEvent.lightweight.regs).length).toBeGreaterThan(0)
    expect(riscvEvent.lightweight.programCounter).toBeDefined()
    expect(riscvEvent.lightweight.backtraceAddrs.length).toBeGreaterThan(0)
    expect(riscvEvent.signature).toContain('riscv|')
    expect(riscvEvent.signature).not.toContain('|nopc')
  })

  it('builds xtensa signatures from program counter when no backtrace addresses exist', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
    })
    const onlyPcCrash = `Guru Meditation Error: Core  1 panic'ed (LoadProhibited). Exception was unhandled.

Core  1 register dump:
PC      : 0x400d15f1`
    const event = pushCrashAndFlush(capturer, clock, onlyPcCrash)
    expect(event.kind).toBe('xtensa')
    expect(event.lightweight.programCounter).toBe(0x400d15f1)
    expect(event.lightweight.backtraceAddrs).toEqual([])
    expect(event.signature).toContain('|0x400d15f1')
  })

  it('falls back to ESP8266 parser path when xtensa parse has no symbols', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
    })
    const emptyBacktraceCrash = `Core  0 panic'ed (Unknown). Exception was unhandled.
Backtrace:`
    const event = pushCrashAndFlush(capturer, clock, emptyBacktraceCrash)
    expect(event.kind).toBe('xtensa')
    expect(event.lightweight.programCounter).toBeUndefined()
    expect(event.lightweight.backtraceAddrs).toEqual([])
  })

  it('finalizes an active crash block when reboot marker arrives', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 10_000,
    })

    clock.now = 1
    capturer.push(
      encoder.encode(
        "Core  0 panic'ed (Load access fault). Exception was unhandled.\nRebooting...\n"
      )
    )

    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].rawText).toContain('Rebooting...')
  })

  it('does not emit a trailing partial crash block on stop flush', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 200,
    })

    // First crash is complete and should be captured.
    clock.now = 0
    capturer.push(encoder.encode(`${xtensaStoreProhibited}\n`))
    clock.now = 1000
    capturer.flush()
    expect(capturer.getEvents()).toHaveLength(1)

    // A second crash starts but capture stops before it is complete.
    const partial = `Guru Meditation Error: Core  1 panic'ed (StoreProhibited). Exception was unhandled.
Core  1 register dump:
PC      : 0x400d15f1`
    clock.now = 1100
    capturer.push(encoder.encode(`${partial}\n`))

    // Stop-capture flush: should not create a new trailing partial event.
    clock.now = 1101
    capturer.flush()

    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].rawText).toContain('Backtrace:')
  })

  it('emits a complete active crash block on stop flush without extra quiet delay', () => {
    const clock = { now: 0 }
    const capturer = createCapturer({
      now: () => clock.now,
      quietPeriodMs: 10_000,
    })

    clock.now = 1
    capturer.push(encoder.encode(`${xtensaStoreProhibited}\n`))

    // No quiet-period wait; stop-capture flush should still emit complete block.
    clock.now = 2
    capturer.flush()

    const events = capturer.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].rawText).toContain('Backtrace:')
  })
})
