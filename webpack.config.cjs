// @ts-check

const fs = require('node:fs')
const path = require('node:path')

const babelConfig = require('./babel.config.cjs')

/** @typedef {'commonjs2' | 'module'} LibraryTarget */

/** @param {LibraryTarget} libraryTarget */
// Assumes that type bundling is completed before webpack execution
function createIndexDtsPlugin(libraryTarget) {
  return {
    apply: (/** @type {import('webpack').Compiler} */ compiler) => {
      compiler.hooks.done.tap('CreateIndexDts', () => {
        if (libraryTarget === 'module') {
          // Nothing to do, the index.d.ts file is already created
          return
        }

        const srcFile = path.join(__dirname, 'dist', 'lib', 'index.d.ts')
        const destDir = path.join(__dirname, 'dist', 'lib', 'index.d.cts')

        fs.copyFileSync(srcFile, destDir)
      })
    },
  }
}

/**
 * @param {LibraryTarget} libraryTarget
 * @returns {import('webpack').Configuration}
 */
function createConfig(libraryTarget) {
  const ext = libraryTarget === 'module' ? 'mjs' : 'cjs'
  const entry = {
    lib: path.join(__dirname, 'src', 'lib', 'index.js'),
  }
  if (libraryTarget === 'commonjs2') {
    entry.cli = path.join(__dirname, 'src', 'cli', 'index.js')
  }

  return {
    entry,
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: path.join('[name]', `[name].${ext}`),
      library: {
        type: libraryTarget,
      },
    },
    target: 'node',
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              ...babelConfig,
            },
          },
        },
        {
          test: /\.json$/,
          type: 'json',
        },
      ],
    },
    resolve: {
      extensions: ['.js'],
    },
    plugins: [createIndexDtsPlugin(libraryTarget)],
    experiments: {
      outputModule: libraryTarget === 'module',
    },
  }
}

module.exports = {
  cjs: createConfig('commonjs2'),
  esm: createConfig('module'),
}
