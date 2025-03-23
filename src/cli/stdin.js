// @ts-check

const handledSignals = [
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGUSR1',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
]

const handledEvents = ['unhandledRejection', 'uncaughtException']

/** @param {()=>void} handler */
function attachStopSignalHandlers(handler) {
  handledSignals.forEach((signal) =>
    process.on(signal, () => {
      handler()
      process.exit(1)
    })
  )
}

/** @param {()=>void} handler */
function attachErrorEventHandlers(handler) {
  handledEvents.forEach((event) => {
    process.on(event, () => {
      handler()
      process.exit(1)
    })
  })
}

/** @param {()=>void} handler */
function attachExitHandler(handler) {
  process.on('exit', handler)
}

export function attachRestoreStdinHandlers() {
  let restored = false
  function restoreStdinHandler() {
    if (restored) {
      return
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdout.write('\x1b[0m') // Reset text formatting
    restored = true
  }

  attachExitHandler(restoreStdinHandler)
  attachStopSignalHandlers(restoreStdinHandler)
  attachErrorEventHandlers(restoreStdinHandler)
}

/**
 * (non-API)
 */
export const __tests = /** @type {const} */ ({
  handledEvents,
  handledSignals,
})
