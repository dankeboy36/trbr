// @ts-check

import chalk from 'chalk'
import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'
import waitForExpect from 'wait-for-expect'

import Decoder from './Decoder.js'
import { texts } from './Decoder.text.js'

const red = chalk.red
const green = chalk.green

describe('Decoder', () => {
  it('blinks if interactive', async () => {
    const instance = render(<Decoder input="" blinkInterval={1} interactive />)

    await waitForExpect(() =>
      expect(instance.lastFrame()).not.toContain(texts.placeholder)
    )
    await waitForExpect(() =>
      expect(instance.lastFrame()).toContain(texts.placeholder)
    )
    await waitForExpect(() =>
      expect(instance.lastFrame()).not.toContain(texts.placeholder)
    )
  })

  it('does not blink if non-interactive', async () => {
    const instance = render(
      <Decoder input="" interactive={false} blinkInterval={1} />
    )

    await waitForExpect(
      () => expect(instance.lastFrame()).not.toContain(texts.placeholder),
      10
    )
  })

  it('does not blink if loading', async () => {
    const instance = render(<Decoder input="" loading blinkInterval={1} />)

    await waitForExpect(
      () => expect(instance.lastFrame()).not.toContain(texts.placeholder),
      10
    )
  })

  it('renders', () => {
    const expected = `
some

  text

${red('boom (7)')}

${red('foo')} ${green('0x1244')}

${green('0x4444')}: ??`

    const instance = render(
      <Decoder
        decodeResult={{
          exception: ['boom', 7],
          registerLocations: { foo: '0x1244' },
          stacktraceLines: [{ address: '0x4444', lineNumber: '??' }],
        }}
        input={`some

  text`}
        interactive={false}
      />
    )

    const lastFrame = instance.lastFrame()
    expect(lastFrame).toStrictEqual(expected)
  })
})
