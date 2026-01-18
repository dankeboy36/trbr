// @ts-check
// TODO: move it to a lib: https://github.com/dankeboy36/semantic-release-next-version

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
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
 * Create a bare mirror of the current repo and ensure release branches exist as
 * local heads so semantic-release can push dry-run refs without guessing.
 *
 * @param {string} cwd
 * @param {import('semantic-release').BranchSpec[]} branches
 * @param {string} currentBranch
 */
function createLocalBareRemote(cwd, branches, currentBranch) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-version-'))
  execSync(`git clone --mirror . "${tmpDir}"`, {
    cwd,
    stdio: 'ignore',
  })

  const branchNames = branches
    .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
    .filter(Boolean)

  const resolveSha = (name) => {
    try {
      return execSync(
        `git --git-dir "${tmpDir}" rev-parse refs/remotes/origin/${name}`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim()
    } catch {
      if (name === currentBranch) {
        try {
          return execSync('git rev-parse HEAD', {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim()
        } catch {
          return ''
        }
      }
      return ''
    }
  }

  branchNames.forEach((name) => {
    const sha = resolveSha(name)
    if (sha) {
      try {
        execSync(
          `git --git-dir "${tmpDir}" update-ref refs/heads/${name} ${sha}`,
          { stdio: 'ignore' }
        )
      } catch {
        // ignore failed updates; semantic-release will error later if needed
      }
    }
  })

  return pathToFileURL(tmpDir).href
}

/**
 * Ensure local refs exist for release branches so semantic-release doesn't see
 * an empty list.
 *
 * @param {import('semantic-release').BranchSpec[]} branches
 * @param {string} cwd
 */
function ensureLocalBranches(branches, cwd) {
  branches
    .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
    .filter(Boolean)
    .forEach((name) => {
      try {
        execSync(`git show-ref --verify --quiet refs/heads/${name}`, {
          cwd,
          stdio: 'ignore',
        })
      } catch {
        try {
          execSync(
            `git show-ref --verify --quiet refs/remotes/origin/${name}`,
            {
              cwd,
              stdio: 'ignore',
            }
          )
          execSync(`git branch --track ${name} origin/${name}`, {
            cwd,
            stdio: 'ignore',
          })
        } catch {
          // ignore if origin branch does not exist
        }
      }
    })
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
  if (
    process.env.GITHUB_HEAD_REF &&
    process.env.GITHUB_REF?.startsWith('refs/pull/')
  ) {
    // Force env-ci to treat the source branch as the release branch on PRs.
    process.env.GITHUB_REF = `refs/heads/${process.env.GITHUB_HEAD_REF}`
    process.env.GITHUB_REF_NAME = process.env.GITHUB_HEAD_REF
  }

  const loadedConfig = {
    ...DEFAULT_OPTIONS,
    ...config,
    repositoryUrl: repositoryUrl ?? getRepositoryUrl(cwd),
    ...(tagFormat ? { tagFormat } : {}),
    ...(plugins ? { plugins } : {}),
  }
  const currentBranch = getCurrentBranch(cwd) || MAIN_BRANCH
  const baseBranches = overrideBranches ?? loadedConfig.branches
  const branches = Array.isArray(baseBranches)
    ? [...baseBranches]
    : [baseBranches ?? MAIN_BRANCH]

  ensureLocalBranches(branches, cwd)

  if (!branchExists(branches, currentBranch)) {
    branches.push({
      name: currentBranch,
      prerelease:
        currentBranch !== MAIN_BRANCH ? toPrereleaseId(currentBranch) : false,
    })
  }

  let effectiveRepositoryUrl = loadedConfig.repositoryUrl
  if (!repositoryUrl) {
    try {
      effectiveRepositoryUrl = createLocalBareRemote(
        cwd,
        branches,
        currentBranch
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        `Falling back to working copy as repositoryUrl because bare mirror creation failed: ${message}`
      )
      effectiveRepositoryUrl = loadedConfig.repositoryUrl
    }
  }

  // Surface the effective branch list so callers can see what semantic-release will evaluate.
  console.error(
    `Determining next version on branch "${currentBranch}" using repository "${effectiveRepositoryUrl}" and branches:`,
    branches
  )
  console.error(
    `Env: GITHUB_REF=${process.env.GITHUB_REF || ''}, GITHUB_HEAD_REF=${process.env.GITHUB_HEAD_REF || ''}, GITHUB_REF_NAME=${process.env.GITHUB_REF_NAME || ''}`
  )

  const result = await semanticRelease(
    {
      ...loadedConfig,
      branches,
      dryRun: true,
      ci: false,
      repositoryUrl: effectiveRepositoryUrl,
    },
    {
      cwd,
      // Clear notes refs so stray git notes cannot break tag parsing.
      env: {
        ...process.env,
        GIT_NOTES_REF: '',
        GIT_NOTES_DISPLAY_REF: '',
      },
      // Route semantic-release logs to stderr so CLI consumers can safely
      // capture stdout for the version string.
      stdout: process.stderr,
      stderr: process.stderr,
    }
  )

  if (!result) {
    throw new Error(
      'semantic-release did not return a next version (likely branch not eligible or PR/no-CI path). Enable DEBUG=semantic-release:* for more detail.'
    )
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
    if (!process.env.DEBUG) {
      process.env.DEBUG =
        'semantic-release:config,semantic-release:branches,semantic-release:git'
    }
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
