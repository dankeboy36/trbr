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
const bold = chalk.bold

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
    const instance = render(<DecodeResult loading />)
    const lastFrame = instance.lastFrame()
    expect(lastFrame).toStrictEqual(`
${texts.decoding}
⠋`)
  })

  describe('renders result', () => {
    it('complete', () => {
      const expected = `
${red('myerror (36)')}

${red('foo')} ${green('0x1235')}
${red('bar')} ${green('0x12346')}: ??
${red('baz')} ${green('0x3456')}: ${blue('loop()')} at /${bold('my_lib.cpp')}:23

${green('0x12348')}: 35
${green('0x3465')}: ${blue('loop2()')} at /${bold('your_lib.cpp')}:32

${red(allocLocationTexts.memoryAllocationFailed(37))} ${green('0x1234')}`

      const instance = render(
        <DecodeResult
          decodeResult={{
            exception: ['myerror', 36],
            allocLocation: ['0x1234', 37],
            registerLocations: {
              foo: '0x1235',
              bar: { lineNumber: '??', address: '0x12346' },
              baz: {
                lineNumber: '23',
                address: '0x3456',
                file: 'my_lib.cpp',
                method: 'loop()',
              },
            },
            stacktraceLines: [
              { lineNumber: '35', address: '0x12348' },
              {
                lineNumber: '32',
                address: '0x3465',
                file: 'your_lib.cpp',
                method: 'loop2()',
              },
            ],
          }}
        />
      )

      const lastFrame = instance.lastFrame()
      expect(lastFrame).toStrictEqual(expected)
    })

    it('single margin top when no exceptions', () => {
      const expected = `
${red('foo')} ${green('0x1235')}
`

      const instance = render(
        <DecodeResult
          decodeResult={{
            registerLocations: {
              foo: '0x1235',
            },
            stacktraceLines: [],
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
