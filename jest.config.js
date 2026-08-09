/**
 * Two test projects with different needs:
 *
 * - "logic" runs the pure modules (utils, data, database helpers) in plain Node.
 *   It pins its own inline Babel options with configFile:false so it stays
 *   independent of babel.config.js and starts fast.
 *
 * - "rendered" runs anything that needs a React renderer — screens, hooks and
 *   components alike — under jest-expo, which supplies the RN module mocks and
 *   the transformIgnorePatterns needed to transpile ESM packages inside
 *   node_modules. Membership is decided by "needs a renderer", not by which
 *   source directory the subject lives in; the folder was called
 *   __tests__/components/ while holding mostly screens and hooks, so a developer had
 *   to already know the rule to place a new file correctly — and a file placed
 *   in __tests__/ root instead runs silently under Node with RN unmocked.
 *
 * Run everything with `npm test`, or one project with `npm test -- --selectProjects logic`.
 */
const logicProject = {
  displayName: 'logic',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['<rootDir>/__tests__/rendered/'],
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

const renderedProject = {
  displayName: 'rendered',
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/rendered/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/renderedSetup.js'],
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/__tests__/setup/svgMock.js',
  },
  collectCoverageFrom: [
    'src/components/**/*.js',
    'src/context/**/*.js',
  ],
};

module.exports = {
  projects: [logicProject, renderedProject],

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
