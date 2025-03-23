/** @type {import('@babel/core').TransformOptions} */

module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: '22' } }],
    '@babel/preset-react',
  ],
}
