/* eslint-disable no-template-curly-in-string */
/** @type {import('semantic-release').Options} */
export default {
  tagFormat: '${version}',
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'bin/*.zip',
          },
        ],
      },
    ],
    '@semantic-release/git',
    [
      '@semantic-release/exec',
      {
        publishCmd:
          'echo "release_version=${nextRelease.version}" >> $GITHUB_OUTPUT',
      },
    ],
  ],
}
