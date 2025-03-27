// @ts-check

import path from 'node:path'
import { getAssetAsBlob, isSea } from 'node:sea'
import url from 'node:url'

import arduinoCliJson from '../../arduino-cli.json'
import { resolveAssetPath } from './asset.js'
import { appendDotExeOnWindows } from './os.js'

const name = 'arduino-cli'
const { version } = arduinoCliJson
const arduinoCli = {
  name,
  version,
}

export function resolveArduinoCliPath() {
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
