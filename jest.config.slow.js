/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['**/*.slow-test.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  testEnvironment: 'node',
  testTimeout: 60_000,
  maxConcurrency: 1, // Do not stress-test Arduino's resources
}
