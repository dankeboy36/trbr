// @ts-check

import importPlugin from 'eslint-plugin-import'
import prettierPlugin from 'eslint-plugin-prettier'
import neostandard from 'neostandard'

export default [
  ...neostandard({
    semi: false,
    ts: true,
    ignores: ['dist', 'node_modules', '.test_resources', 'coverage'],
  }),
  {
    plugins: {
      import: importPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      camelcase: 'off', // device_id
      curly: 'warn',
      eqeqeq: 'warn',
      '@stylistic/comma-dangle': 'off',
      '@stylistic/no-tabs': 'off',
      '@stylistic/space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
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
  },
]
