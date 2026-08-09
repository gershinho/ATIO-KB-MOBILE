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
  // Only the non-JSX modules: this project's Babel options carry preset-env
  // alone, which cannot parse JSX during coverage instrumentation.
  collectCoverageFrom: [
    'src/database/**/*.js',
    'src/storage/**/*.js',
    'src/utils/**/*.js',
  ],
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
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/__tests__/setup/svgMock.js',
  },
  collectCoverageFrom: [
    'src/components/**/*.js',
    'src/context/**/*.js',
  ],
};

module.exports = {
  projects: [logicProject, componentProject],

  // Coverage is reported but not gated at a global percentage: most of the
  // remaining uncovered lines are screens that still need component tests, so a
  // global floor would either be set uselessly low or fail on day one. The
  // thresholds below apply only to the pure modules that are already covered,
  // which is where a regression would otherwise go unnoticed.
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    './src/database/paginate.js': { statements: 90, branches: 85, functions: 100, lines: 90 },
    './src/database/likeClause.js': { statements: 90, branches: 85, functions: 100, lines: 90 },
    './src/database/filterQuery.js': { statements: 85, branches: 75, functions: 100, lines: 85 },
    './src/storage/localState.js': { statements: 90, branches: 80, functions: 90, lines: 90 },
    './src/utils/innovationDocument.js': { statements: 85, branches: 75, functions: 100, lines: 85 },
    './src/utils/activeFilterTags.js': { statements: 85, branches: 75, functions: 85, lines: 85 },
  },
};
