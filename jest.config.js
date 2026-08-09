/**
 * Two test projects with different needs:
 *
 * - "logic" runs the pure modules (utils, data, database helpers) in plain Node.
 *   It pins its own inline Babel options with configFile:false so it stays
 *   independent of babel.config.js and starts fast.
 *
 * - "components" runs anything that renders React Native, under jest-expo,
 *   which supplies the RN module mocks and the transformIgnorePatterns needed
 *   to transpile ESM packages inside node_modules.
 *
 * Run everything with `npm test`, or one project with `npm test -- --selectProjects logic`.
 */
const logicProject = {
  displayName: 'logic',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['<rootDir>/__tests__/components/'],
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

const componentProject = {
  displayName: 'components',
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/components/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/componentSetup.js'],
};

module.exports = {
  projects: [logicProject, componentProject],
};
