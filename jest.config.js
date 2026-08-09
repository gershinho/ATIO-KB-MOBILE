/**
 * Jest config for the pure-logic modules in src/ (no React Native renderer).
 *
 * The babel options are inlined with `babelrc: false, configFile: false` on
 * purpose: adding a babel.config.js at the repo root would override Expo's
 * built-in Metro preset and break the app bundle. This keeps test transpiling
 * entirely separate from the RN build.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  transform: {
    '^.+\\.js$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      },
    ],
  },
};
