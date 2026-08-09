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
  transform: {
    '^.+\\.js$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          // Only so the coverage pass can *parse* the JSX files it reports as
          // 0%. Nothing in this project renders; without it, instrumenting
          // src/screens throws and the whole run fails.
          ['@babel/preset-react', { runtime: 'automatic' }],
        ],
      },
    ],
  },
};

const renderedProject = {
  displayName: 'rendered',
  preset: 'jest-expo',
  // Above the 5s default. These suites mount real provider trees and drain
  // several effect ticks; under coverage instrumentation, or on a loaded
  // machine, that can cross 5s. A timeout there fails the run before the
  // coverageThreshold gates below are ever evaluated, so the gates silently
  // stop enforcing anything exactly when the suite is under stress.
  testTimeout: 20000,
  testMatch: ['<rootDir>/__tests__/rendered/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/renderedSetup.js'],
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/__tests__/setup/svgMock.js',
  },
};

module.exports = {
  projects: [logicProject, renderedProject],

  // Top level, not per project. Declared inside each project it silently did
  // nothing for the untested-file pass: files matching the glob but reached by
  // no test were omitted from the report rather than reported at 0%, so the
  // headline read 67.5% when the real figure over src/ was 52.9%. A coverage
  // number that hides what is uncovered is worse than no number.
  collectCoverageFrom: [
    'src/**/*.js',
    'shared/**/*.js',
    '!src/data/**',
  ],

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
