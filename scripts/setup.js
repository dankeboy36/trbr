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

  await getTool({
    destinationFolderPath,
    tool: 'arduino-cli',
    version,
    okIfExists: true,
  })
}

run().catch(console.error)
