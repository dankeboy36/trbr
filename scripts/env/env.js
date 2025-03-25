// @ts-check

import assert from 'node:assert/strict'
import fs, { constants } from 'node:fs/promises'
import path from 'node:path'

import { rimraf } from 'rimraf'
import { SemVer, gte } from 'semver'
import { x } from 'tinyexec'

import { appendDotExeOnWindows, isWindows, projectRootPath } from '../utils.js'

const getUserDirPath = (type) =>
  path.resolve(
    path.resolve(projectRootPath, '.test-resources'),
    'envs',
    type,
    'Arduino'
  )
const getDataDirPath = (type) =>
  path.resolve(
    path.resolve(projectRootPath, '.test-resources'),
    'envs',
    type,
    'Arduino15'
  )
const getCliConfigPath = (type) =>
  path.resolve(
    path.resolve(projectRootPath, '.test-resources'),
    'envs',
    type,
    'arduino-cli.yaml'
  )

async function installToolsViaGit(_, toolsEnv) {
  const { userDirPath } = toolsEnv
  const envGitJson = await fs.readFile(
    path.join(projectRootPath, 'scripts', 'env', 'env.git.json'),
    'utf-8'
  )
  const gitEnv = JSON.parse(envGitJson)
  const { gitUrl, branchOrTagName, folderName } = gitEnv
  const checkoutPath = path.join(userDirPath, 'hardware', folderName)
  await fs.mkdir(checkoutPath, { recursive: true })
  const toolsPath = path.join(checkoutPath, 'esp32/tools')
  const getPy = path.join(toolsPath, 'get.py')

  try {
    await fs.access(getPy, constants.F_OK | constants.X_OK)
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      let tempToolsPath
      try {
        // `--branch` can be a branch name or a tag
        await x(
          'git',
          [
            'clone',
            gitUrl,
            '--depth',
            '1',
            '--branch',
            branchOrTagName,
            'esp32',
          ],
          {
            nodeOptions: { cwd: checkoutPath },
            throwOnError: true,
          }
        )
        // Instead of running the core installation python script in the esp32/tools `cwd`,
        // this code extracts the tools into a "temp" folder inside the `./test-resources` folder,
        // then moves the tools to esp32/tools. Extracting the files to temp might not work, because
        // the tests can run on D:\ and the temp folder is on C:\ and moving the files will result in EXDEV error.
        // Running both `python get.py` and `get.exe` have failed on Windows from Node.js. it was fine from CMD.EXE.
        tempToolsPath = await fs.mkdtemp(
          path.join(
            path.resolve(projectRootPath, '.test-resources'),
            'esp32-temp-tool'
          )
        )
        if (isWindows) {
          //https://github.com/espressif/arduino-esp32/blob/72c41d09538663ebef80d29eb986cd5bc3395c2d/tools/get.py#L35-L36
          await x('pip', ['install', 'requests', '-q'], { throwOnError: true })
        }
        try {
          await x('python', [getPy], { nodeOptions: { cwd: tempToolsPath } })
        } catch (err) {
          if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            // python has been renamed to python3 on some systems
            await x('python3', [getPy], {
              nodeOptions: { cwd: tempToolsPath },
              throwOnError: true,
            })
          } else {
            throw err
          }
        }
        const tools = await fs.readdir(tempToolsPath)
        for (const tool of tools) {
          await fs.rename(
            path.join(tempToolsPath, tool),
            path.join(toolsPath, tool)
          )
        }
      } catch (err) {
        await rimraf(checkoutPath, { maxRetries: 5 }) // Cleanup local git clone
        throw err
      } finally {
        if (tempToolsPath) {
          await rimraf(tempToolsPath, { maxRetries: 5 })
        }
      }
    } else {
      throw err
    }
  }
  return toolsEnv
}

async function installToolsViaCLI(cliContext, toolsEnv) {
  const { cliPath } = cliContext
  const { cliConfigPath } = toolsEnv
  const envCliJson = await fs.readFile(
    path.join(projectRootPath, 'scripts', 'env', 'env.cli.json'),
    'utf-8'
  )
  const cliEnv = JSON.parse(envCliJson)
  const additionalUrls = cliEnv.map(({ url }) => url)
  await ensureConfigSet(
    cliPath,
    cliConfigPath,
    'board_manager.additional_urls',
    ...additionalUrls
  )
  for (const requirePlatform of cliEnv) {
    const { vendor, arch, version } = requirePlatform
    await ensurePlatformExists(cliPath, cliConfigPath, [vendor, arch], version)
  }
  await Promise.all(
    cliEnv.map(({ vendor, arch }) =>
      assertPlatformExists([vendor, arch], cliContext, toolsEnv)
    )
  )
  return toolsEnv
}

async function setupToolsEnv(
  cliContext,
  type,
  postSetup = (_, toolsEnv) => Promise.resolve(toolsEnv)
) {
  const { cliPath } = cliContext
  const cliConfigPath = getCliConfigPath(type)
  const dataDirPath = getDataDirPath(type)
  const userDirPath = getUserDirPath(type)
  const toolsEnv = {
    cliConfigPath,
    dataDirPath,
    userDirPath,
  }
  await Promise.all([
    ensureCliConfigExists(cliPath, toolsEnv),
    fs.mkdir(userDirPath, { recursive: true }),
    fs.mkdir(dataDirPath, { recursive: true }),
  ])
  await ensureConfigSet(cliPath, cliConfigPath, 'directories.data', dataDirPath)
  await ensureConfigSet(cliPath, cliConfigPath, 'directories.user', userDirPath)
  await ensureIndexUpdated(cliPath, cliConfigPath)
  await postSetup(cliContext, toolsEnv)
  return toolsEnv
}

async function assertCli(cliContext) {
  const { cliPath, cliVersion } = cliContext
  assert.ok(cliPath)
  assert.ok(cliPath.length)
  const { stdout } = await x(cliPath, ['version', '--format', 'json'], {
    throwOnError: true,
  })
  assert.ok(stdout)
  assert.ok(stdout.length)
  const actualVersion = JSON.parse(stdout).VersionString
  let expectedVersion = cliVersion
  // Drop the `v` prefix from the CLI GitHub release name.
  // https://github.com/arduino/arduino-cli/pull/2374
  if (gte(expectedVersion, '0.35.0-rc.1')) {
    expectedVersion = new SemVer(expectedVersion).version
  }
  assert.strictEqual(actualVersion, expectedVersion)
  return cliPath
}

async function assertPlatformExists([vendor, arch], cliContext, toolsEnv) {
  const id = `${vendor}:${arch}`
  const { cliPath } = cliContext
  const { cliConfigPath } = toolsEnv
  const { stdout } = await x(
    cliPath,
    ['core', 'list', '--config-file', cliConfigPath, '--format', 'json'],
    { throwOnError: true }
  )
  assert.ok(stdout)
  assert.ok(stdout.length)
  const { platforms } = JSON.parse(stdout)
  assert.ok(Array.isArray(platforms))
  const platform = platforms.find((p) => p.id === id)
  assert.ok(platform, `Could not find installed platform: '${id}'`)
}

/** @typedef {Awaited<ReturnType<typeof setupTestEnv>>} TestEnv */

export async function setupTestEnv() {
  const cliPath = path.join(
    path.resolve(projectRootPath, '.arduino-cli'),
    appendDotExeOnWindows('arduino-cli')
  )
  const arduinoCliJson = await fs.readFile(
    path.join(projectRootPath, 'arduino-cli.json'),
    'utf-8'
  )
  const cliContext = {
    cliPath,
    cliVersion: /**@type {string}*/ (JSON.parse(arduinoCliJson).version),
  }
  await assertCli(cliContext)

  const [cliToolsEnv, gitToolsEnv] = await Promise.all([
    setupToolsEnv(cliContext, 'cli', installToolsViaCLI),
    setupToolsEnv(cliContext, 'git', installToolsViaGit),
  ])
  return {
    cliContext,
    toolsEnvs: {
      cli: cliToolsEnv,
      git: gitToolsEnv,
    },
  }
}

async function ensureIndexUpdated(cliPath, cliConfigPath) {
  await runCli(cliPath, ['core', 'update-index'], cliConfigPath)
}

async function ensurePlatformExists(
  cliPath,
  cliConfigPath,
  [vendor, arch],
  version
) {
  await ensureIndexUpdated(cliPath, cliConfigPath)
  await runCli(
    cliPath,
    [
      'core',
      'install',
      `${vendor}:${arch}${version ? `@${version}` : ''}`,
      '--skip-post-install',
    ],
    cliConfigPath
  )
}

async function ensureCliConfigExists(cliPath, toolsEnv) {
  const { cliConfigPath } = toolsEnv
  try {
    await fs.access(cliConfigPath, constants.F_OK)
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      await runCli(cliPath, ['config', 'init', '--dest-file', cliConfigPath])
    } else {
      throw err
    }
  }
}

async function ensureConfigSet(
  cliPath,
  cliConfigPath,
  configKey,
  ...configValue
) {
  await runCli(
    cliPath,
    ['config', 'set', configKey, ...configValue],
    cliConfigPath
  )
}

async function runCli(cliPath, args, cliConfigPath) {
  if (cliConfigPath) {
    args.push('--config-file', cliConfigPath)
  }
  return x(cliPath, args, { throwOnError: true })
}
