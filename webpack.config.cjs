// @ts-check

const fs = require('node:fs')
const path = require('node:path')

const webpack = require('webpack')

const babelConfig = require('./babel.config.cjs')

/**
 * @typedef {'commonjs2'|'module'} LibraryTarget
 */

/** @param {LibraryTarget} libraryTarget */
function createCopyDTSPlugin(libraryTarget) {
  const filename = libraryTarget === 'module' ? 'index.d.ts' : 'index.d.cts'
  return {
    apply: (/** @type {import('webpack').Compiler} */ compiler) => {
      compiler.hooks.done.tap('CopyDTS', () => {
        const srcFile = path.join(__dirname, 'src', 'index.d.ts')
        const destDir = path.join(__dirname, 'dist', 'lib', filename)

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
    plugins: [
      new webpack.IgnorePlugin({
        resourceRegExp: /devtools\.js$/, // Ignore devtools.js in ink (https://github.com/vadimdemedes/ink/issues/650)
      }),
      createCopyDTSPlugin(libraryTarget),
    ],
    experiments: {
      outputModule: libraryTarget === 'module',
    },
  }
}

module.exports = {
  cjs: createConfig('commonjs2'),
  esm: createConfig('module'),
}
