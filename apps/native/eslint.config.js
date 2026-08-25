import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Lint config for the Expo/React Native app.
 *
 * Mirrors `apps/web/eslint.config.js`, plus the React and React-Hooks rules
 * that matter here: this app is all hooks, and a missing dependency shows up
 * as a stale render or a refetch loop rather than a type error.
 */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        // React Native's runtime globals: timers, fetch, console, __DEV__.
        ...globals.browser,
        __DEV__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // `const { a, ...rest } = obj` to omit a key is a normal idiom here.
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',

      // The new JSX transform means React need not be in scope, and prop
      // types are TypeScript's job.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    // Tests reach into mocks and partial fixtures, where `any` and
    // `require()` are the pragmatic choice.
    files: ['__tests__/**/*.{ts,tsx}', '__mocks__/**/*.{ts,tsx}', 'jest.setup.ts'],
    languageOptions: {
      globals: { ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'android/',
      'ios/',
      '.expo/',
      'dist/',
      '*.config.js',
      'babel.config.js',
    ],
  }
);
