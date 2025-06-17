// @ts-check

import chalk from 'chalk'
import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { texts as allocLocationTexts } from './AllocLocation.text.js'
import DecodeResult from './DecodeResult.js'
import { texts } from './DecodeResult.text.js'

const red = chalk.red
const green = chalk.green
const blue = chalk.blue

describe('DecodeResult', () => {
  it('renders null when no state', () => {
    const instance = render(<DecodeResult decodeResult={undefined} />)
    expect(instance.lastFrame()).toStrictEqual('')
  })

  it('renders error', () => {
    const instance = render(<DecodeResult error={new Error('Test error')} />)
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toStrictEqual(`
${red('Test error')}`)
  })

  it('renders loading', () => {
    const instance = render(<DecodeResult loading interactive />)
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toStrictEqual(`
${texts.decoding}
⠋`)
  })

  describe('renders result', () => {
    it('complete', () => {
      const expected = `
${red('Core 0 | myerror | 36')}

${red('PC → 0x12346: ??')}
${red('Addr → 0x3456: loop () at my_lib.cpp:23')}

${green('0x12348')}: 35
${green('0x3465')}: ${blue('loop2 ()')} at your_lib.cpp:32

${red(allocLocationTexts.memoryAllocationFailed(37))} ${green('0x1234')}`

      const instance = render(
        <DecodeResult
          decodeResult={{
            faultInfo: {
              coreId: 0,
              programCounter: {
                location: { lineNumber: '??', regAddr: '0x12346' },
                addr: 0x12346,
              },
              faultAddr: {
                location: {
                  lineNumber: '23',
                  regAddr: '0x3456',
                  file: 'my_lib.cpp',
                  method: 'loop',
                },
                addr: 0x3456,
              },
              faultCode: 36,
              faultMessage: 'myerror',
            },
            stacktraceLines: [
              { lineNumber: '35', regAddr: '0x12348' },
              {
                lineNumber: '32',
                regAddr: '0x3465',
                file: 'your_lib.cpp',
                method: 'loop2',
              },
            ],
            allocInfo: {
              allocAddr: '0x1234',
              allocSize: 37,
            },
          }}
        />
      )

      const lastFrame = instance.lastFrame()
      expect(lastFrame).toStrictEqual(expected)
    })
  })

  it('renders error when error and loading', () => {
    const expected = `
${red('Test error')}`

    const instance = render(
      <DecodeResult loading error={new Error('Test error')} />
    )

    const lastFrame = instance.lastFrame()
    expect(lastFrame).toStrictEqual(expected)
  })
})
