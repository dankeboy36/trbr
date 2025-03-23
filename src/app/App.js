// @ts-check

import { useApp } from 'ink'
import React, { useEffect, useState } from 'react'

import { decode } from '../lib/decode/decode.js'
import Decoder from './components/Decoder.js'
import Footer from './components/Footer.js'
import Info from './components/Info.js'
import { useDecodeParams } from './hooks/useDecodeParams.js'
import { useInput } from './hooks/useInput.js'

/**
 * @typedef {Object} AppArgs
 * @property {string} elfPath
 * @property {string} toolPathOrFqbn
 * @property {string} [traceInput]
 */

/**
 * @typedef {Object} AppOptions
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 * @property {import('../index').DecodeTarget} [targetArch]
 * @property {boolean} [color=true]
 */

/**
 * @typedef {AppArgs & AppOptions} AppProps
 */

/**
 * @param {AppProps} props
 */
function App({
  toolPathOrFqbn,
  elfPath,
  traceInput,
  arduinoCliConfig,
  additionalUrls,
  targetArch,
}) {
  const { exit } = useApp()
  /** @type {ReturnType<typeof useState<Error|undefined>>} */
  const [decodeError, setDecodeError] = useState()
  const [loading, setLoading] = useState(false)
  const { input, interactive } = useInput({ traceInput })
  /** @type {ReturnType<typeof useState<import('../index').DecodeResult>>} */
  const [decodeResult, setDecodeResult] = useState()

  const { decodeParams, error: paramsError } = useDecodeParams({
    toolPathOrFqbn,
    elfPath,
    arduinoCliConfig,
    additionalUrls,
    targetArch,
  })

  useEffect(() => {
    const abortController = new AbortController()
    const signal = abortController.signal

    async function run() {
      if (!input || !decodeParams) {
        return
      }

      setDecodeResult(undefined)
      setDecodeError(undefined)
      setLoading(true)

      try {
        const result = await decode({ ...decodeParams, elfPath }, input, {
          signal,
        })
        setDecodeResult(result)
      } catch (error) {
        setDecodeError(error)
      } finally {
        setLoading(false)
        if (traceInput) {
          exit()
        }
      }
    }

    run()

    return () => {
      abortController.abort()
    }
  }, [input, decodeParams, traceInput])

  const error = paramsError ?? decodeError

  return (
    <>
      {interactive && (
        <Info toolPath={decodeParams?.toolPath} elfPath={elfPath} />
      )}
      <Decoder
        input={input}
        decodeResult={decodeResult}
        loading={loading}
        error={error}
        interactive={interactive}
      />
      <Footer interactive={interactive} />
    </>
  )
}

export default App
