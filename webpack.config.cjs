// @ts-check

const path = require('node:path')

const webpack = require('webpack')

const babelConfig = require('./babel.config.cjs')

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    cli: path.join(__dirname, 'src', 'cli', 'index.js'),
    lib: path.join(__dirname, 'src', 'lib', 'index.js'),
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: path.join('[name]', '[name].cjs'),
    libraryTarget: 'commonjs2',
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
  ],
}
