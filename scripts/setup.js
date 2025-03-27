// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'

import { getTool } from 'get-arduino-tools'

import { projectRootPath } from './utils.js'

async function run() {
  const arduinoCliJson = await fs.readFile(
    path.join(projectRootPath, 'arduino-cli.json'),
    'utf-8'
  )
  const { version } = JSON.parse(arduinoCliJson)

  const destinationFolderPath = path.join(projectRootPath, '.arduino-cli')
  await fs.mkdir(destinationFolderPath, { recursive: true })

  try {
    await getTool({ destinationFolderPath, tool: 'arduino-cli', version })
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
      // already exists
    } else {
      throw err
    }
  }
}

run().catch(console.error)
