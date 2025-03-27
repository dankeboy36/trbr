// @ts-check

import { render } from 'ink'
import React from 'react'

import App from './App.js'

/**
 * @param {import('./App').AppProps} props
 */
export function renderApp({
  elfPath,
  toolPathOrFqbn,
  targetArch,
  arduinoCliConfig,
  additionalUrls,
  color,
  traceInput,
}) {
  return render(
    <App
      elfPath={elfPath}
      toolPathOrFqbn={toolPathOrFqbn}
      targetArch={targetArch}
      traceInput={traceInput}
      arduinoCliConfig={arduinoCliConfig}
      additionalUrls={additionalUrls}
      color={color}
    />
  )
}
