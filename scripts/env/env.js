// @ts-check

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs, { constants } from 'node:fs/promises'
import path from 'node:path'

import { rimraf } from 'rimraf'
import { gte, SemVer } from 'semver'
import { exec, NonZeroExitError } from 'tinyexec'

import { appendDotExeOnWindows, isWindows, projectRootPath } from '../utils.js'

/**
 * @typedef {Object} CliContext
 * @property {string} cliPath - Path to the Arduino CLI executable
 * @property {string} cliVersion - Version of the Arduino CLI
 */

/**
 * @typedef {Object} CompileParams
 * @property {TestEnv} testEnv
 * @property {ToolEnvType} [type='cli'] Default is `'cli'`
 * @property {string} sketchPath
 * @property {string} fqbn
 * @property {string[]} [buildProperties] - Extra `--build-property` entries.
 * @property {boolean} [force=false] Default is `false`
 */

/**
 * @typedef {Record<string, unknown> & {
 *   builder_result: { build_path: string; build_properties: string[] }
 * }} CompileSummary
 */

/**
 * @typedef {Object} ToolEnv
 * @property {string} cliConfigPath - Path to the Arduino CLI configuration file
 * @property {string} dataDirPath - Path to the `data.directory` for the tool
 * @property {string} userDirPath - Path to the `user.directory` for the tool
 */

/**
 * @callback Compile
 * @param {CompileParams} params
 * @returns {Promise<CompileSummary>}
 */

/** @type {Compile} */
export async function compileWithTestEnv({
  testEnv,
  type,
  sketchPath,
  fqbn,
  buildProperties,
  force,
}) {
  const key = createCompileCacheKey({ sketchPath, fqbn, buildProperties })
  const existing = compileCache.get(key)
  if (!force && existing) {
    return existing
  }

  const cliPath = testEnv.cliContext.cliPath
  const cliConfigPath = testEnv.toolEnvs[type ?? 'cli'].cliConfigPath
  const summary = await compileSketch(
    cliPath,
    cliConfigPath,
    fqbn,
    sketchPath,
    buildProperties,
    createCompileBuildPath(key)
  )
  compileCache.set(key, summary)
  return summary
}

/**
 * @typedef {Object} TestEnv
 * @property {CliContext} cliContext
 * @property {{ cli: ToolEnv; git: ToolEnv }} toolEnvs
 */
/** @typedef {keyof TestEnv['toolEnvs']} ToolEnvType */

/**
 * @typedef {Object} GitEnvConfig
 * @property {string} gitUrl
 * @property {string} branchOrTagName
 * @property {string} folderName
 */

/**
 * @typedef {Object} CliEnvPlatform
 * @property {string} vendor
 * @property {string} arch
 * @property {string} version
 * @property {string} url
 */

/** @typedef {{ VersionString: string }} CliVersionResponse */

/** @typedef {[vendor: string, arch: string]} PlatformId */

/**
 * @callback PostSetupHook
 * @param {CliContext} cliContext
 * @param {ToolEnv} toolsEnv
 * @returns {Promise<ToolEnv>}
 */

/**
 * @param {ToolEnvType} type
 * @returns {string}
 */
const getUserDirPath = (type) =>
  path.resolve(
    path.resolve(projectRootPath, '.test-resources'),
    'envs',
    type,
    'Arduino'
  )

/**
 * @param {ToolEnvType} type
 * @returns {string}
 */
const getDataDirPath = (type) =>
  path.resolve(
    path.resolve(projectRootPath, '.test-resources'),
    'envs',
    type,
    'Arduino15'
  )

/**
 * @param {ToolEnvType} type
 * @returns {string}
 */
const getCliConfigPath = (type) =>
  path.resolve(
    path.resolve(projectRootPath, '.test-resources'),
    'envs',
    type,
    'arduino-cli.yaml'
  )

/**
 * @param {CliContext} _cliContext
 * @param {ToolEnv} toolsEnv
 * @returns {Promise<ToolEnv>}
 */
async function installToolsViaGit(_cliContext, toolsEnv) {
  const { userDirPath } = toolsEnv
  const envGitJson = await fs.readFile(
    path.join(projectRootPath, 'scripts', 'env', 'env.git.json'),
    'utf-8'
  )
  const gitEnv = /** @type {GitEnvConfig} */ (JSON.parse(envGitJson))
  const { gitUrl, branchOrTagName, folderName } = gitEnv
  const checkoutPath = path.join(userDirPath, 'hardware', folderName)
  await fs.mkdir(checkoutPath, { recursive: true })
  const toolsPath = path.join(checkoutPath, 'esp32/tools')
  const getPy = path.join(toolsPath, 'get.py')

  try {
    await fs.access(getPy, constants.F_OK | constants.X_OK)
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      /** @type {string | undefined} */
      let tempToolsPath
      try {
        // `--branch` can be a branch name or a tag
        await exec(
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
          // https://github.com/espressif/arduino-esp32/blob/72c41d09538663ebef80d29eb986cd5bc3395c2d/tools/get.py#L35-L36
          await exec('pip', ['install', 'requests', '-q'], {
            throwOnError: true,
          })
        }
        try {
          await exec('python', [getPy], {
            nodeOptions: { cwd: tempToolsPath },
            throwOnError: true,
          })
        } catch (err) {
          if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            // python has been renamed to python3 on some systems
            await exec('python3', [getPy], {
              nodeOptions: { cwd: tempToolsPath },
              throwOnError: true,
            })
          } else {
            throw err
          }
        }
        const tools = await fs.readdir(tempToolsPath)
        for (const tool of tools) {
          // Copy and delete to overcome EPERM on Windows
          const source = path.join(tempToolsPath, tool)
          const target = path.join(toolsPath, tool)
          await fs.cp(source, target, { recursive: true })
          try {
            await fs.rm(source, { recursive: true, force: true })
          } catch (err) {
            console.warn(`Failed to delete ${source}:`, err)
          }
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

/**
 * @param {string} cliPath
 * @param {string} cliConfigPath
 * @param {string} fqbn
 * @param {string} sketchPath
 * @param {string[]} [buildProperties]
 * @param {string} [buildPath]
 * @returns {Promise<CompileSummary>}
 */
async function compileSketch(
  cliPath,
  cliConfigPath,
  fqbn,
  sketchPath,
  buildProperties = [],
  buildPath
) {
  if (buildPath) {
    await rimraf(buildPath, { maxRetries: 5 })
    await fs.mkdir(buildPath, { recursive: true })
  }
  const args = [
    'compile',
    sketchPath,
    '--fqbn',
    fqbn,
    '--config-file',
    cliConfigPath,
    '--format',
    'json',
  ]
  if (buildPath) {
    args.push('--build-path', buildPath)
  }
  for (const buildProperty of buildProperties) {
    args.push('--build-property', buildProperty)
  }
  let stdout
  try {
    const result = await exec(cliPath, args, { throwOnError: true })
    stdout = result.stdout
  } catch (err) {
    if (!(err instanceof NonZeroExitError)) {
      throw err
    }
    const stderr = err.output?.stderr.trim() ?? ''
    const commandOutput = err.output?.stdout.trim() ?? ''
    const exitCode = err.exitCode
    const lines = [
      `Failed to compile sketch '${sketchPath}' for '${fqbn}'`,
      `Command: ${cliPath} ${args.join(' ')}`,
    ]
    if (exitCode !== undefined) {
      lines.push(`Exit code: ${exitCode}`)
    }
    if (stderr) {
      lines.push(`stderr:\n${stderr}`)
    }
    if (commandOutput) {
      lines.push(`stdout:\n${commandOutput}`)
    }
    throw new Error(lines.join('\n'), { cause: err })
  }

  return JSON.parse(stdout)
}

/**
 * @param {CliContext} cliContext
 * @param {ToolEnv} toolsEnv
 * @returns {Promise<ToolEnv>}
 */
async function installToolsViaCLI(cliContext, toolsEnv) {
  const { cliPath } = cliContext
  const { cliConfigPath } = toolsEnv
  const envCliJson = await fs.readFile(
    path.join(projectRootPath, 'scripts', 'env', 'env.cli.json'),
    'utf-8'
  )
  const cliEnv = /** @type {CliEnvPlatform[]} */ (JSON.parse(envCliJson))
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

/**
 * @param {Pick<CompileParams, 'sketchPath' | 'fqbn' | 'buildProperties'>} params
 * @returns
 */
function createCompileCacheKey({ sketchPath, fqbn, buildProperties }) {
  const copy = (buildProperties ?? []).slice()
  copy.sort((left, right) => left.localeCompare(right))
  return `${sketchPath}#${fqbn}${copy.length ? `#${copy.join(',')}` : ''}`
}

/**
 * Use a per-process build directory to avoid collisions when slow suites
 * compile the same sketch in parallel workers on CI. For example,
 * `C:\\..xtensa-esp-elf/bin/ar.exe: C:\\..\\core\\core.a: malformed archive`
 *
 * @param {string} cacheKey
 */
function createCompileBuildPath(cacheKey) {
  const hash = createHash('sha1').update(cacheKey).digest('hex').slice(0, 12)
  return path.resolve(
    projectRootPath,
    '.test-resources',
    'builds',
    `${process.pid}-${hash}`
  )
}

/** @type {Map<string, CompileSummary>} */
const compileCache = new Map()

/**
 * @param {CliContext} cliContext
 * @param {ToolEnvType} type
 * @param {PostSetupHook} [postSetup]
 * @returns {Promise<ToolEnv>}
 */
async function setupToolEnv(
  cliContext,
  type,
  postSetup = (_cliContext, toolsEnv) => Promise.resolve(toolsEnv)
) {
  const { cliPath } = cliContext
  const cliConfigPath = getCliConfigPath(type)
  const dataDirPath = getDataDirPath(type)
  const userDirPath = getUserDirPath(type)
  /** @type {ToolEnv} */
  const toolEnv = {
    cliConfigPath,
    dataDirPath,
    userDirPath,
  }
  await Promise.all([
    ensureCliConfigExists(cliPath, toolEnv),
    fs.mkdir(userDirPath, { recursive: true }),
    fs.mkdir(dataDirPath, { recursive: true }),
  ])
  await ensureConfigSet(cliPath, cliConfigPath, 'directories.data', dataDirPath)
  await ensureConfigSet(cliPath, cliConfigPath, 'directories.user', userDirPath)
  await ensureIndexUpdated(cliPath, cliConfigPath)
  await postSetup(cliContext, toolEnv)
  return toolEnv
}

/**
 * @param {CliContext} cliContext
 * @returns {Promise<string>}
 */
async function assertCli(cliContext) {
  const { cliPath, cliVersion } = cliContext
  assert.ok(cliPath)
  assert.ok(cliPath.length)
  const { stdout } = await exec(cliPath, ['version', '--format', 'json'], {
    throwOnError: true,
  })
  assert.ok(stdout)
  assert.ok(stdout.length)
  const actualVersion = /** @type {CliVersionResponse} */ (JSON.parse(stdout))
    .VersionString
  let expectedVersion = cliVersion
  // Drop the `v` prefix from the CLI GitHub release name.
  // https://github.com/arduino/arduino-cli/pull/2374
  if (gte(expectedVersion, '0.35.0-rc.1')) {
    expectedVersion = new SemVer(expectedVersion).version
  }
  assert.strictEqual(actualVersion, expectedVersion)
  return cliPath
}

/**
 * @param {PlatformId} platformId
 * @param {CliContext} cliContext
 * @param {ToolEnv} toolsEnv
 * @returns {Promise<void>}
 */
async function assertPlatformExists([vendor, arch], cliContext, toolsEnv) {
  const id = `${vendor}:${arch}`
  const { cliPath } = cliContext
  const { cliConfigPath } = toolsEnv
  const { stdout } = await exec(
    cliPath,
    ['core', 'list', '--config-file', cliConfigPath, '--format', 'json'],
    { throwOnError: true }
  )
  assert.ok(stdout)
  assert.ok(stdout.length)
  const { platforms } = /** @type {{ platforms: { id: string }[] }} */ (
    JSON.parse(stdout)
  )
  assert.ok(Array.isArray(platforms))
  const platform = platforms.find((p) => p.id === id)
  assert.ok(platform, `Could not find installed platform: '${id}'`)
}

/** @returns {Promise<TestEnv>} */
export async function setupTestEnv() {
  const cliPath = path.join(
    path.resolve(projectRootPath, '.arduino-cli'),
    appendDotExeOnWindows('arduino-cli')
  )
  const arduinoCliJson = await fs.readFile(
    path.join(projectRootPath, 'arduino-cli.json'),
    'utf-8'
  )
  const arduinoCliConfig = /** @type {{ version: string }} */ (
    JSON.parse(arduinoCliJson)
  )
  const cliContext = {
    cliPath,
    cliVersion: arduinoCliConfig.version,
  }
  await assertCli(cliContext)

  const [cliToolsEnv, gitToolsEnv] = await Promise.all([
    setupToolEnv(cliContext, 'cli', installToolsViaCLI),
    setupToolEnv(cliContext, 'git', installToolsViaGit),
  ])
  return {
    cliContext,
    toolEnvs: {
      cli: cliToolsEnv,
      git: gitToolsEnv,
    },
  }
}

/**
 * @param {string} cliPath
 * @param {string} cliConfigPath
 * @returns {Promise<void>}
 */
async function ensureIndexUpdated(cliPath, cliConfigPath) {
  await runCli(cliPath, ['core', 'update-index'], cliConfigPath)
}

/**
 * @param {string} cliPath
 * @param {string} cliConfigPath
 * @param {PlatformId} platformId
 * @param {string | undefined} version
 * @returns {Promise<void>}
 */
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

/**
 * @param {string} cliPath
 * @param {ToolEnv} toolsEnv
 * @returns {Promise<void>}
 */
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

/**
 * @param {string} cliPath
 * @param {string} cliConfigPath
 * @param {string} configKey
 * @param {...string} configValue
 * @returns {Promise<void>}
 */
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

/**
 * @param {string} cliPath
 * @param {string[]} args
 * @param {string} [cliConfigPath]
 * @returns {Promise<Awaited<ReturnType<typeof exec>>>}
 */
async function runCli(cliPath, args, cliConfigPath) {
  const cliArgs = cliConfigPath
    ? [...args, '--config-file', cliConfigPath]
    : args
  return exec(cliPath, cliArgs, { throwOnError: true })
}
