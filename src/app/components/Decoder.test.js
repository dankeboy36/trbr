// @ts-check

import waitFor from '@sadams/wait-for-expect'
import chalk from 'chalk'
import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'

import Decoder from './Decoder.js'
import { texts } from './Decoder.text.js'

const red = chalk.red
const green = chalk.green

describe('Decoder', () => {
  it('blinks if interactive', async () => {
    const instance = render(
      <Decoder userInput="" blinkInterval={1} interactive />
    )

    await waitFor(() =>
      expect(instance.lastFrame()).not.toContain(texts.placeholder)
    )
    await waitFor(() =>
      expect(instance.lastFrame()).toContain(texts.placeholder)
    )
    await waitFor(() =>
      expect(instance.lastFrame()).not.toContain(texts.placeholder)
    )
  })

  it('does not blink if non-interactive', async () => {
    const instance = render(
      <Decoder userInput="" interactive={false} blinkInterval={1} />
    )

    await waitFor(
      () => expect(instance.lastFrame()).not.toContain(texts.placeholder),
      10
    )
  })

  it('does not blink if loading', async () => {
    const instance = render(<Decoder userInput="" loading blinkInterval={1} />)

    await waitFor(
      () => expect(instance.lastFrame()).not.toContain(texts.placeholder),
      10
    )
  })

  it('renders', () => {
    const expected = `
some

  text

${red('Core 1 | boom | 7')}

${red('PC → 0x1244: ??')}
${red('Addr → 0x4444: ??')}

${green('0x4444')}: ??
${texts.placeholder}`

    const instance = render(
      <Decoder
        decodeResult={{
          faultInfo: {
            faultAddr: {
              location: {
                lineNumber: '??',
                regAddr: '0x4444',
              },
              addr: 0x4444,
            },
            faultCode: 7,
            faultMessage: 'boom',
            coreId: 1,
            programCounter: {
              location: {
                lineNumber: '??',
                regAddr: '0x1244',
              },
              addr: 0x1244,
            },
          },
          stacktraceLines: [{ regAddr: '0x4444', lineNumber: '??' }],
        }}
        userInput={`some

  text`}
        interactive={true}
      />
    )

    const lastFrame = instance.lastFrame()
    expect(lastFrame).toStrictEqual(expected)
  })
})
