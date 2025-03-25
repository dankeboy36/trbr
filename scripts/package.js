// @ts-check

import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import archiver from 'archiver'
import { x } from 'tinyexec'

import { appendDotExeOnWindows, isWindows, projectRootPath } from './utils.js'

const arduinoCli = 'arduino-cli'

const isMacOS = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

async function readPackageJson() {
  const packageJson = await fs.readFile(
    path.join(projectRootPath, 'package.json'),
    'utf-8'
  )
  const { name, version } = JSON.parse(packageJson)
  return { name, version }
}

function createZipName({ name, version }) {
  let platform = 'Windows'
  if (isMacOS) {
    platform = 'macOS'
  } else if (isLinux) {
    platform = 'Linux'
  }
  let arch = '64bit'
  if (process.arch === 'arm64') {
    arch = 'arm64'
  }
  return `${name}_${version}_${platform}_${arch}.zip`
}

async function run() {
  if (!isWindows && !isMacOS && !isLinux) {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  const { name, version } = await readPackageJson()

  const arduinoCliPath = path.join(projectRootPath, '.arduino-cli')
  const binPath = path.join(projectRootPath, 'bin')
  const workdirPath = path.join(binPath, 'workdir')
  const appName = appendDotExeOnWindows(name)
  const appPath = path.join(workdirPath, appName)
  const seaConfigPath = path.join(workdirPath, 'sea-config.json')
  const seaBlobPath = path.join(workdirPath, 'sea-prep.blob')

  const zipName = createZipName({ name, version })
  console.log(`Packaging ${zipName}`)

  console.log('Cleaning bin...')
  await x('git', ['clean', '-ffdx'], {
    nodeOptions: { cwd: binPath },
    throwOnError: true,
  })
  console.log('Cleaned bin')

  console.log('Creating bin/workdir...')
  await fs.mkdir(workdirPath, { recursive: true })
  console.log('Created bin/workdir')

  console.log('Creating SEA config...')
  await fs.writeFile(
    seaConfigPath,
    JSON.stringify(
      {
        main: path.join(binPath, '..', 'dist', 'cli', 'cli.cjs'),
        output: seaBlobPath,
        disableExperimentalSEAWarning: true,
        assets: {
          [arduinoCli]: path.join(
            arduinoCliPath,
            appendDotExeOnWindows(arduinoCli)
          ),
        },
      },
      null,
      2
    )
  )
  console.log('SEA config created')

  console.log('Generating the application blob...')
  const generateBlobResult = await x(
    'node',
    ['--experimental-sea-config', seaConfigPath],
    { throwOnError: true }
  )
  console.log('Application blob generated', generateBlobResult.stdout)

  console.log('Creating a copy of the Node.js executable...')
  await fs.cp(process.execPath, appPath)
  console.log('Node.js executable copy created')

  if (isWindows || isMacOS) {
    console.log('Removing the signature of the binary...')
    if (isWindows) {
      // await x('signtool', ['remove', '/s', appPath], { throwOnError: true })
    } else {
      await x('codesign', ['--remove-signature', appPath], {
        throwOnError: true,
      })
    }
    console.log('Binary signature removed')
  }

  console.log('Injecting the application blob into the Node.js binary...')
  const injectArgs = [
    'postject',
    appPath,
    'NODE_SEA_BLOB',
    seaBlobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ]
  if (isMacOS) {
    injectArgs.push('--macho-segment-name', 'NODE_SEA')
  }
  await x('npx', injectArgs, { throwOnError: true })
  console.log('Application blob injected')

  if (isWindows || isMacOS) {
    console.log('Signing the binary...')
    if (isWindows) {
      // TODO
    } else {
      await x('codesign', ['--sign', '-', appPath], { throwOnError: true })
    }
    console.log('Binary signed')
  }

  console.log('Creating the ZIP file...')
  const zipOutput = createWriteStream(path.join(binPath, zipName))
  const archive = archiver('zip', { zlib: { level: 9 } })
  await new Promise((resolve, reject) => {
    archive.on('error', reject)
    archive.on('end', resolve)

    archive.pipe(zipOutput)
    archive.file(appPath, { name: appName, mode: 0o755 })
    archive.finalize()
  })
  console.log('ZIP file created')

  console.log('Cleaning bin/workdir...')
  await fs.rm(workdirPath, { recursive: true, force: true })
  console.log('Cleaned bin/workdir')

  console.log(`Packaged ${zipName}`)
}

run().catch(console.error)
