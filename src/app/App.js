// @ts-check

import { useApp } from 'ink'
import React, { useEffect, useState } from 'react'

import { decode } from '../lib/decode/decode.js'
import Decoder from './components/Decoder.js'
import Footer from './components/Footer.js'
import Info from './components/Info.js'
import { useDecodeInput } from './hooks/useDecodeInput.js'
import { useDecodeParams } from './hooks/useDecodeParams.js'

/**
 * @typedef {import('../lib/decode/decode.js').DecodeResult} DecodeResult
 * @typedef {import('../lib/decode/coredump.js').CoredumpDecodeResult} CoredumpDecodeResult
 */

/**
 * @typedef {Object} AppArgs
 * @property {string} elfPath
 * @property {string} toolPathOrFqbn
 * @property {import('../lib/decode/decode.js').DecodeInput} [decodeInput]
 * @property {boolean} [coredumpMode=false]
 */

/**
 * @typedef {Object} AppOptions
 * @property {string} [arduinoCliConfig]
 * @property {string} [additionalUrls]
 * @property {import('../lib/decode/decode.js').DecodeTarget} [targetArch]
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
  decodeInput,
  coredumpMode,
  arduinoCliConfig,
  additionalUrls,
  targetArch,
}) {
  const { exit } = useApp()
  /** @type {ReturnType<typeof useState<Error|undefined>>} */
  const [decodeError, setDecodeError] = useState()
  const [loading, setLoading] = useState(false)
  const [shouldExit, setShouldExit] = useState(false)
  const { userInput, interactive } = useDecodeInput({
    decodeInput,
    coredumpMode,
  })
  /** @type {ReturnType<typeof useState<DecodeResult|CoredumpDecodeResult>>} */
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
      if (!userInput || !decodeParams) {
        return
      }

      setDecodeResult(undefined)
      setDecodeError(undefined)
      setLoading(true)

      try {
        const result = await decode({ ...decodeParams, elfPath }, userInput, {
          signal,
        })
        setDecodeResult(result)
      } catch (error) {
        setDecodeError(error)
      } finally {
        setLoading(false)
        if (userInput) {
          setShouldExit(true)
        }
      }
    }

    run()

    return () => {
      abortController.abort()
    }
  }, [decodeParams, userInput])

  useEffect(() => {
    if (shouldExit) {
      exit()
    }
  }, [shouldExit])

  const error = paramsError ?? decodeError

  return (
    <>
      {interactive && (
        <Info toolPath={decodeParams?.toolPath} elfPath={elfPath} />
      )}
      <Decoder
        userInput={userInput}
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
