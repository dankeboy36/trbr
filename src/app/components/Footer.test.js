// @ts-check

import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'

import Footer from './Footer.js'
import { texts } from './Footer.text.js'

describe('Footer', () => {
  it('renders when interactive', async () => {
    const instance = render(<Footer interactive />)

    expect(instance.lastFrame()).toEqual(`
${texts.pressCtrlCToExit}`)
  })

  it('does not render when non-interactive', async () => {
    const instance = render(<Footer />)

    expect(instance.lastFrame()).not.toContain(texts.pressCtrlCToExit)
  })
})
