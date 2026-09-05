import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const releaseFiles = ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'];
const labFiles = ['src/labs/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.aiox/**',
      '.aiox-core/**',
      '.codex/**',
      '.playwright-mcp/**',
      'scratch/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: releaseFiles,
    ignores: ['src/labs/**'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      'no-empty': 'warn',
      'no-debugger': 'error',
      'no-useless-assignment': 'warn',
      'prefer-const': 'off',
    },
  },
  {
    files: labFiles,
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      'no-empty': 'warn',
      'no-debugger': 'error',
      'no-useless-assignment': 'warn',
      'prefer-const': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
);
