import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-restricted-syntax': [
        'warn',

        {
          selector:
            'CallExpression:matches(' +
            '  [callee.property.name="toString"],' +
            '  [callee.property.name="toDateString"],' +
            '  [callee.property.name="toTimeString"],' +
            '  [callee.property.name="toUTCString"],' +
            '  [callee.property.name="toGMTString"]' +
            ')',
          message:
            'Use locale-based date formatting instead of Date string methods.',
        },
        {
          selector:
            'ChainExpression CallExpression:matches(' +
            '  [callee.property.name="toString"],' +
            '  [callee.property.name="toDateString"],' +
            '  [callee.property.name="toTimeString"],' +
            '  [callee.property.name="toUTCString"],' +
            '  [callee.property.name="toGMTString"]' +
            ')',
          message:
            'Use locale-based date formatting instead of Date string methods.',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn'
    },
  }
  ,
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
  }
);
