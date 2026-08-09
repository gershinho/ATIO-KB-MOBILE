// Flat config for ESLint 9. eslint-config-expo covers React, React Hooks and
// React Native rules for an Expo project.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      'assets/**',
      'backend/node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'scorecard.png',
    ],
  },
  {
    // react/no-unescaped-entities is a react-dom rule. React Native does not
    // decode HTML entities, so "fixing" `don't` to `don&apos;t` inside <Text>
    // renders the literal characters &apos; on screen. Off on purpose.
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // The backend is plain Node CommonJS, not React Native.
    files: ['backend/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        module: 'writable',
        require: 'readonly',
        exports: 'writable',
      },
    },
  },
  {
    files: ['__tests__/**/*.js', 'backend/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
  },
];
