// @ts-check

import { render } from 'ink'
import React from 'react'

import App from './App.js'

/**
 * @param {import('./App.js').AppProps} props
 */
export function renderApp({
  elfPath,
  toolPathOrFqbn,
  targetArch,
  arduinoCliConfig,
  additionalUrls,
  color,
  decodeInput,
}) {
  return render(
    <App
      elfPath={elfPath}
      toolPathOrFqbn={toolPathOrFqbn}
      targetArch={targetArch}
      decodeInput={decodeInput}
      arduinoCliConfig={arduinoCliConfig}
      additionalUrls={additionalUrls}
      color={color}
    />
  )
}
