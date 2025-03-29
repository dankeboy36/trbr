// @ts-check

const path = require('node:path')
const fs = require('fs')

const webpack = require('webpack')

const babelConfig = require('./babel.config.cjs')

/**
 * @typedef {'commonjs2'|'module'} LibraryTarget
 */

/** @param {LibraryTarget} libraryTarget */
function createCopyPlugin(libraryTarget) {
  const filename = libraryTarget === 'module' ? 'index.d.ts' : 'index.d.cts'
  return {
    apply: (/** @type {import('webpack').Compiler} */ compiler) => {
      compiler.hooks.done.tap('CopyPlugin', () => {
        const srcFile = path.join(__dirname, 'src', 'index.d.ts')
        const destDir = path.join(__dirname, 'dist', 'lib', filename)

        fs.copyFileSync(srcFile, destDir)
      })
    },
  }
}

/**
 * @param {'commonjs2'|'module'} libraryTarget
 * @returns {import('webpack').EntryPlugin}
 */
function createConfig(libraryTarget) {
  const ext = libraryTarget === 'module' ? 'mjs' : 'cjs'
  return {
    entry: {
      lib: path.join(__dirname, 'src', 'lib', 'index.js'),
      cli: path.join(__dirname, 'src', 'cli', 'index.js'),
    },
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
      createCopyPlugin(libraryTarget),
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
