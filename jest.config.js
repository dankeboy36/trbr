const slowJestConfig = require('./jest.config.slow')

const collectCoverageFrom = ['src/*.js']
slowJestConfig.testMatch?.forEach((glob) =>
  collectCoverageFrom.push(`!${glob}`)
)

/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom,
  testMatch: ['**/*.test.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  testEnvironment: 'node',
}
