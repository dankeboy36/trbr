// @ts-check

export class AbortError extends Error {
  constructor() {
    super('User abort')
    this.name = 'AbortError'
  }
}

export const neverSignal = new AbortController().signal
