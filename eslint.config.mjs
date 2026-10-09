// ESLint flat config. Replaces the former .eslintrc.yml, script/.eslintrc.yml
// and app/test/.eslintrc.yml.
import { createRequire } from 'node:module'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import jsdoc from 'eslint-plugin-jsdoc'
import json from 'eslint-plugin-json'
import github from 'eslint-plugin-github'
import prettier from 'eslint-config-prettier'

const require = createRequire(import.meta.url)

// The project's own rules live in ./eslint-rules and are namespaced "desktop/".
const desktop = {
  rules: {
    'insecure-random': require('./eslint-rules/insecure-random'),
    'react-no-unbound-dispatcher-props': require('./eslint-rules/react-no-unbound-dispatcher-props'),
    'react-readonly-props-and-state': require('./eslint-rules/react-readonly-props-and-state'),
    'react-proper-lifecycle-methods': require('./eslint-rules/react-proper-lifecycle-methods'),
    'no-loosely-typed-webcontents-ipc': require('./eslint-rules/no-loosely-typed-webcontents-ipc'),
  },
}

const rules = {
  'desktop/insecure-random': 'error',
  'desktop/react-no-unbound-dispatcher-props': 'error',
  'desktop/react-readonly-props-and-state': 'error',
  'desktop/react-proper-lifecycle-methods': 'error',
  'desktop/no-loosely-typed-webcontents-ipc': 'error',
  '@typescript-eslint/naming-convention': [
    'error',
    {
      selector: 'interface',
      format: ['PascalCase'],
      custom: {
        regex: '^I[A-Z]',
        match: true,
      },
    },
    {
      selector: 'class',
      format: ['PascalCase'],
    },
    {
      selector: 'variableLike',
      format: null,
      custom: {
        regex:
          '^(any|Number|number|String|string|Boolean|boolean|Undefined|undefined)$',
        match: false,
      },
    },
  ],
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    {
      assertionStyle: 'as',
    },
  ],
  '@typescript-eslint/no-unused-expressions': 'error',
  '@typescript-eslint/explicit-member-accessibility': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      args: 'none',
      caughtErrors: 'none',
    },
  ],
  '@typescript-eslint/no-use-before-define': [
    'error',
    {
      functions: false,
      variables: false,
      typedefs: false,
    },
  ],
  '@typescript-eslint/member-ordering': [
    'error',
    {
      default: [
        'static-field',
        'static-method',
        'field',
        'abstract-method',
        'constructor',
        'method',
      ],
    },
  ],
  '@typescript-eslint/no-extraneous-class': 'error',
  '@typescript-eslint/no-empty-interface': 'error',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/ban-types': 'off',
  '@typescript-eslint/no-empty-object-type': 'off',
  '@typescript-eslint/no-wrapper-object-types': 'off',
  '@typescript-eslint/no-unsafe-function-type': 'off',
  '@typescript-eslint/no-var-requires': 'off',
  '@typescript-eslint/no-require-imports': 'off',
  '@typescript-eslint/triple-slash-reference': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-inferrable-types': 'off',
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/no-redeclare': 'error',
  'react/jsx-boolean-value': ['error', 'always'],
  'react/jsx-key': 'error',
  'react/jsx-no-bind': 'error',
  'react/no-string-refs': 'error',
  'react/jsx-uses-vars': 'error',
  'react/jsx-uses-react': 'error',
  'react/no-unused-state': 'error',
  'react/no-unused-prop-types': 'error',
  'react/prop-types': [
    'error',
    {
      ignore: ['children'],
    },
  ],
  'jsdoc/check-alignment': 'error',
  'jsdoc/check-tag-names': 'error',
  'jsdoc/check-types': 'error',
  'jsdoc/implements-on-classes': 'error',
  'jsdoc/tag-lines': [
    'error',
    'any',
    {
      startLines: 1,
    },
  ],
  'jsdoc/no-undefined-types': 'error',
  'jsdoc/valid-types': 'error',
  curly: 'error',
  'no-new-wrappers': 'error',
  'no-redeclare': 'off',
  'no-eval': 'error',
  'no-sync': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  strict: ['error', 'global'],
  'no-buffer-constructor': 'error',
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'electron',
          importNames: ['ipcRenderer'],
          message:
            "Please use 'import * as ipcRenderer' from 'ipc-renderer' instead to get strongly typed IPC methods.",
        },
        {
          name: 'electron/renderer',
          importNames: ['ipcRenderer'],
          message:
            "Please use 'import * as ipcRenderer' from 'ipc-renderer' instead to get strongly typed IPC methods.",
        },
        {
          name: 'electron',
          importNames: ['ipcMain'],
          message:
            "Please use 'import * as ipcMain' from 'ipc-main' instead to get strongly typed IPC methods.",
        },
        {
          name: 'electron/main',
          importNames: ['ipcMain'],
          message:
            "Please use 'import * as ipcMain' from 'ipc-main' instead to get strongly typed IPC methods.",
        },
      ],
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: 'ExportDefaultDeclaration',
      message: 'Use of default exports is forbidden',
    },
  ],
  'jsx-a11y/no-autofocus': ['off'],
}

const tsRecommended = tsPlugin.configs['flat/recommended'].reduce(
  (acc, config) => ({ ...acc, ...config.rules }),
  {}
)

export default [
  {
    ignores: ['**/node_modules/**', '.claude/**', 'dist/**', 'out/**'],
  },
  ...[github.getFlatConfigs().react].flat(),
  prettier,
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    settings: { react: { version: 'detect' } },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react,
      jsdoc,
      desktop,
    },
    rules: { ...tsRecommended, ...rules },
  },
  {
    files: ['**/*.d.ts'],
    rules: { strict: ['error', 'never'] },
  },
  {
    files: ['app/test/**/*'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-unused-expressions': 'off',
      strict: 'off',
    },
  },
  {
    files: ['script/**/*'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'unicorn/no-process-exit': 'off',
      'import/no-commonjs': 'off',
    },
  },
  {
    files: ['script/**/jest.config.js'],
    rules: { strict: ['error', 'never'] },
  },
  {
    files: ['app/src/ui/octicons/octicons.generated.ts'],
    rules: { '@typescript-eslint/naming-convention': 'off' },
  },
  {
    files: ['**/*.json'],
    ...json.configs.recommended,
  },
]
