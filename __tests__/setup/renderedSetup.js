/**
 * Shared setup for component tests.
 *
 * The app's data layer reaches expo-sqlite, expo-file-system and expo-asset at
 * module scope, and its network layer reaches the backend. Component tests care
 * about rendering and interaction, so those boundaries are mocked here once
 * rather than in every file.
 */
// RNTL 13 ships its jest matchers (toBeOnTheScreen etc.) built in — no
// extend-expect import needed.

// --- Data layer -----------------------------------------------------------
// connection.js opens expo-sqlite and copies the bundled asset at module scope,
// so it is mocked in its own right rather than only through db.js's re-export —
// which is how HomeScreen reaches it now that the half-facade is gone.
jest.mock('../../src/database/connection', () => ({
  initDatabase: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/database/db', () => ({
  getStats: jest.fn().mockResolvedValue({ innovations: 0, countries: 0, sdgs: 17 }),
  getTopRegions: jest.fn().mockResolvedValue([]),
  getChallengeCounts: jest.fn().mockResolvedValue({}),
  getTypeCounts: jest.fn().mockResolvedValue({}),
  searchInnovations: jest.fn().mockResolvedValue([]),
  countInnovations: jest.fn().mockResolvedValue(0),
  getMostAdvancedInnovations: jest.fn().mockResolvedValue([]),
  getHelpInnovations: jest.fn().mockResolvedValue([]),
  getAllCountries: jest.fn().mockResolvedValue([]),
  getDataSources: jest.fn().mockResolvedValue([]),
}));

// The data layer is four modules: connection (opening + schema), db (the
// read-only catalogue), engagement (the only part that writes), and heatmaps
// (derived grids).
jest.mock('../../src/database/engagement', () => ({
  getCachedBullets: jest.fn().mockResolvedValue(null),
  setCachedBullets: jest.fn().mockResolvedValue(undefined),
  getCommentsForInnovation: jest.fn().mockResolvedValue([]),
  addCommentToInnovation: jest.fn().mockResolvedValue(true),
  incrementThumbsUp: jest.fn().mockResolvedValue(true),
  decrementThumbsUp: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/database/heatmaps', () => ({
  getOpportunityHeatmapData: jest.fn().mockResolvedValue({ rows: [], cols: [], cells: {} }),
  getReadyToUseHeatmapData: jest.fn().mockResolvedValue({
    rows: [], cols: [], cells: {}, minReadiness: 0, maxReadiness: 9,
  }),
  resetHeatmapCaches: jest.fn(),
}));

// @expo/vector-icons' Icon mounts with `fontIsLoaded: Font.isLoaded(name)` and,
// when that is false, calls setState from an async componentDidMount. In tests
// that update always lands after the test body, which React reports as an
// unwrapped act() warning attributed to whichever component happened to render
// an icon — noise no test could fix from its own side. Reporting the font as
// already loaded skips the async path; nothing here renders real glyphs anyway.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  isLoaded: () => true,
  loadAsync: jest.fn().mockResolvedValue(undefined),
}));

// --- Network layer --------------------------------------------------------
jest.mock('../../src/services/api', () => ({
  apiOrigin: jest.fn(() => 'http://test.local:3001'),
  IS_DEV_API_HOST: true,
  backendHeaders: jest.fn((extra = {}) => ({ ...extra })),
  aiSearch: jest.fn().mockResolvedValue({ results: [], hasMore: false, total: 0 }),
  transcribeAudio: jest.fn().mockResolvedValue({ text: '' }),
  summarizeBullets: jest.fn().mockResolvedValue(null),
  compareSummary: jest.fn().mockResolvedValue({ summary: 'test summary' }),
}));

jest.mock('../../src/services/aiSummary', () => ({
  generateComparisonSummary: jest.fn().mockResolvedValue({ summary: 'test summary' }),
}));

// --- Native modules -------------------------------------------------------
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    stop: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    uri: null,
  }),
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  },
}));

// expo-file-system's current API is class-based: File/Directory instances with
// synchronous exists/create/write, and a static File.downloadFileAsync.
jest.mock('expo-file-system', () => {
  class MockFile {
    constructor(...segments) {
      this.uri = segments
        .map((segment) => (typeof segment === 'string' ? segment : segment.uri))
        .join('/');
      this.exists = true;
    }
    create = jest.fn();
    write = jest.fn();
    copy = jest.fn();
    delete = jest.fn();
    static downloadFileAsync = jest.fn().mockResolvedValue('file:///test/out');
  }
  class MockDirectory extends MockFile {}
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///test' }, cache: { uri: 'file:///test/cache' } },
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Quieten the app's own diagnostic logging without hiding anything else.
 *
 * The app's logger prefixes every line with a bracketed tag, so those are the
 * ones a test expecting a failure path deliberately produced. Everything else —
 * React's warnings, a deprecation notice, an unexpected throw inside an effect —
 * goes through, because those are how a regression announces itself.
 *
 * console.warn used to be swallowed entirely, which meant an act() warning, a
 * key warning or a deprecation could never be noticed. That is the opposite of
 * what a test suite is for.
 */
const APP_LOG_PREFIX = /^\[/;
const realError = console.error;
const realWarn = console.warn;

function isAppLog(args) {
  return typeof args[0] === 'string' && APP_LOG_PREFIX.test(args[0]);
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (isAppLog(args)) return;
    realError(...args);
  });
  jest.spyOn(console, 'warn').mockImplementation((...args) => {
    if (isAppLog(args)) return;
    realWarn(...args);
  });
});
