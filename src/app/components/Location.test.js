// @ts-check

import chalk from 'chalk'
import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'

import Location from './Location.js'

describe('Location', () => {
  it('renders an address', () => {
    const instance = render(<Location location="Test Location" />)
    expect(instance.lastFrame()).toStrictEqual(chalk.green('Test Location'))
  })

  it('renders a partial GDB line', () => {
    const instance = render(
      <Location location={{ address: 'hello', lineNumber: '36' }} />
    )
    expect(instance.lastFrame()).toStrictEqual(`${chalk.green('hello')}: 36`)
  })

  it('renders a parsed GDB line', () => {
    const instance = render(
      <Location
        location={{
          address: 'hello',
          lineNumber: '36',
          method: 'foo()',
          file: '/path/to/file',
        }}
      />
    )
    expect(instance.lastFrame()).toStrictEqual(
      `${chalk.green('hello')}: ${chalk.blue('foo()')} at /path/to/${chalk.bold(
        'file'
      )}:36`
    )
  })

  it('renders a parsed GDB line (empty basename)', () => {
    const instance = render(
      <Location
        location={{
          address: 'hello',
          lineNumber: '36',
          method: 'foo()',
          file: '   ',
        }}
      />
    )
    expect(instance.lastFrame()).toStrictEqual(
      `${chalk.green('hello')}: ${chalk.blue('foo()')} at    :36`
    )
  })
})
