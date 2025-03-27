// @ts-check

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __tests, attachRestoreStdinHandlers } from './stdin.js'

const { handledEvents, handledSignals } = __tests

describe('stdin', () => {
  let originalProcess

  const onSpy = vi.fn()
  const exitSpy = vi.fn()
  const setRawModeSpy = vi.fn()
  const writeSpy = vi.fn()

  beforeEach(() => {
    originalProcess = global.process
    global.process = {
      on: onSpy,
      // @ts-ignore
      exit: exitSpy,
      // @ts-ignore
      stdin: {
        isTTY: true,
        setRawMode: setRawModeSpy,
      },
      // @ts-ignore
      stdout: {
        write: writeSpy,
      },
    }
  })

  afterEach(() => {
    global.process = originalProcess
    vi.resetAllMocks()
  })

  it('should add handlers for signals and events', () => {
    attachRestoreStdinHandlers()

    handledSignals.forEach((signal) => {
      expect(onSpy).toHaveBeenCalledWith(signal, expect.any(Function))
    })

    handledEvents.forEach((event) => {
      expect(onSpy).toHaveBeenCalledWith(event, expect.any(Function))
    })
  })

  it('should call stdin.setRawMode(false) on signal', () => {
    attachRestoreStdinHandlers()

    const signalCall = onSpy.mock.calls.find(([event]) =>
      handledSignals.includes(event)
    )
    const signalHandler = signalCall ? signalCall[1] : undefined
    expect(signalCall).toBeDefined()
    if (signalHandler) {
      signalHandler()
    }

    expect(setRawModeSpy).toHaveBeenCalledWith(false)
  })

  it('should call stdin.setRawMode(false) on event', () => {
    attachRestoreStdinHandlers()

    const eventCall = onSpy.mock.calls.find(([event]) =>
      handledEvents.includes(event)
    )
    const eventHandler = eventCall ? eventCall[1] : undefined
    expect(eventHandler).toBeDefined()
    if (eventHandler) {
      eventHandler()
    }
    eventHandler()

    expect(setRawModeSpy).toHaveBeenCalledWith(false)
  })

  it('should call stdin.setRawMode(false) on normal exit', () => {
    attachRestoreStdinHandlers()

    const exitCall = onSpy.mock.calls.find(([event]) => event === 'exit')
    const exitHandler = exitCall ? exitCall[1] : undefined
    expect(exitHandler).toBeDefined()
    if (exitHandler) {
      exitHandler()
    }

    expect(setRawModeSpy).toHaveBeenCalledWith(false)
  })

  it('should write "\\x1b[0m" to stdout only once on multiple signals', () => {
    attachRestoreStdinHandlers()

    const signalCall = onSpy.mock.calls.find(([event]) =>
      handledSignals.includes(event)
    )
    const signalHandler = signalCall ? signalCall[1] : undefined

    signalHandler()
    signalHandler()

    expect(writeSpy).toHaveBeenCalledWith('\x1b[0m')
    expect(writeSpy).toHaveBeenCalledTimes(1)
  })

  it('should not call stdin.setRawMode when isTTY is false', () => {
    global.process.stdin.isTTY = false
    attachRestoreStdinHandlers()

    const signalCall = onSpy.mock.calls.find(([event]) =>
      handledSignals.includes(event)
    )
    const signalHandler = signalCall ? signalCall[1] : undefined

    if (signalHandler) {
      signalHandler()
    }

    expect(setRawModeSpy).not.toHaveBeenCalled()
  })
})
