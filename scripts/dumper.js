// @ts-check

import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import express from 'express'
import { FQBN, valid } from 'fqbn'
import multer from 'multer'
import { exec } from 'tinyexec'

import { setupTestEnv } from './env/env.js'
import { projectRootPath } from './utils.js'

const WIFI_SSID = /** @type {string} */ (process.env.WIFI_SSID)
const WIFI_PASSWORD = /** @type {string} */ (process.env.WIFI_PASSWORD)
if (!WIFI_SSID) {
  console.error('WIFI_SSID environment variable is not set.')
  process.exit(1)
}
if (!WIFI_PASSWORD) {
  console.error('WIFI_PASSWORD environment variable is not set.')
  process.exit(1)
}

const coredumpsPath = path.join(projectRootPath, '.tests/coredumps')
const templatesPath = path.join(projectRootPath, '.tests/templates')
const testProjectName = 'Dumper'
const placeholderVersion = '0.0.0'

/** @typedef {Awaited<ReturnType<typeof setupTestEnv>>} TestEnv */

/**
 * @typedef {Object} CreateDumpParams
 * @property {BoardParams[]} boardParams
 * @property {string} dumpDestinationFolderPath
 */

/**
 * @typedef {Object} BoardParams
 * @property {string} fqbn
 * @property {string} chip
 * @property {string} port
 */

/**
 * @param {CreateDumpParams} params
 * @param {TestEnv} testEnv
 */
async function createDumps(params, testEnv) {
  const { cliContext, toolsEnvs } = testEnv
  const arduinoCliPath = cliContext.cliPath
  const arduinoCliConfigPath = toolsEnvs['cli'].cliConfigPath

  const { recordDump, crashDumpEndpoint } = await startDumpServer({
    dumpsOutputFolderPath: coredumpsPath,
    expectedPartitions: params.boardParams.map(({ fqbn }) => ({
      fqbn,
      project: testProjectName,
      version: placeholderVersion,
    })),
  })

  for (const boardParams of params.boardParams) {
    const fqbn = new FQBN(boardParams.fqbn)

    // Create a sketch from the template
    console.log(`Creating sketch for board: ${fqbn}...`)
    const sketchFolderPath = await createSketch({
      boardParams,
      sketchFolderTemplatePath: path.join(templatesPath, testProjectName),
      crashDumpEndpoint,
    })
    console.log(`Sketch created at: ${sketchFolderPath}`)

    // Compile the sketch for the board
    console.log(`Compiling sketch for board: ${fqbn}...`)
    const compileSummary = await compileSketch(
      arduinoCliPath,
      arduinoCliConfigPath,
      boardParams.fqbn,
      sketchFolderPath
    )
    console.log(`Compiled sketch for board: ${fqbn}`)

    // Copy the firmware ELF file to the coredumps folder
    /** @type {string[]} */
    const buildProperties = compileSummary.builder_result.build_properties
    const elfPath = buildProperties
      .filter((entry) => entry.startsWith('debug.executable='))
      .map((entry) => entry.split('=')[1])
      .pop()
    if (!elfPath) {
      throw new Error('ELF path not found in compile summary')
    }
    console.log(`ELF file created at: ${elfPath}`)
    const firmwareElfPath = path.join(
      coredumpsPath,
      testProjectName,
      fqbn.boardId,
      'firmware.elf'
    )
    await fs.mkdir(path.dirname(firmwareElfPath), { recursive: true })
    await fs.cp(elfPath, firmwareElfPath, { force: true })
    console.log(`Firmware ELF saved to: ${firmwareElfPath}`)

    // Upload the sketch to the board
    console.log(
      `Uploading sketch to board: ${fqbn} on port: ${boardParams.port}...`
    )
    await uploadSketch(
      arduinoCliPath,
      arduinoCliConfigPath,
      fqbn.toString(),
      boardParams.port,
      sketchFolderPath
    )
    console.log(
      `Sketch uploaded to board: ${fqbn} on port: ${boardParams.port}`
    )

    // Wait for the board to crash and write the coredump
    console.log(`Waiting for coredump from board: ${fqbn}...`)
    const secondsToWait = 60
    for (let i = 0; i < secondsToWait; i++) {
      console.log(`Waiting for coredump... (${i + 1}/${secondsToWait})`)
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    console.log(`Coredump wait time exceeded for board: ${fqbn}. Continuing...`)

    // Read the coredump from the flash partition
    let esptoolPath = buildProperties
      .filter((entry) => entry.startsWith('runtime.tools.esptool_py.path='))
      .map((entry) => entry.split('=')[1])
      .pop()
    if (!esptoolPath) {
      throw new Error('esptool path not found in compile summary')
    }
    esptoolPath = path.join(esptoolPath, 'esptool') // TODO: fix this for Windows
    console.log(`esptool path: ${esptoolPath}`)
    console.log(
      `Reading raw flash partition for board ${fqbn} (chip ${boardParams.chip}) on port ${boardParams.port}...`
    )
    const rawPartitionPath = path.join(
      coredumpsPath,
      testProjectName,
      fqbn.boardId,
      'read_flash-dump.raw'
    )
    await exec(esptoolPath, [
      '--chip',
      boardParams.chip,
      '--port',
      boardParams.port,
      '--baud',
      '115200',
      'read_flash',
      '0x3F0000',
      '0x10000',
      rawPartitionPath,
    ])
    console.log(
      `Raw flash partition read for board ${fqbn} saved to: ${rawPartitionPath}`
    )

    // Get ESP-IDF coredump

    const offset = '0x3F0000'
    const espIdfCoredumpPath = path.join(
      coredumpsPath,
      testProjectName,
      fqbn.boardId,
      'esp-coredump-dump.raw'
    )

    const pipxCommand = `pipx run esp-coredump info_corefile --core "" --core-format elf --off ${offset} --save-core ${espIdfCoredumpPath} ${firmwareElfPath}`
    const espIdfExport = path.join(
      os.homedir(),
      '/esp/v5.4.1/esp-idf/export.sh' // Adjust the version as needed
    )
    const bashCommand = `. "${espIdfExport}" && ${pipxCommand}`

    const { stdout, stderr } = await exec('bash', ['-c', bashCommand])
    if (stderr) {
      console.error(`Error reading coredump: ${stderr}`)
    } else {
      console.log(`ESP-IDF coredump saved to: ${espIdfCoredumpPath}`)
    }
    console.log(`ESP-IDF coredump read command executed: ${pipxCommand}`)
    console.log(stdout)

    await fs
      .rm(sketchFolderPath, {
        force: true,
        recursive: true,
        maxRetries: 3,
      })
      .catch((err) =>
        console.warn(`Failed to remove sketch folder ${sketchFolderPath}:`, err)
      )
  }

  // Wait for all dumps to be received
  await recordDump()
  console.log(
    `All expected coredumps received. Dumps saved to: ${coredumpsPath}`
  )
}

/**
 * @typedef {Object} CreateSketchParams
 * @property {BoardParams} boardParams
 * @property {string} sketchFolderTemplatePath
 * @property {string} crashDumpEndpoint
 */

/**
 * @param {CreateSketchParams} params
 */
async function createSketch({
  boardParams: { fqbn },
  sketchFolderTemplatePath,
  crashDumpEndpoint,
}) {
  const sketchName = path.basename(sketchFolderTemplatePath)
  const tmpDirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'trbr-dumps-'))
  const destinationSketchPath = path.join(tmpDirPath, sketchName)
  await fs.mkdir(destinationSketchPath, { recursive: true })
  await fs.cp(sketchFolderTemplatePath, destinationSketchPath, {
    recursive: true,
    force: true,
  })
  const mainSketchFilePath = path.join(
    destinationSketchPath,
    `${sketchName}.ino`
  )

  let template = await fs.readFile(mainSketchFilePath, 'utf-8')
  template = template.replace(/<WIFI_SSID>/g, WIFI_SSID)
  template = template.replace(/<WIFI_PASSWORD>/g, WIFI_PASSWORD)
  template = template.replace(/<CRASH_DUMP_ENDPOINT>/g, crashDumpEndpoint)
  template = template.replace(/<PROJECT>/g, sketchName)
  template = template.replace(/<VERSION>/g, placeholderVersion)
  template = template.replace(/<FQBN>/g, fqbn)

  await fs.writeFile(mainSketchFilePath, template, 'utf-8')

  return destinationSketchPath
}

const COREDUMP_FLAGS = [
  '-D CONFIG_LOG_DEFAULT_LEVEL=3',
  '-D CONFIG_ESP_COREDUMP_ENABLE=1',
  '-D CONFIG_ESP_COREDUMP_DATA_FORMAT_ELF=1',
  '-D CONFIG_ESP_COREDUMP_FLASH=1',
  '-D CONFIG_ESP_COREDUMP_CHECKSUM_CRC32=1',
  '-D CONFIG_ESP_COREDUMP_LOG_LVL=0',
  '-D CONFIG_ESP_COREDUMP_USE_STACK_SIZE=1',
  '-D CONFIG_ESP_COREDUMP_STACK_SIZE=1792',
  '-D CONFIG_ESP_COREDUMP_MAX_TASKS_NUM=64',
  '-D CONFIG_ESP_COREDUMP_CHECK_BOOT=1',
].join(' ')

/**
 * @param {string} cliPath
 * @param {string} cliConfigPath
 * @param {string} fqbn
 * @param {string} sketchPath
 * @returns {Promise<any>}
 */
async function compileSketch(cliPath, cliConfigPath, fqbn, sketchPath) {
  const { stdout } = await exec(cliPath, [
    'compile',
    sketchPath,
    '-b',
    fqbn,
    '--build-property',
    `compiler.c.extra_flags=${COREDUMP_FLAGS}`,
    '--build-property',
    `compiler.cpp.extra_flags=${COREDUMP_FLAGS}`,
    '--config-file',
    cliConfigPath,
    '--format',
    'json',
  ])

  return JSON.parse(stdout)
}

/**
 * @param {string} cliPath
 * @param {string} cliConfigPath
 * @param {string} fqbn
 * @param {string} port
 * @param {string} sketchPath
 * @returns {Promise<void>}
 */
async function uploadSketch(cliPath, cliConfigPath, fqbn, port, sketchPath) {
  await exec(cliPath, [
    'upload',
    sketchPath,
    '-b',
    fqbn,
    '-p',
    port,
    '--config-file',
    cliConfigPath,
    '--format',
    'json',
  ])
}

/**
 * @typedef {Object} PartitionParams
 * @property {string} project
 * @property {string} version
 * @property {string} fqbn
 */

/**
 * @typedef {Object} StartDumpServerParams
 * @property {string} dumpsOutputFolderPath
 * @property {number} [port=3000]
 * @property {PartitionParams[]} expectedPartitions
 */

/**
 * @param {StartDumpServerParams} startParams
 * @returns Promise<{ recordDump: () => Promise<void> }>
 */
async function startDumpServer(startParams) {
  /** curl -X POST http://localhost:3000/upload-coredump \
  -H "Authorization: Bearer abc123" \
  -F "project=esp32backtracetest" \
  -F "version=0.0.1" \
  -F "fqbn=esp32:esp32:esp32da" \
  -F "device_id=0xEA60" \
  -F "coredump=@coredump.raw" \
  --silent
 */

  function createDeferred() {
    /** @type {(value: any) => void} */
    let resolve = () => {}
    /** @type {(reason: unknown) => void} */
    let reject = () => {}
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  function getHostAddress() {
    const nets = os.networkInterfaces() || {}
    const results = {}

    for (const name of Object.keys(nets)) {
      const netsOnName = nets[name] || []
      for (const net of netsOnName) {
        const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
        if (net.family === familyV4Value && !net.internal) {
          if (!results[name]) {
            results[name] = []
          }
          results[name].push(net.address)
        }
      }
    }

    return results.en0[0] || results.eth0[0]
  }

  function checkParams(req) {
    const { version, project, device_id, fqbn: rawFqbn } = req.body
    if (!project) {
      throw new Error('Project name is required')
    }
    if (!version) {
      throw new Error('Version is required')
    }
    if (!rawFqbn) {
      throw new Error('FQBN is required')
    }
    if (!valid(rawFqbn)) {
      throw new Error('Invalid FQBN format')
    }
    if (!device_id) {
      throw new Error('Device ID is required')
    }
    if (!req?.file?.path) {
      throw new Error('No coredump file uploaded')
    }
    return {
      project,
      version,
      deviceId: device_id,
      fqbn: new FQBN(rawFqbn),
      coredumpPath: req.file.path,
    }
  }

  let recordDumps = false
  const deferred = createDeferred()
  const toRecordDumpKeys = new Set(
    startParams.expectedPartitions.map(
      ({ project, version, fqbn }) => `${project}:${version}:${fqbn}`
    )
  )

  const app = express()
  const upload = multer({
    dest: path.join(projectRootPath, '.test-resources/uploads'),
  })
  app.post('/upload-coredump', upload.single('coredump'), async (req, res) => {
    /** @type {ReturnType<typeof checkParams>} */
    let params
    try {
      params = checkParams(req)
    } catch (err) {
      res.status(400).send(err.message)
      return
    }

    try {
      const { project, version, fqbn, deviceId, coredumpPath } = params
      console.log(
        '[upload-coredump] Received coredump for project:',
        project,
        'version:',
        version,
        'from device:',
        deviceId,
        'FQBN:',
        fqbn,
        new Date().toISOString()
      )
      const dumpKey = `${project}:${version}:${fqbn}`

      if (!recordDumps) {
        console.log(
          '[upload-coredump] Recording dumps is disabled. Skipping processing.',
          dumpKey
        )
        res.status(423).send('Locked')
        return
      }

      if (!toRecordDumpKeys.has(dumpKey)) {
        console.log(
          '[upload-coredump] Dump already recorded. Skipping processing.',
          dumpKey
        )
        res.status(208).send('Already Reported')
        return
      }

      toRecordDumpKeys.delete(dumpKey)

      const stat = await fs.stat(coredumpPath)
      console.log(
        '[upload-coredump] Content-Length header:',
        req.headers['content-length']
      )
      console.log('[upload-coredump] Uploaded file size (fs.stat):', stat.size)
      console.log('[upload-coredump] File path:', coredumpPath)

      const first64 = await fs
        .readFile(coredumpPath)
        .then((buf) => buf.subarray(0, 64))
      console.log('[upload-coredump] First 64 bytes:', first64.toString('hex'))

      const rawPartitionPath = path.join(
        startParams.dumpsOutputFolderPath,
        project,
        fqbn.boardId,
        'esp_partition_read-dump.raw'
      )
      await fs.mkdir(path.dirname(rawPartitionPath), { recursive: true })
      await fs.cp(coredumpPath, rawPartitionPath, { force: true })
      console.log('[upload-coredump] Coredump saved to:', rawPartitionPath)

      res.status(200).send('OK')
    } catch (err) {
      console.error('[upload-coredump] Decode failed:', err)
      res.status(500).send('Failed to decode coredump')
    } finally {
      if (req?.file?.path) {
        fs.rm(req?.file?.path, {
          force: true,
          recursive: true,
          maxRetries: 3,
        }).catch((err) =>
          console.warn('[upload-coredump] Failed to remove coredump file:', err)
        )
      }

      if (!toRecordDumpKeys.size) {
        console.log(
          '[upload-coredump] All expected coredumps received, resolving promise'
        )
        deferred.resolve(undefined)
      }
    }
  })

  const port = startParams.port || 3000
  const server = http.createServer(app)
  const hostAddress = await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '0.0.0.0', () => {
      console.log(`[upload-coredump] Starting server on port ${port}...`)
      const hostAddress = getHostAddress()
      console.log(
        `[upload-coredump] Server is listening at http://0.0.0.0:${port} (host IP: ${hostAddress})`
      )
      resolve(hostAddress)
    })
  })

  return {
    recordDump: () => {
      recordDumps = true
      console.log('[upload-coredump] Recording dumps enabled')
      return new Promise((resolve, reject) => {
        deferred.promise
          .then(() => {
            server.close((err) => {
              if (err) {
                reject(err)
              }
              resolve(undefined)
            })
          })
          .catch((err) => {
            console.error('[upload-coredump] Error recording dumps:', err)
            reject(err)
          })
      })
    },
    crashDumpEndpoint: `http://${hostAddress}:${port}/upload-coredump`,
  }
}

async function main() {
  const testEnv = await setupTestEnv()

  const params = {
    boardParams: [
      {
        fqbn: 'esp32:esp32:esp32da',
        chip: 'esp32',
        port: '/dev/cu.usbserial-0001',
      },
      {
        fqbn: 'esp32:esp32:esp32c3',
        chip: 'esp32c3',
        port: '/dev/cu.usbmodem101',
      },
      {
        fqbn: 'esp32:esp32:esp32c6',
        chip: 'esp32c6',
        port: '/dev/cu.usbmodem2101',
      },
    ],
    dumpDestinationFolderPath: coredumpsPath,
  }

  await createDumps(params, testEnv)
  console.log(`Coredumps created and saved to: ${coredumpsPath}`)
}

main().catch(console.error)
