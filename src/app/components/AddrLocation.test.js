// @ts-check

import chalk from 'chalk'
import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'

import AddrLocation from './AddrLocation.js'

const green = chalk.green
const blue = chalk.blue

describe('Location', () => {
  it('renders an address', () => {
    const instance = render(<AddrLocation addrLocation="Test Location" />)
    expect(instance.lastFrame()).toStrictEqual(green('Test Location'))
  })

  it('renders a partial GDB line', () => {
    const instance = render(
      <AddrLocation addrLocation={{ regAddr: 'hello', lineNumber: '36' }} />
    )
    expect(instance.lastFrame()).toStrictEqual(`${green('hello')}: 36`)
  })

  it('renders a parsed GDB line', () => {
    const instance = render(
      <AddrLocation
        addrLocation={{
          regAddr: 'hello',
          lineNumber: '36',
          method: 'foo',
          file: '/path/to/file',
        }}
      />
    )
    expect(instance.lastFrame()).toStrictEqual(
      `${green('hello')}: ${blue('foo ()')} at /path/to/file:36`
    )
  })

  it('renders a parsed GDB line (empty basename)', () => {
    const instance = render(
      <AddrLocation
        addrLocation={{
          regAddr: 'hello',
          lineNumber: '36',
          method: 'foo',
          file: '   ',
        }}
      />
    )
    expect(instance.lastFrame()).toStrictEqual(
      `${green('hello')}: ${blue('foo ()')} at    :36`
    )
  })
})
