// @ts-check
// TODO: move it to a lib: https://github.com/dankeboy36/semantic-release-next-version

import { execSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import semanticRelease from 'semantic-release'
import semver from 'semver'

const MAIN_BRANCH = 'main'
const DEFAULT_BRANCHES = ['main', { name: '*' }]
/** @type {import('semantic-release').Options} */
const DEFAULT_OPTIONS = {
  repositoryUrl: '.',
  branches: DEFAULT_BRANCHES,
  // eslint-disable-next-line no-template-curly-in-string
  tagFormat: '${version}',
  plugins: ['@semantic-release/commit-analyzer'],
}

/** @param {string} cwd */
function getCurrentBranch(cwd) {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

/**
 * @param {import('semantic-release').BranchSpec[]} branches
 * @param {string} branchName
 */
function branchExists(branches, branchName) {
  return branches.some((entry) => {
    if (typeof entry === 'string') return entry === branchName
    return entry?.name === branchName
  })
}

/** @param {string} branchName */
function toPrereleaseId(branchName) {
  const slug = branchName
    .replace(/[^0-9A-Za-z-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'prerelease'
}

/** @param {string} cwd */
function getRepositoryUrl(cwd) {
  const localRepoUrl = pathToFileURL(path.join(cwd, '.git')).href
  return localRepoUrl
}

/**
 * Calculate the next semantic-release version without pushing tags or
 * publishing.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory, defaults to process.cwd().
 * @param {object} [options.config] - Semantic-release config overrides.
 * @param {string} [options.repositoryUrl] - Repository URL override.
 * @param {import('semantic-release').BranchSpec[]
 *   | import('semantic-release').BranchSpec} [options.branches]
 *   -
 *
 *   Branch configuration override.
 * @param {string} [options.tagFormat] - Tag format override.
 * @param {string[]} [options.plugins] - Plugin override.
 * @param {boolean} [options.release=false] - When true, return the plain next
 *   version (no preview suffix). Default is `false`
 * @returns {Promise<string>} Next release version.
 */
export async function getNextVersion({
  cwd = process.cwd(),
  config = {},
  repositoryUrl,
  branches: overrideBranches,
  tagFormat,
  plugins,
  release = false,
} = {}) {
  const loadedConfig = {
    ...DEFAULT_OPTIONS,
    ...config,
    ...(repositoryUrl
      ? { repositoryUrl }
      : { repositoryUrl: getRepositoryUrl(cwd) }),
    ...(tagFormat ? { tagFormat } : {}),
    ...(plugins ? { plugins } : {}),
  }
  const currentBranch = getCurrentBranch(cwd) || MAIN_BRANCH
  const baseBranches = overrideBranches ?? loadedConfig.branches
  const branches = Array.isArray(baseBranches)
    ? [...baseBranches]
    : [baseBranches ?? MAIN_BRANCH]

  if (!branchExists(branches, currentBranch)) {
    branches.push({
      name: currentBranch,
      prerelease:
        currentBranch !== MAIN_BRANCH ? toPrereleaseId(currentBranch) : false,
    })
  }

  // Surface the effective branch list so callers can see what semantic-release will evaluate.
  console.log(
    `Determining next version on branch "${currentBranch}" using branches:`,
    branches
  )

  const result = await semanticRelease(
    {
      ...loadedConfig,
      branches,
      dryRun: true,
      ci: false,
      repositoryUrl: loadedConfig.repositoryUrl ?? '.',
    },
    {
      cwd,
      env: process.env,
      stdout: process.stdout,
      stderr: process.stderr,
    }
  )

  if (!result) {
    throw new Error('semantic-release did not return a next version.')
  }

  const parsed = semver.parse(result.nextRelease.version)
  if (!parsed) {
    throw new Error(
      `Unable to parse semantic-release version: ${result.nextRelease.version}`
    )
  }

  const baseVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  if (release) return baseVersion

  const commitHash =
    process.env.GITHUB_SHA?.slice(0, 7) ||
    execSync('git rev-parse --short HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() ||
    toPrereleaseId(getCurrentBranch(cwd) || 'preview')

  return `${baseVersion}-preview-${commitHash}`
}

async function run() {
  try {
    const args = process.argv.slice(2)
    const release = args.includes('--release')
    const version = await getNextVersion({ release })
    console.log(version)
  } catch (error) {
    const message = error instanceof Error ? error.message : error
    console.error(message)
    process.exitCode = 1
  }
}

// @ts-ignore
const isCli = pathToFileURL(process.argv[1] ?? '').href === import.meta.url
if (isCli) {
  await run()
}
