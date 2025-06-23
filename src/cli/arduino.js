// @ts-check

import path from 'node:path'
import { getAssetAsBlob, isSea } from 'node:sea'
import url from 'node:url'

import arduinoCliJson from '../../arduino-cli.json'
import { appendDotExeOnWindows } from '../lib/os.js'
import { resolveAssetPath } from './asset.js'

const name = 'arduino-cli'
const { version } = arduinoCliJson
const arduinoCli = {
  name,
  version,
}

export async function resolveArduinoCliPath() {
  if (isSea()) {
    return resolveAssetPath({
      ...arduinoCli,
      blob: getAssetAsBlob(arduinoCli.name),
    })
  }

  // @ts-ignore
  const __filename = url.fileURLToPath(import.meta.url)
  return path.join(
    path.dirname(__filename),
    '..',
    '..',
    '.arduino-cli',
    appendDotExeOnWindows(name)
  )
}
