// @ts-check

import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import archy from 'archy'
import checker from 'license-checker'

import { projectRootPath } from './utils.js'

/**
 * @typedef {Object} ModuleInfo
 * @property {string} key
 * @property {string} license
 * @property {string} repository
 * @property {string} publisher
 */

async function run() {
  const moduleInfos = await promisify(checker.init)({
    start: projectRootPath,
    production: true,
    onlyAllow: 'GPL-3.0;LGPL-3.0;AGPL-3.0;Apache-2.0;MIT;BSD;ISC',
    summary: true,
  })

  /** @type {archy.Data[]} */
  const nodes = []
  for (const [key, moduleInfo] of Object.entries(moduleInfos)) {
    if (!moduleInfo.licenses) {
      throw new Error(`No license found for ${key}`)
    }
    const licenses = Array.isArray(moduleInfo.licenses)
      ? moduleInfo.licenses
      : [moduleInfo.licenses]
    if (!licenses.length) {
      throw new Error(`No licenses found for ${key}`)
    }

    /** @type {archy.Data[]} */
    const moduleNodes = []
    if (moduleInfo.repository) {
      moduleNodes.push({
        label: `Repository: ${moduleInfo.repository}`,
      })
    }
    if (moduleInfo.publisher) {
      moduleNodes.push({
        label: `Publisher: ${moduleInfo.publisher}`,
      })
    }
    if (moduleInfo.url) {
      moduleNodes.push({
        label: `URL: ${moduleInfo.url}`,
      })
    }

    nodes.push({
      label: `(${licenses.join(' OR ')})`,
      nodes: [{ label: key, nodes: moduleNodes }],
    })
  }

  await fs.writeFile(
    path.join(projectRootPath, 'licenses'),
    archy({ label: '', nodes }).trim(),
    'utf8'
  )
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
