/** @type {import('eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  parser: '@babel/eslint-parser',
  env: {
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  plugins: ['import', 'prettier'],
  extends: ['prettier', 'prettier/standard'],
  rules: {
    curly: 'warn',
    eqeqeq: 'warn',
    'no-throw-literal': 'warn',
    semi: 'off',
    'prettier/prettier': 'warn',
    'import/first': 'error',
    'import/order': [
      'error',
      {
        'newlines-between': 'always',
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index'],
        ],
      },
    ],
    'import/newline-after-import': 'error',
  },
  ignorePatterns: ['dist'],
}
